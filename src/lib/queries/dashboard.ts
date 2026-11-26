import { prisma, withDbRetry } from "@/lib/prisma";
import { getJakartaPeriodBounds, type ProfitPeriod } from "@/lib/date-jakarta";
import { getGrossProfitReport } from "./profit";
import { parseShiftEnvelope } from "@/lib/shift-session";
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
        prisma.shiftClosing.findMany({
          where: { roomId, status: { not: "AKTIF" } },
          include: { cashier: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.shiftClosing.findMany({
          where: {
            roomId,
            status: { not: "AKTIF" },
            createdAt: { gte: periodBounds.startDate, lte: periodBounds.endDate },
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
    const env = parseShiftEnvelope(row.notes);
    const cid = env?.counterId || defaultCounterId;
    const cname = env?.counterName || DEFAULT_COUNTER_NAME;
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

    const openingCash = env?.openingCashTotal ?? 0;
    const opsExpense = env?.operationalExpenseTotal ?? 0;
    const expectedCash =
      env?.expectedCashAtClose ?? openingCash + row.systemCashTotal - opsExpense;
    const cashDiff = env?.closingCashDifference ?? row.cashDifference;

    bucket.shiftCount += 1;
    bucket.totalSystemSales += row.systemGrandTotal;
    bucket.totalSystemCash += row.systemCashTotal;
    bucket.totalExpectedCash += expectedCash;
    bucket.totalActualCash += row.actualCashTotal;
    bucket.totalCashDifference += cashDiff;
    if (row.status === "PERLU_DIPERIKSA") {
      bucket.discrepancyCount += 1;
    }
    if (env?.handoverSyncStatus === "TIDAK_SINKRON") {
      bucket.handoverMismatchCount += 1;
    }

    counterMetricsMap.set(cid, bucket);
  }

  const counterComparison = Array.from(counterMetricsMap.values());

  const flaggedShifts = recentShiftClosings
    .map((s) => {
      const env = parseShiftEnvelope(s.notes);
      const handoverSyncStatus = env?.handoverSyncStatus ?? "SHIFT_PERTAMA";
      const handoverDifference = env?.handoverDifference ?? 0;
      const cashDifference = env?.closingCashDifference ?? s.cashDifference;
      return {
        id: s.id,
        counterName: env?.counterName || DEFAULT_COUNTER_NAME,
        cashierName: s.cashier.name,
        closedAt: env?.closedAt ?? s.createdAt.toISOString(),
        status: s.status,
        cashDifference,
        handoverSyncStatus,
        handoverDifference,
      };
    })
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
        totalPurchases: 0,
        totalCogs: profitReport.metrics.totalCogs,
        estimatedGrossProfit: profitReport.metrics.grossProfit,
        grossMarginPct: profitReport.metrics.grossMarginPct,
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
        aiFlaggedPurchases: [],
        exceedingOpnameItems: [],
        flaggedShifts,
      },
      lowStockProducts: lowStockProducts
        .filter((p) => p.currentStock <= p.minStockAlert)
        .slice(0, 10),
    })
  );
}
