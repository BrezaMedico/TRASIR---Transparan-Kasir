import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const DEFAULT_COUNTER_SLUG = "loket-1";
const DEFAULT_COUNTER_NAME = "Loket 1";

function safeParseJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function runTahap5Backfill(prisma) {
  const report = {
    roomsScanned: 0,
    countersCreated: 0,
    shiftsCreated: 0,
    salesLinkedToShift: 0,
    unlinkedSalesRemaining: 0,
    orphanAudit: {
      roomsWithoutActiveCounter: 0,
      totalCounters: 0,
      totalShifts: 0,
      totalSales: 0,
      salesWithShiftId: 0,
    },
  };

  const rooms = await prisma.room.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  report.roomsScanned = rooms.length;

  for (const room of rooms) {
    // 1. Backfill Counter dari SystemSetting (room_counters:<roomId>) secara idempoten
    const legacySetting = await prisma.systemSetting.findUnique({
      where: { id: `room_counters:${room.id}` },
      select: { openAreaPolicy: true },
    });
    const parsedCounters = safeParseJson(legacySetting?.openAreaPolicy);
    const desiredCounters =
      Array.isArray(parsedCounters) && parsedCounters.length > 0
        ? parsedCounters
            .filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
            .map((c) => ({
              slug: c.id.trim().slice(0, 60) || DEFAULT_COUNTER_SLUG,
              name: c.name.trim().slice(0, 40) || DEFAULT_COUNTER_NAME,
            }))
        : [{ slug: DEFAULT_COUNTER_SLUG, name: DEFAULT_COUNTER_NAME }];

    const counterBySlug = new Map();
    for (const item of desiredCounters) {
      const existing = await prisma.counter.findUnique({
        where: { roomId_slug: { roomId: room.id, slug: item.slug } },
      });
      if (existing) {
        counterBySlug.set(existing.slug, existing);
      } else {
        const created = await prisma.counter.create({
          data: {
            roomId: room.id,
            slug: item.slug,
            name: item.name,
            isActive: true,
          },
        });
        counterBySlug.set(created.slug, created);
        report.countersCreated += 1;
      }
    }

    const defaultCounter =
      counterBySlug.get(DEFAULT_COUNTER_SLUG) || Array.from(counterBySlug.values())[0];

    // 2. Backfill Shift dari ShiftClosing secara idempoten (menggunakan legacyShiftClosingId unik)
    const legacyShifts = await prisma.shiftClosing.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "asc" },
    });

    for (const row of legacyShifts) {
      const existingShift = await prisma.shift.findUnique({
        where: { legacyShiftClosingId: row.id },
        select: { id: true },
      });
      if (existingShift) continue;

      const env = safeParseJson(row.notes);
      const isEnvelope = Boolean(env && env.version === 2 && typeof env.openedAt === "string");
      const counterSlug =
        (isEnvelope && typeof env.counterId === "string" && env.counterId.trim()) ||
        defaultCounter?.slug ||
        DEFAULT_COUNTER_SLUG;
      const counterRow = counterBySlug.get(counterSlug) || defaultCounter || null;
      const counterName =
        (isEnvelope && typeof env.counterName === "string" && env.counterName.trim()) ||
        counterRow?.name ||
        DEFAULT_COUNTER_NAME;

      const openedAt = isEnvelope ? new Date(env.openedAt) : row.shiftDate;
      const closedAt =
        row.status === "AKTIF"
          ? null
          : isEnvelope && env.closedAt
            ? new Date(env.closedAt)
            : row.createdAt;
      const openingCashTotal = isEnvelope ? Number(env.openingCashTotal) || 0 : 0;
      const closingCashTotal = row.status === "AKTIF" ? null : row.actualCashTotal;

      await prisma.shift.create({
        data: {
          roomId: room.id,
          userId: row.cashierId,
          counterId: counterRow?.id ?? null,
          counterSlug,
          counterName,
          openedAt,
          closedAt,
          status: row.status,
          openingCashTotal,
          closingCashTotal,
          actualDigitalTotal: row.actualDigitalTotal,
          operationalExpenseTotal: isEnvelope ? Number(env.operationalExpenseTotal) || 0 : 0,
          expectedCashAtClose:
            isEnvelope && typeof env.expectedCashAtClose === "number"
              ? env.expectedCashAtClose
              : null,
          cashDifference:
            isEnvelope && typeof env.closingCashDifference === "number"
              ? env.closingCashDifference
              : row.cashDifference,
          systemTxCount: row.systemTxCount,
          systemCashTotal: row.systemCashTotal,
          systemQrisTotal: row.systemQrisTotal,
          systemTransferTotal: row.systemTransferTotal,
          systemCardTotal: row.systemCardTotal,
          systemGrandTotal: row.systemGrandTotal,
          openingDenominationsJson:
            isEnvelope && env.openingDenominations
              ? JSON.stringify(env.openingDenominations)
              : null,
          closingDenominationsJson:
            isEnvelope && env.closingDenominations
              ? JSON.stringify(env.closingDenominations)
              : null,
          operationalExpensesJson:
            isEnvelope && Array.isArray(env.operationalExpenses)
              ? JSON.stringify(env.operationalExpenses)
              : null,
          openingNote: isEnvelope ? env.openingNote ?? null : null,
          closingNote: isEnvelope ? env.closingNote ?? null : row.notes,
          previousShiftId: isEnvelope ? env.previousShiftId ?? null : null,
          previousShiftClosingCash:
            isEnvelope && typeof env.previousShiftClosingCash === "number"
              ? env.previousShiftClosingCash
              : null,
          handoverSyncStatus:
            isEnvelope && typeof env.handoverSyncStatus === "string"
              ? env.handoverSyncStatus
              : "SHIFT_PERTAMA",
          handoverDifference: isEnvelope ? Number(env.handoverDifference) || 0 : 0,
          legacyShiftClosingId: row.id,
          createdAt: row.createdAt,
        },
      });
      report.shiftsCreated += 1;
    }

    // 3. Backfill Sale.shiftId & Sale.counterId untuk transaksi lama yang masih null
    const unlinkedSales = await prisma.sale.findMany({
      where: { roomId: room.id, shiftId: null },
      select: { id: true, cashierId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (unlinkedSales.length > 0) {
      const roomShifts = await prisma.shift.findMany({
        where: { roomId: room.id },
        select: { id: true, userId: true, counterId: true, openedAt: true, closedAt: true },
        orderBy: { openedAt: "asc" },
      });

      for (const sale of unlinkedSales) {
        const matched = roomShifts.find((sh) => {
          if (sh.userId !== sale.cashierId) return false;
          const afterOpen = sale.createdAt.getTime() >= sh.openedAt.getTime();
          const beforeClose = !sh.closedAt || sale.createdAt.getTime() <= sh.closedAt.getTime();
          return afterOpen && beforeClose;
        });
        if (matched) {
          await prisma.sale.update({
            where: { id: sale.id },
            data: {
              shiftId: matched.id,
              counterId: matched.counterId,
            },
          });
          report.salesLinkedToShift += 1;
        } else {
          report.unlinkedSalesRemaining += 1;
        }
      }
    }
  }

  // 4. Verifikasi audit: pastikan setiap room minimal memiliki 1 Counter aktif
  const roomsWithoutCounter = await prisma.room.count({
    where: { counters: { none: { isActive: true } } },
  });
  report.orphanAudit = {
    roomsWithoutActiveCounter: roomsWithoutCounter,
    totalCounters: await prisma.counter.count(),
    totalShifts: await prisma.shift.count(),
    totalSales: await prisma.sale.count(),
    salesWithShiftId: await prisma.sale.count({ where: { shiftId: { not: null } } }),
  };

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  runTahap5Backfill(prisma)
    .then((report) => {
      console.log(JSON.stringify({ ok: true, report }, null, 2));
    })
    .catch((err) => {
      console.error("Backfill Tahap 5 gagal:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
