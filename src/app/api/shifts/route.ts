import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { getJakartaStartOfDay } from "@/lib/date-jakarta";
import { formatRupiah } from "@/lib/format";
import { getActiveShiftForUser } from "@/lib/queries/shift";
import { getRoomCounterRecords, getRoomCountersWithLiveStatus } from "@/lib/queries/counters";
import { DEFAULT_COUNTER_ID, DEFAULT_COUNTER_NAME } from "@/lib/counters";
import {
  computeDenominationTotal,
  computeOperationalExpenseTotal,
  evaluateHandoverSync,
  evaluateShiftAudit,
  normalizeDenominations,
  normalizeOperationalExpenses,
} from "@/lib/shift-session";
import { z } from "zod";

const legacyClosingSchema = z.object({
  actualCashTotal: z.number().int().min(0, "Nominal uang tunai tidak boleh negatif"),
  actualDigitalTotal: z.number().int().min(0, "Nominal pembayaran digital tidak boleh negatif"),
  notes: z.string().trim().max(500).optional(),
});

const openShiftSchema = z.object({
  action: z.literal("OPEN"),
  counterId: z.string().trim().min(1).max(60).optional(),
  denominations: z.record(z.string(), z.number().int().min(0).max(100000)),
  openingNote: z.string().trim().max(500).optional(),
  readyConfirmed: z.boolean().refine((v) => v === true, {
    message: "Centang konfirmasi kesiapan sebelum membuka shift.",
  }),
});

const operationalExpenseSchema = z.object({
  description: z.string().trim().max(150),
  amount: z.number().int().min(0),
});

const closeShiftSchema = z.object({
  action: z.literal("CLOSE"),
  shiftId: z.string().trim().min(1).optional(),
  denominations: z.record(z.string(), z.number().int().min(0).max(100000)),
  operationalExpenses: z.array(operationalExpenseSchema).max(25).optional(),
  closingNote: z.string().trim().max(500).optional(),
  honestyConfirmed: z.boolean().refine((v) => v === true, {
    message: "Centang konfirmasi kejujuran perhitungan sebelum menutup shift.",
  }),
});

