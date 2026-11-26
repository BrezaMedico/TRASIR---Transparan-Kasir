import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { getJakartaStartOfDay } from "@/lib/date-jakarta";
import { formatRupiah } from "@/lib/format";
import { getActiveShiftForUser } from "@/lib/queries/shift";
import { getRoomCounters, getRoomCountersWithLiveStatus } from "@/lib/queries/counters";
import { DEFAULT_COUNTER_ID, DEFAULT_COUNTER_NAME } from "@/lib/counters";
import {
  computeDenominationTotal,
  computeOperationalExpenseTotal,
  evaluateHandoverSync,
  evaluateShiftAudit,
  normalizeDenominations,
  normalizeOperationalExpenses,
  parseShiftEnvelope,
  serializeShiftEnvelope,
  ShiftEnvelope,
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

async function aggregateSalesSince(
  params: {
    roomId: string;
    cashierId: string;
    admin: boolean;
    since: Date;
    forceOwnCashier?: boolean;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const scopeRoomWide = params.admin && !params.forceOwnCashier;
  const sales = await db.sale.findMany({
    where: scopeRoomWide
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
        ? aggregateSalesSince({
            roomId: user.roomId,
            cashierId: user.id,
            admin,
            since: startOfToday,
          })
        : Promise.resolve(null),
      prisma.shiftClosing.findMany({
        where: admin
          ? { roomId: user.roomId, status: { not: "AKTIF" } }
          : { roomId: user.roomId, cashierId: user.id, status: { not: "AKTIF" } },
        select: {
          id: true,
          shiftDate: true,
          systemTxCount: true,
          systemCashTotal: true,
          systemQrisTotal: true,
          systemTransferTotal: true,
          systemCardTotal: true,
          systemGrandTotal: true,
          actualCashTotal: true,
          actualDigitalTotal: true,
          cashDifference: true,
          status: true,
          notes: true,
          createdAt: true,
          cashier: { select: { id: true, name: true, username: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

    const closings = closingsRaw.map((row) => {
      const env = parseShiftEnvelope(row.notes);
      const safeNotes = env ? env.closingNote ?? null : row.notes;
      const base = {
        id: row.id,
        shiftDate: row.shiftDate,
        actualCashTotal: row.actualCashTotal,
        actualDigitalTotal: row.actualDigitalTotal,
        notes: safeNotes,
        createdAt: row.createdAt,
        cashier: {
          id: row.cashier.id,
          name: row.cashier.name,
          role: row.cashier.role,
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
            const env = parseShiftEnvelope(row.notes);
            const systemDigitalTotal =
              row.systemQrisTotal + row.systemTransferTotal + row.systemCardTotal;
            return {
              id: row.id,
              counterId: env?.counterId || DEFAULT_COUNTER_ID,
              counterName: env?.counterName || DEFAULT_COUNTER_NAME,
              openedAt: env?.openedAt ?? row.shiftDate.toISOString(),
              closedAt: env?.closedAt ?? row.createdAt.toISOString(),
              cashier: row.cashier,
              status: row.status,
              openingCashTotal: env?.openingCashTotal ?? 0,
              openingDenominations: env?.openingDenominations ?? null,
              openingNote: env?.openingNote ?? null,
              closingDenominations: env?.closingDenominations ?? null,
              closingNote: env?.closingNote ?? (!env && row.notes ? row.notes : null),
              operationalExpenses: env?.operationalExpenses ?? [],
              operationalExpenseTotal: env?.operationalExpenseTotal ?? 0,
              systemTxCount: row.systemTxCount,
              systemCashTotal: row.systemCashTotal,
              systemQrisTotal: row.systemQrisTotal,
              systemTransferTotal: row.systemTransferTotal,
              systemCardTotal: row.systemCardTotal,
              systemDigitalTotal,
              systemGrandTotal: row.systemGrandTotal,
              expectedCashAtClose: env?.expectedCashAtClose ?? row.systemCashTotal,
              actualCashTotal: row.actualCashTotal,
              cashDifference: env?.closingCashDifference ?? row.cashDifference,
              handoverSyncStatus: env?.handoverSyncStatus ?? "SHIFT_PERTAMA",
              handoverDifference: env?.handoverDifference ?? 0,
              previousShiftClosingCash: env?.previousShiftClosingCash ?? null,
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
    const message = err instanceof Error ? err.message : "Gagal memuat data shift kasir.";
    return NextResponse.json({ error: message }, { status: 500 });
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

    // 1. BUKA SHIFT BARU (Blind Handover Check + Exclusive Per-Loket Lock)
    if (body && body.action === "OPEN") {
      const parsed = openShiftSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data buka shift tidak valid." },
          { status: 400 }
        );
      }

      const roomCounters = await getRoomCounters(user.roomId);
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
          : roomCounters.find((c) => c.id === requestedCounterId);

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
      const defaultCounterId = roomCounters[0]?.id || DEFAULT_COUNTER_ID;

      const openResult = await prisma.$transaction(async (tx) => {
        const activeShifts = await tx.shiftClosing.findMany({
          where: { roomId: user.roomId, status: "AKTIF" },
          include: { cashier: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "desc" },
        });

        const ownActive = activeShifts.find((s) => s.cashierId === user.id);
        if (ownActive) {
          const ownEnv = parseShiftEnvelope(ownActive.notes);
          const ownCounterName = ownEnv?.counterName || DEFAULT_COUNTER_NAME;
          throw new Error(
            `CONFLICT:Anda masih memiliki shift aktif di ${ownCounterName} yang belum ditutup.`
          );
        }

        const occupyingShift = activeShifts.find((s) => {
          const env = parseShiftEnvelope(s.notes);
          const cid = env?.counterId || defaultCounterId;
          return cid === targetCounter.id;
        });

        if (occupyingShift) {
          throw new Error(
            `CONFLICT:${targetCounter.name} sedang digunakan oleh ${occupyingShift.cashier.name}. Satu loket tidak dapat digunakan bersamaan hingga tutup shift.`
          );
        }

        const recentClosed = await tx.shiftClosing.findMany({
          where: { roomId: user.roomId, status: { not: "AKTIF" } },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: { id: true, actualCashTotal: true, notes: true },
        });

        const previousCounterClosed = recentClosed.find((row) => {
          const env = parseShiftEnvelope(row.notes);
          const cid = env?.counterId || defaultCounterId;
          return cid === targetCounter.id;
        });

        const handover = evaluateHandoverSync(
          openingCashTotal,
          previousCounterClosed ? previousCounterClosed.actualCashTotal : null
        );

        const envelope: ShiftEnvelope = {
          version: 2,
          counterId: targetCounter.id,
          counterName: targetCounter.name,
          openedAt: openedAt.toISOString(),
          closedAt: null,
          openingCashTotal,
          openingDenominations,
          openingNote,
          previousShiftId: previousCounterClosed?.id ?? null,
          previousShiftClosingCash: previousCounterClosed
            ? previousCounterClosed.actualCashTotal
            : null,
          handoverSyncStatus: handover.handoverSyncStatus,
          handoverDifference: handover.handoverDifference,
        };

        const shift = await tx.shiftClosing.create({
          data: {
            roomId: user.roomId,
            cashierId: user.id,
            shiftDate: openedAt,
            systemTxCount: 0,
            systemCashTotal: 0,
            systemQrisTotal: 0,
            systemTransferTotal: 0,
            systemCardTotal: 0,
            systemGrandTotal: 0,
            actualCashTotal: openingCashTotal,
            actualDigitalTotal: 0,
            cashDifference: 0,
            digitalDifference: 0,
            totalDifference: 0,
            status: "AKTIF",
            notes: serializeShiftEnvelope(envelope),
          },
          select: {
            id: true,
            cashierId: true,
            shiftDate: true,
            status: true,
            cashier: { select: { name: true, role: true } },
          },
        });

        // Re-verifikasi kunci loket untuk mencegah race condition bersamaan
        const verifyActiveAfter = await tx.shiftClosing.findMany({
          where: { roomId: user.roomId, status: "AKTIF" },
          select: { id: true, notes: true },
        });
        const lockCount = verifyActiveAfter.filter((s) => {
          const env = parseShiftEnvelope(s.notes);
          return (env?.counterId || defaultCounterId) === targetCounter.id;
        }).length;

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
            entityType: "ShiftClosing",
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
      });

      return NextResponse.json(
        {
          activeShift: {
            id: openResult.shift.id,
            counterId: targetCounter.id,
            counterName: targetCounter.name,
            cashierId: openResult.shift.cashierId,
            cashierName: openResult.shift.cashier.name,
            cashierRole: openResult.shift.cashier.role,
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
        const activeRow = await tx.shiftClosing.findFirst({
          where: parsed.data.shiftId
            ? { id: parsed.data.shiftId, roomId: user.roomId, cashierId: user.id, status: "AKTIF" }
            : { roomId: user.roomId, cashierId: user.id, status: "AKTIF" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            shiftDate: true,
            actualCashTotal: true,
            notes: true,
            cashier: { select: { id: true, name: true, role: true } },
          },
        });

        if (!activeRow) {
          throw new Error("NOT_FOUND:Tidak ada shift aktif untuk ditutup.");
        }

        const baseEnv = parseShiftEnvelope(activeRow.notes);
        const counterId = baseEnv?.counterId || DEFAULT_COUNTER_ID;
        const counterName = baseEnv?.counterName || DEFAULT_COUNTER_NAME;
        const openedAtDate = baseEnv?.openedAt ? new Date(baseEnv.openedAt) : activeRow.shiftDate;
        const openingCashTotal = baseEnv?.openingCashTotal ?? activeRow.actualCashTotal;

        const shiftAgg = await aggregateSalesSince(
          {
            roomId: user.roomId,
            cashierId: user.id,
            admin,
            since: openedAtDate,
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

        const updatedEnvelope: ShiftEnvelope = {
          version: 2,
          counterId,
          counterName,
          openedAt: openedAtDate.toISOString(),
          closedAt: closedAt.toISOString(),
          openingCashTotal,
          openingDenominations: baseEnv?.openingDenominations ?? normalizeDenominations({}),
          openingNote: baseEnv?.openingNote ?? null,
          previousShiftId: baseEnv?.previousShiftId ?? null,
          previousShiftClosingCash: baseEnv?.previousShiftClosingCash ?? null,
          handoverSyncStatus: baseEnv?.handoverSyncStatus ?? "SHIFT_PERTAMA",
          handoverDifference: baseEnv?.handoverDifference ?? 0,
          closingDenominations,
          operationalExpenses,
          operationalExpenseTotal,
          closingNote,
          expectedCashAtClose: audit.expectedCashAtClose,
          closingCashDifference: audit.cashDifference,
        };

        const claim = await tx.shiftClosing.updateMany({
          where: {
            id: activeRow.id,
            roomId: user.roomId,
            cashierId: user.id,
            status: "AKTIF",
          },
          data: {
            systemTxCount: shiftAgg.systemTxCount,
            systemCashTotal: shiftAgg.systemCashTotal,
            systemQrisTotal: shiftAgg.systemQrisTotal,
            systemTransferTotal: shiftAgg.systemTransferTotal,
            systemCardTotal: shiftAgg.systemCardTotal,
            systemGrandTotal: shiftAgg.systemGrandTotal,
            actualCashTotal,
            actualDigitalTotal: shiftAgg.systemDigitalTotal,
            cashDifference: audit.cashDifference,
            digitalDifference: 0,
            totalDifference: audit.cashDifference,
            status: audit.status,
            notes: serializeShiftEnvelope(updatedEnvelope),
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
            entityType: "ShiftClosing",
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
          cashier: activeRow.cashier,
        };
      });

      // Blind response: ZERO discrepancy, expected cash, or system sales totals exposed to cashier
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
            closingNote,
            status: "TERCATAT",
            cashier: closeResult.cashier,
          },
        },
        { status: 201 }
      );
    }

    // 3. LEGACY TUTUP SHIFT (backward compatibility tanpa action)
    const parsed = legacyClosingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tutup shift tidak valid." },
        { status: 400 }
      );
    }

    const startOfToday = getJakartaStartOfDay();
    const admin = isStoreAdmin(user.role);
    const todayAgg = await aggregateSalesSince({
      roomId: user.roomId,
      cashierId: user.id,
      admin,
      since: startOfToday,
    });

    const { actualCashTotal, actualDigitalTotal, notes } = parsed.data;
    const recordedGrandTotal = actualCashTotal + actualDigitalTotal;

    const closing = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftClosing.create({
        data: {
          roomId: user.roomId,
          cashierId: user.id,
          systemTxCount: todayAgg.systemTxCount,
          systemCashTotal: todayAgg.systemCashTotal,
          systemQrisTotal: todayAgg.systemQrisTotal,
          systemTransferTotal: todayAgg.systemTransferTotal,
          systemCardTotal: todayAgg.systemCardTotal,
          systemGrandTotal: todayAgg.systemGrandTotal,
          actualCashTotal,
          actualDigitalTotal,
          cashDifference: 0,
          digitalDifference: 0,
          totalDifference: 0,
          status: "TERCATAT",
          notes: notes?.trim() || null,
        },
        select: {
          id: true,
          shiftDate: true,
          systemTxCount: true,
          systemCashTotal: true,
          systemQrisTotal: true,
          systemTransferTotal: true,
          systemCardTotal: true,
          systemGrandTotal: true,
          actualCashTotal: true,
          actualDigitalTotal: true,
          notes: true,
          createdAt: true,
          cashier: { select: { id: true, name: true, role: true } },
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
          entityType: "ShiftClosing",
          entityId: created.id,
          afterData: {
            systemTxCount: todayAgg.systemTxCount,
            systemGrandTotal: todayAgg.systemGrandTotal,
            actualCashTotal,
            actualDigitalTotal,
            recordedGrandTotal,
            notes: created.notes,
          },
          approvalState: "TERCATAT",
          linkUrl: "/penjualan",
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ closing }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan data shift kasir.";
    if (message.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: message.slice(10) }, { status: 404 });
    }
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9) }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
