import { prisma, withDbRetry } from "@/lib/prisma";
import { type ProfitPeriod } from "@/lib/date-jakarta";
import { getGrossProfitReport } from "./profit";

export async function getDashboardPayload(roomId: string, range = "month") {
  const period: ProfitPeriod =
    range === "today" || range === "week" || range === "month" ? range : "month";

  // Batching ringan + retry otomatis agar responsif dan aman terhadap koneksi DB
  const [profitReport, totalProductsCount, pendingProductRequests] = await withDbRetry(() =>
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
    ])
  );

  const [pendingAmendments, lowStockProducts] = await withDbRetry(() =>
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
    ])
  );

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
      approvalQueue: {
        productRequests: pendingProductRequests,
        purchases: [],
        amendments: pendingAmendments,
        adjustments: [],
      },
      // Fitur melihat selisih hasil tutup shift telah dihapus sepenuhnya dari anomali dashboard
      anomalies: {
        aiFlaggedPurchases: [],
        exceedingOpnameItems: [],
      },
      lowStockProducts: lowStockProducts
        .filter((p) => p.currentStock <= p.minStockAlert)
        .slice(0, 10),
    })
  );
}
