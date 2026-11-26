import { prisma, withDbRetry } from "@/lib/prisma";
import { getJakartaPeriodBounds, type ProfitPeriod } from "@/lib/date-jakarta";
import { getGrossProfitReport } from "./profit";
import {
  DEFAULT_COUNTER_ID,
  DEFAULT_COUNTER_NAME,
  type CounterComparisonMetric,
} from "@/lib/counters";
import { getRoomCountersWithLiveStatus } from "./counters";

export async function getDashboardPayload(roomId: string, range = "month") {
  const period: ProfitPeriod =
    range === "today" || range === "week" || range === "month" ? range : "month";
  const periodBounds = getJakartaPeriodBounds(period);

  // Batching ringan + retry otomatis agar responsif dan aman terhadap koneksi DB
  const [profitReport, totalProductsCount, pendingProductRequests, liveCounters] = await withDbRetry(() =>
    Promise.all([
      getGrossProfitReport(roomId, period),
      prisma.product.count({ where: { roomId, isActive: true } }),
      prisma.productRequest.findMany({
        where: { roomId, status: "MENUNGGU_PERSETUJUAN" },
        include: {
          category: { select: { name: true, areaType: true } },
          requestedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      getRoomCountersWithLiveStatus(roomId),
    ])
  );

  const [pendingAmendments, lowStockProducts, recentShiftClosings, periodShiftClosings] =
    await withDbRetry(() =>
      Promise.all([
        prisma.saleAmendment.findMany({
          where: { roomId, status: "MENUNGGU_PERSETUJUAN" },
          include: {
            sale: { select: { receiptNumber: true, totalAmount: true } },
            requestedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        prisma.product.findMany({
          where: { roomId, isActive: true, stockMethod: { not: "RESEP" } },
          include: { category: true },
          orderBy: { currentStock: "asc" },
        }),
        prisma.shift.findMany({
          where: { roomId, status: { not: "AKTIF" } },
          include: {
            user: { select: { id: true, name: true, role: true } },
            counter: { select: { slug: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.shift.findMany({
          where: {
            roomId,
            status: { not: "AKTIF" },
            createdAt: { gte: periodBounds.startDate, lte: periodBounds.endDate },
          },
          include: {
            counter: { select: { slug: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
      ])
    );

  const defaultCounterId = liveCounters[0]?.id || DEFAULT_COUNTER_ID;
  const counterMetricsMap = new Map<string, CounterComparisonMetric>();
  for (const c of liveCounters) {
    counterMetricsMap.set(c.id, {
      counterId: c.id,
      counterName: c.name,
      isOccupied: c.isOccupied,
      occupiedByName: c.occupiedBy?.userName ?? null,
      shiftCount: 0,
      totalSystemSales: 0,
      totalSystemCash: 0,
      totalExpectedCash: 0,
      totalActualCash: 0,
      totalCashDifference: 0,
      discrepancyCount: 0,
      handoverMismatchCount: 0,
    });
  }

  for (const row of periodShiftClosings) {
    const cid = row.counter?.slug || row.counterSlug || defaultCounterId;
    const cname = row.counter?.name || row.counterName || DEFAULT_COUNTER_NAME;
    const bucket =
      counterMetricsMap.get(cid) ?? {
        counterId: cid,
        counterName: cname,
        isOccupied: false,
        occupiedByName: null,
        shiftCount: 0,
        totalSystemSales: 0,
        totalSystemCash: 0,
        totalExpectedCash: 0,
        totalActualCash: 0,
        totalCashDifference: 0,
        discrepancyCount: 0,
        handoverMismatchCount: 0,
      };

    const openingCash = row.openingCashTotal;
    const opsExpense = row.operationalExpenseTotal;
    const expectedCash =
      row.expectedCashAtClose ?? openingCash + row.systemCashTotal - opsExpense;
    const actualCash = row.closingCashTotal ?? 0;
    const cashDiff = row.cashDifference;

    bucket.shiftCount += 1;
    bucket.totalSystemSales += row.systemGrandTotal;
    bucket.totalSystemCash += row.systemCashTotal;
    bucket.totalExpectedCash += expectedCash;
    bucket.totalActualCash += actualCash;
    bucket.totalCashDifference += cashDiff;
    if (row.status === "PERLU_DIPERIKSA") {
      bucket.discrepancyCount += 1;
    }
    if (row.handoverSyncStatus === "TIDAK_SINKRON") {
      bucket.handoverMismatchCount += 1;
    }

    counterMetricsMap.set(cid, bucket);
  }

  const counterComparison = Array.from(counterMetricsMap.values());

  const flaggedShifts = recentShiftClosings
    .map((s) => ({
      id: s.id,
      counterName: s.counter?.name || s.counterName || DEFAULT_COUNTER_NAME,
      cashierName: s.user.name,
      closedAt: (s.closedAt ?? s.createdAt).toISOString(),
      status: s.status,
      cashDifference: s.cashDifference,
      handoverSyncStatus: s.handoverSyncStatus,
      handoverDifference: s.handoverDifference,
    }))
    .filter(
      (s) => s.status === "PERLU_DIPERIKSA" || s.handoverSyncStatus === "TIDAK_SINKRON"
    )
    .slice(0, 10);

  return JSON.parse(
    JSON.stringify({
      period,
      profit: profitReport,
      kpis: {
        totalRevenue: profitReport.metrics.netSalesRevenue,
        /** @deprecated Placeholder retained for dashboard API backward compatibility. */
        totalPurchases: 0,
        totalCogs: profitReport.metrics.totalCogs,
        estimatedGrossProfit: profitReport.metrics.grossProfit,
        grossMarginPct: profitReport.metrics.grossMarginPct,
        /** @deprecated Placeholder retained for dashboard API backward compatibility. */
        discrepancyItemsCount: 0,
        totalProductsCount,
        lowStockCount: lowStockProducts.filter((p) => p.currentStock <= p.minStockAlert).length,
      },
      chartSeries: profitReport.chartSeries,
      counterComparison,
      approvalQueue: {
        productRequests: pendingProductRequests,
        purchases: [],
        amendments: pendingAmendments,
        adjustments: [],
      },
      anomalies: {
        /** @deprecated Placeholder retained for dashboard API backward compatibility. */
        aiFlaggedPurchases: [],
        /** @deprecated Placeholder retained for dashboard API backward compatibility. */
        exceedingOpnameItems: [],
        flaggedShifts,
      },
      lowStockProducts: lowStockProducts
        .filter((p) => p.currentStock <= p.minStockAlert)
        .slice(0, 10),
    })
  );
}
