import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";

function getStartDateForRange(range: string): Date {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView = await checkUserPermission(user.role, "dashboard", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses halaman Dashboard." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "month";
    const startDate = getStartDateForRange(range);

    // GUDANG role sees stock summary on Dashboard per RBAC Matrix
    const isWarehouseOnly = user.role === "GUDANG";

    const [
      validSales,
      approvedPurchases,
      pendingPurchases,
      pendingAmendments,
      pendingAdjustments,
      aiFlaggedPurchases,
      discrepantShifts,
      exceedingOpnameItems,
      lowStockProducts,
      totalProductsCount,
    ] = await Promise.all([
      isWarehouseOnly
        ? Promise.resolve([])
        : prisma.sale.findMany({
            where: {
              createdAt: { gte: startDate },
              status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
            },
            orderBy: { createdAt: "asc" },
          }),
      isWarehouseOnly
        ? Promise.resolve([])
        : prisma.purchase.findMany({
            where: {
              createdAt: { gte: startDate },
              approvalStatus: "DISETUJUI",
            },
            orderBy: { createdAt: "asc" },
          }),
      prisma.purchase.findMany({
        where: { approvalStatus: "MENUNGGU_PERSETUJUAN" },
        include: { submittedBy: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.saleAmendment.findMany({
        where: { status: "MENUNGGU_PERSETUJUAN" },
        include: {
          sale: { select: { receiptNumber: true, totalAmount: true } },
          requestedBy: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.stockAdjustment.findMany({
        where: { status: "MENUNGGU_PERSETUJUAN" },
        include: {
          product: { select: { name: true, sellUnit: true } },
          requestedBy: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.purchase.findMany({
        where: {
          aiValidationStatus: { in: ["ADA_SELISIH", "NOTA_GANDA", "TERINDIKASI_EDIT"] },
          approvalStatus: { in: ["MENUNGGU_PERSETUJUAN", "PERLU_PERBAIKAN"] },
        },
        include: { submittedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.shiftClosing.findMany({
        where: { status: "PERLU_DIPERIKSA" },
        include: { cashier: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.stockOpnameItem.findMany({
        where: {
          OR: [{ exceedsTolerance: true }, { differenceUnit: { not: 0 } }],
        },
        include: {
          product: { include: { category: true } },
          session: { select: { title: true, createdAt: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.product.findMany({
        where: { isActive: true, stockMethod: { not: "RESEP" } },
        include: { category: true },
        orderBy: { currentStock: "asc" },
      }),
      prisma.product.count({ where: { isActive: true } }),
    ]);

    const totalRevenue = validSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCogs = validSales.reduce((acc, s) => acc + s.totalCost, 0);
    const estimatedGrossProfit = totalRevenue - totalCogs;
    const totalApprovedPurchases = approvedPurchases.reduce((acc, p) => acc + p.totalAmount, 0);
    const discrepancyItemsCount = exceedingOpnameItems.filter((i) => i.differenceUnit !== 0).length;

    // Group daily series for chart visualization (only real dates present in database)
    const dailyMap = new Map<
      string,
      { date: string; sales: number; purchases: number; grossProfit: number }
    >();

    for (const s of validSales) {
      const dayKey = s.createdAt.toISOString().slice(0, 10);
      const curr = dailyMap.get(dayKey) || { date: dayKey, sales: 0, purchases: 0, grossProfit: 0 };
      curr.sales += s.totalAmount;
      curr.grossProfit += s.totalAmount - s.totalCost;
      dailyMap.set(dayKey, curr);
    }

    for (const p of approvedPurchases) {
      const dayKey = p.createdAt.toISOString().slice(0, 10);
      const curr = dailyMap.get(dayKey) || { date: dayKey, sales: 0, purchases: 0, grossProfit: 0 };
      curr.purchases += p.totalAmount;
      dailyMap.set(dayKey, curr);
    }

    const chartSeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      isWarehouseOnly,
      kpis: {
        totalRevenue,
        totalPurchases: totalApprovedPurchases,
        totalCogs,
        estimatedGrossProfit,
        discrepancyItemsCount,
        totalProductsCount,
        lowStockCount: lowStockProducts.filter((p) => p.currentStock <= p.minStockAlert).length,
      },
      chartSeries,
      approvalQueue: {
        purchases: pendingPurchases,
        amendments: pendingAmendments,
        adjustments: pendingAdjustments,
      },
      anomalies: {
        aiFlaggedPurchases,
        discrepantShifts,
        exceedingOpnameItems: exceedingOpnameItems.filter((i) => i.exceedsTolerance),
      },
      lowStockProducts: lowStockProducts.filter((p) => p.currentStock <= p.minStockAlert).slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