function parseJsonOrNull<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function aggregateSalesForShift(
  params: {
    roomId: string;
    cashierId: string;
    admin: boolean;
    since: Date;
    shiftId?: string;
    forceOwnCashier?: boolean;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const scopeRoomWide = params.admin && !params.forceOwnCashier;
  const sales = await db.sale.findMany({
    where: params.shiftId
      ? {
          roomId: params.roomId,
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
          OR: [
            { shiftId: params.shiftId },
            {
              shiftId: null,
              cashierId: params.cashierId,
              createdAt: { gte: params.since },
            },
          ],
        }
      : scopeRoomWide
      ? {
          roomId: params.roomId,
          createdAt: { gte: params.since },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        }
      : {
          roomId: params.roomId,
          cashierId: params.cashierId,
          createdAt: { gte: params.since },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        },
  });

  let systemCashTotal = 0;
  let systemQrisTotal = 0;
  let systemTransferTotal = 0;
  let systemCardTotal = 0;

  for (const s of sales) {
    if (s.paymentMethod === "TUNAI") systemCashTotal += s.totalAmount;
    else if (s.paymentMethod === "QRIS") systemQrisTotal += s.totalAmount;
    else if (s.paymentMethod === "TRANSFER") systemTransferTotal += s.totalAmount;
    else if (s.paymentMethod === "KARTU") systemCardTotal += s.totalAmount;
  }

  const systemDigitalTotal = systemQrisTotal + systemTransferTotal + systemCardTotal;
  const systemGrandTotal = systemCashTotal + systemDigitalTotal;

  return {
    systemTxCount: sales.length,
    systemCashTotal,
    systemQrisTotal,
    systemTransferTotal,
    systemCardTotal,
    systemDigitalTotal,
    systemGrandTotal,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView =
      (await checkUserPermission(user.role, "penjualan", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view"));
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses fitur shift kasir." },
        { status: 403 }
      );
    }

    const url = request?.url ? new URL(request.url) : null;
    const includeAudit = url?.searchParams.get("includeAudit") === "1";
    const startOfToday = getJakartaStartOfDay();
    const admin = isStoreAdmin(user.role);

    const [activeShift, counters, todayAgg, closingsRaw] = await Promise.all([
      getActiveShiftForUser(user.roomId, user.id),
      getRoomCountersWithLiveStatus(user.roomId),
      admin
        ? aggregateSalesForShift({
            roomId: user.roomId,
            cashierId: user.id,
            admin,
            since: startOfToday,
          })
        : Promise.resolve(null),
      prisma.shift.findMany({
        where: admin
          ? { roomId: user.roomId, status: { not: "AKTIF" } }
          : { roomId: user.roomId, userId: user.id, status: { not: "AKTIF" } },
        include: {
          user: { select: { id: true, name: true, username: true, role: true } },
          counter: { select: { slug: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

    const closings = closingsRaw.map((row) => {
      const base = {
        id: row.id,
        shiftDate: row.closedAt ?? row.openedAt,
        actualCashTotal: row.closingCashTotal ?? 0,
        actualDigitalTotal: row.actualDigitalTotal,
        notes: row.closingNote ?? null,
        createdAt: row.createdAt,
        cashier: {
          id: row.user.id,
          name: row.user.name,
          role: row.user.role,
        },
      };

      if (!admin) {
        return base;
      }

      return {
        ...base,
        systemTxCount: row.systemTxCount,
        systemCashTotal: row.systemCashTotal,
        systemQrisTotal: row.systemQrisTotal,
        systemTransferTotal: row.systemTransferTotal,
        systemCardTotal: row.systemCardTotal,
        systemGrandTotal: row.systemGrandTotal,
      };
    });

    const auditShifts =
      admin && includeAudit
        ? closingsRaw.map((row) => {
            const systemDigitalTotal =
              row.systemQrisTotal + row.systemTransferTotal + row.systemCardTotal;
            return {
              id: row.id,
              counterId: row.counter?.slug || row.counterSlug || DEFAULT_COUNTER_ID,
              counterName: row.counter?.name || row.counterName || DEFAULT_COUNTER_NAME,
              openedAt: row.openedAt.toISOString(),
              closedAt: (row.closedAt ?? row.createdAt).toISOString(),
              cashier: row.user,
              status: row.status,
              openingCashTotal: row.openingCashTotal,
              openingDenominations: parseJsonOrNull(row.openingDenominationsJson),
              openingNote: row.openingNote ?? null,
              closingDenominations: parseJsonOrNull(row.closingDenominationsJson),
              closingNote: row.closingNote ?? null,
              operationalExpenses: parseJsonOrNull(row.operationalExpensesJson) ?? [],
              operationalExpenseTotal: row.operationalExpenseTotal,
              systemTxCount: row.systemTxCount,
              systemCashTotal: row.systemCashTotal,
              systemQrisTotal: row.systemQrisTotal,
              systemTransferTotal: row.systemTransferTotal,
              systemCardTotal: row.systemCardTotal,
              systemDigitalTotal,
              systemGrandTotal: row.systemGrandTotal,
              expectedCashAtClose:
                row.expectedCashAtClose ??
                row.openingCashTotal + row.systemCashTotal - row.operationalExpenseTotal,
              actualCashTotal: row.closingCashTotal ?? 0,
              cashDifference: row.cashDifference,
              handoverSyncStatus: row.handoverSyncStatus,
              handoverDifference: row.handoverDifference,
              previousShiftClosingCash: row.previousShiftClosingCash ?? null,
            };
          })
        : undefined;

    return NextResponse.json({
      activeShift,
      counters,
      summary: todayAgg,
      closings,
      ...(auditShifts ? { auditShifts } : {}),
    });
  } catch (err) {
    return handleApiError(err, "/api/shifts", "Gagal memuat data shift kasir.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canOperateShift =
      (await checkUserPermission(user.role, "penjualan", "create")) ||
      (await checkUserPermission(user.role, "kasir", "create"));
    if (!canOperateShift) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengelola shift kasir." },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 1. BUKA SHIFT BARU (Model Shift & Counter sungguhan + Exclusive Per-Loket Lock)
    if (body && body.action === "OPEN") {
      const parsed = openShiftSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data buka shift tidak valid." },
          { status: 400 }
        );
      }

      const roomCounters = await getRoomCounterRecords(user.roomId);
      const requestedCounterId = parsed.data.counterId?.trim();
      if (roomCounters.length > 1 && !requestedCounterId) {
        return NextResponse.json(
          { error: "Pilih loket terlebih dahulu sebelum membuka shift." },
          { status: 400 }
        );
      }

      const targetCounter =
        roomCounters.length === 1 && !requestedCounterId
          ? roomCounters[0]
          : roomCounters.find(
              (c) => c.id === requestedCounterId || c.dbId === requestedCounterId
            );

      if (!targetCounter) {
        return NextResponse.json(
          { error: "Loket yang dipilih tidak ditemukan pada perusahaan ini." },
          { status: 400 }
        );
      }

      const openingDenominations = normalizeDenominations(parsed.data.denominations);
      const openingCashTotal = computeDenominationTotal(openingDenominations);
      const openingNote = parsed.data.openingNote?.trim() || null;
      const openedAt = new Date();
      const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");

      const openResult = await prisma.$transaction(
        async (tx) => {
          const activeShifts = await tx.shift.findMany({
            where: { roomId: user.roomId, status: "AKTIF" },
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { openedAt: "desc" },
          });

          const ownActive = activeShifts.find((s) => s.userId === user.id);
          if (ownActive) {
            throw new Error(
              `CONFLICT:Anda masih memiliki shift aktif di ${ownActive.counterName || DEFAULT_COUNTER_NAME} yang belum ditutup.`
            );
          }

          const occupyingShift = activeShifts.find(
            (s) => s.counterId === targetCounter.dbId || s.counterSlug === targetCounter.id
          );

          if (occupyingShift) {
            throw new Error(
              `CONFLICT:${targetCounter.name} sedang digunakan oleh ${occupyingShift.user.name}. Satu loket tidak dapat digunakan bersamaan hingga tutup shift.`
            );
          }

          const previousCounterClosed = await tx.shift.findFirst({
            where: {
              roomId: user.roomId,
              status: { not: "AKTIF" },
              OR: [
                { counterId: targetCounter.dbId },
                { counterSlug: targetCounter.id },
              ],
            },
            orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
            select: { id: true, closingCashTotal: true },
          });

          const handover = evaluateHandoverSync(
            openingCashTotal,
            previousCounterClosed?.closingCashTotal ?? null
          );

          const shift = await tx.shift.create({
            data: {
              roomId: user.roomId,
              userId: user.id,
              counterId: targetCounter.dbId,
              counterSlug: targetCounter.id,
              counterName: targetCounter.name,
              openedAt,
              status: "AKTIF",
              openingCashTotal,
              openingDenominationsJson: JSON.stringify(openingDenominations),
              openingNote,
              previousShiftId: previousCounterClosed?.id ?? null,
              previousShiftClosingCash: previousCounterClosed?.closingCashTotal ?? null,
              handoverSyncStatus: handover.handoverSyncStatus,
              handoverDifference: handover.handoverDifference,
            },
            select: {
              id: true,
              userId: true,
              openedAt: true,
              status: true,
              user: { select: { name: true, role: true } },
            },
          });

          const lockCount = await tx.shift.count({
            where: {
              roomId: user.roomId,
              status: "AKTIF",
              OR: [
                { counterId: targetCounter.dbId },
                { counterSlug: targetCounter.id },
              ],
            },
          });

          if (lockCount > 1) {
            throw new Error(
              `CONFLICT:${targetCounter.name} baru saja dikunci kasir lain. Pilih loket lain yang tersedia.`
            );
          }

          await recordAuditLog(
            {
              roomId: user.roomId,
              actorId: user.id,
              actorName: user.name,
              actorRole: user.role,
              actionType: "PENJUALAN",
              actionSummary: `Buka Shift di ${targetCounter.name} oleh ${user.name} dengan modal awal ${formatRupiah(openingCashTotal)}`,
              entityType: "Shift",
              entityId: shift.id,
              afterData: {
                counterId: targetCounter.id,
                counterName: targetCounter.name,
                openingCashTotal,
                handoverSyncStatus: handover.handoverSyncStatus,
                handoverDifference: handover.handoverDifference,
                openingNote,
              },
              approvalState: "TERCATAT",
              linkUrl: "/laporan#audit-shift",
            },
            tx
          );

          if (handover.handoverSyncStatus === "TIDAK_SINKRON") {
            const diffLabel = formatRupiah(Math.abs(handover.handoverDifference));
            const direction = handover.handoverDifference > 0 ? "lebih tinggi" : "lebih rendah";
            await createNotification(
              {
                roomId: user.roomId,
                title: `Modal Awal ${targetCounter.name} Tidak Sinkron`,
                message: `${user.name} membuka ${targetCounter.name} dengan modal ${direction} ${diffLabel} dibanding kas akhir shift sebelumnya di loket tersebut.`,
                severity: "WARNING",
                category: "SHIFT",
                targetRole: "PEMILIK",
                linkUrl: "/laporan#audit-shift",
              },
              tx
            );
          }

          return { shift, handover };
        },
        isPostgres
          ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }
          : undefined
      );

      return NextResponse.json(
        {
          activeShift: {
            id: openResult.shift.id,
            counterId: targetCounter.id,
            counterName: targetCounter.name,
            cashierId: openResult.shift.userId,
            cashierName: openResult.shift.user.name,
            cashierRole: openResult.shift.user.role,
            openedAt: openedAt.toISOString(),
            openingCashTotal,
            openingDenominations,
            openingNote,
            handoverSyncStatus: openResult.handover.handoverSyncStatus,
            status: "AKTIF" as const,
          },
        },
        { status: 201 }
      );
    }

    // 2. TUTUP SHIFT BUTA (Blind Shift Closing)
    if (body && body.action === "CLOSE") {
      const parsed = closeShiftSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data tutup shift tidak valid." },
          { status: 400 }
        );
      }

      const closingDenominations = normalizeDenominations(parsed.data.denominations);
      const actualCashTotal = computeDenominationTotal(closingDenominations);
      const operationalExpenses = normalizeOperationalExpenses(parsed.data.operationalExpenses);
      const operationalExpenseTotal = computeOperationalExpenseTotal(operationalExpenses);
      const closingNote = parsed.data.closingNote?.trim() || null;
      const admin = isStoreAdmin(user.role);
      const closedAt = new Date();

      const closeResult = await prisma.$transaction(async (tx) => {
        const activeRow = await tx.shift.findFirst({
          where: parsed.data.shiftId
            ? { id: parsed.data.shiftId, roomId: user.roomId, userId: user.id, status: "AKTIF" }
            : { roomId: user.roomId, userId: user.id, status: "AKTIF" },
          orderBy: { openedAt: "desc" },
          include: {
            user: { select: { id: true, name: true, role: true } },
            counter: { select: { slug: true, name: true } },
          },
        });

        if (!activeRow) {
          throw new Error("NOT_FOUND:Tidak ada shift aktif untuk ditutup.");
        }

        const counterId = activeRow.counter?.slug || activeRow.counterSlug || DEFAULT_COUNTER_ID;
        const counterName =
          activeRow.counter?.name || activeRow.counterName || DEFAULT_COUNTER_NAME;
        const openedAtDate = activeRow.openedAt;
        const openingCashTotal = activeRow.openingCashTotal;

        const shiftAgg = await aggregateSalesForShift(
          {
            roomId: user.roomId,
            cashierId: user.id,
            admin,
            since: openedAtDate,
            shiftId: activeRow.id,
            forceOwnCashier: true,
          },
          tx
        );

        const audit = evaluateShiftAudit({
          openingCashTotal,
          systemCashTotal: shiftAgg.systemCashTotal,
          actualCashTotal,
          operationalExpenseTotal,
        });

        const claim = await tx.shift.updateMany({
          where: {
            id: activeRow.id,
            roomId: user.roomId,
            userId: user.id,
            status: "AKTIF",
          },
          data: {
            closedAt,
            status: audit.status,
            closingCashTotal: actualCashTotal,
            actualDigitalTotal: shiftAgg.systemDigitalTotal,
            operationalExpenseTotal,
            expectedCashAtClose: audit.expectedCashAtClose,
            cashDifference: audit.cashDifference,
            systemTxCount: shiftAgg.systemTxCount,
            systemCashTotal: shiftAgg.systemCashTotal,
            systemQrisTotal: shiftAgg.systemQrisTotal,
            systemTransferTotal: shiftAgg.systemTransferTotal,
            systemCardTotal: shiftAgg.systemCardTotal,
            systemGrandTotal: shiftAgg.systemGrandTotal,
            closingDenominationsJson: JSON.stringify(closingDenominations),
            operationalExpensesJson: JSON.stringify(operationalExpenses),
            closingNote,
          },
        });

        if (claim.count !== 1) {
          throw new Error("CONFLICT:Shift ini sudah ditutup sebelumnya.");
        }

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PENJUALAN",
            actionSummary: `Tutup Shift di ${counterName} oleh ${user.name} (${shiftAgg.systemTxCount} transaksi, kas dihitung ${formatRupiah(actualCashTotal)}, operasional ${formatRupiah(operationalExpenseTotal)})`,
            entityType: "Shift",
            entityId: activeRow.id,
            afterData: {
              counterId,
              counterName,
              openingCashTotal,
              systemTxCount: shiftAgg.systemTxCount,
              systemCashTotal: shiftAgg.systemCashTotal,
              operationalExpenseTotal,
              expectedCashAtClose: audit.expectedCashAtClose,
              actualCashTotal,
              cashDifference: audit.cashDifference,
              auditStatus: audit.status,
              closingNote,
            },
            approvalState: audit.status === "PERLU_DIPERIKSA" ? "PERLU_PERBAIKAN" : "TERCATAT",
            linkUrl: "/laporan#audit-shift",
          },
          tx
        );

        if (audit.status === "PERLU_DIPERIKSA") {
          const diffLabel = formatRupiah(audit.absDiff);
          const direction = audit.cashDifference < 0 ? "Kurang" : "Lebih";
          await createNotification(
            {
              roomId: user.roomId,
              title: `Selisih Kas ${counterName} Terdeteksi`,
              message: `Shift ${user.name} di ${counterName} memiliki selisih kas ${direction} ${diffLabel}. Segera tinjau di Audit Shift Laporan.`,
              severity: "CRITICAL",
              category: "SHIFT",
              targetRole: "PEMILIK",
              linkUrl: "/laporan#audit-shift",
            },
            tx
          );
        }

        return {
          id: activeRow.id,
          counterId,
          counterName,
          openedAtDate,
          openingCashTotal,
          cashier: activeRow.user,
        };
      });

      return NextResponse.json(
        {
          closing: {
            id: closeResult.id,
            counterId: closeResult.counterId,
            counterName: closeResult.counterName,
            openedAt: closeResult.openedAtDate.toISOString(),
            closedAt: closedAt.toISOString(),
            openingCashTotal: closeResult.openingCashTotal,
            actualCashTotal,
            operationalExpenseTotal,
            operationalExpenses,
            closingDenominations,
            closingNote,
            status: "TERCATAT",
            cashier: closeResult.cashier,
          },
        },
        { status: 201 }
      );
    }

    // 3. JALUR KOMPATIBILITAS LEGACY (tanpa action) -> tercatat pada model Shift
    const parsed = legacyClosingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tutup shift tidak valid" },
        { status: 400 }
      );
    }

    const startOfToday = getJakartaStartOfDay();
    const admin = isStoreAdmin(user.role);
    const todayAgg = await aggregateSalesForShift({
      roomId: user.roomId,
      cashierId: user.id,
      admin,
      since: startOfToday,
    });

    const { actualCashTotal, actualDigitalTotal, notes } = parsed.data;
    const recordedGrandTotal = actualCashTotal + actualDigitalTotal;
    const closedAt = new Date();
    const roomCounters = await getRoomCounterRecords(user.roomId);
    const defaultCounter = roomCounters[0];

    const closing = await prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: {
          roomId: user.roomId,
          userId: user.id,
          counterId: defaultCounter?.dbId ?? null,
          counterSlug: defaultCounter?.id ?? DEFAULT_COUNTER_ID,
          counterName: defaultCounter?.name ?? DEFAULT_COUNTER_NAME,
          openedAt: startOfToday,
          closedAt,
          status: "TERCATAT",
          openingCashTotal: 0,
          closingCashTotal: actualCashTotal,
          actualDigitalTotal,
          systemTxCount: todayAgg.systemTxCount,
          systemCashTotal: todayAgg.systemCashTotal,
          systemQrisTotal: todayAgg.systemQrisTotal,
          systemTransferTotal: todayAgg.systemTransferTotal,
          systemCardTotal: todayAgg.systemCardTotal,
          systemGrandTotal: todayAgg.systemGrandTotal,
          closingNote: notes?.trim() || null,
        },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENJUALAN",
          actionSummary: `Tutup Shift oleh ${user.name} (${todayAgg.systemTxCount} transaksi, total pencatatan Rp ${recordedGrandTotal})`,
          entityType: "Shift",
          entityId: created.id,
          afterData: {
            systemTxCount: todayAgg.systemTxCount,
            systemGrandTotal: todayAgg.systemGrandTotal,
            actualCashTotal,
            actualDigitalTotal,
            recordedGrandTotal,
            notes: created.closingNote,
          },
          approvalState: "TERCATAT",
          linkUrl: "/penjualan",
        },
        tx
      );

      return {
        id: created.id,
        shiftDate: created.closedAt ?? created.openedAt,
        systemTxCount: created.systemTxCount,
        systemCashTotal: created.systemCashTotal,
        systemQrisTotal: created.systemQrisTotal,
        systemTransferTotal: created.systemTransferTotal,
        systemCardTotal: created.systemCardTotal,
        systemGrandTotal: created.systemGrandTotal,
        actualCashTotal: created.closingCashTotal ?? 0,
        actualDigitalTotal: created.actualDigitalTotal,
        notes: created.closingNote,
        createdAt: created.createdAt,
        cashier: created.user,
      };
    });

    return NextResponse.json({ closing }, { status: 201 });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2034"
    ) {
      return NextResponse.json(
        { error: "Loket baru saja dikunci oleh transaksi kasir lain. Silakan muat ulang status loket." },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: message.slice(10) }, { status: 404 });
    }
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9) }, { status: 409 });
    }
    return handleApiError(err, "/api/shifts", "Gagal menyimpan data shift kasir.");
  }
}
