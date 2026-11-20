import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView = await checkUserPermission(user.role, "laporan", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses Laporan Keuangan." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "monthly"; // daily | monthly | custom
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    if (period === "daily") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "custom" && startParam && endParam) {
      startDate = new Date(startParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    const [validSales, approvedPurchases, opnameDiscrepancies] = await Promise.all([
      prisma.sale.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        },
        include: {
          items: true,
          cashier: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.purchase.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          approvalStatus: "DISETUJUI",
        },
        include: {
          submittedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.stockOpnameItem.findMany({
        where: {
          differenceUnit: { not: 0 },
        },
        include: {
          product: { include: { category: true } },
          session: { select: { title: true, createdAt: true } },
        },
      }),
    ]);

    // Mandatory Formula from Blueprint & PDF Section 9:
    // Keuntungan Kotor = Total Penjualan - Harga Pokok Penjualan (HPP Barang Terjual)
    const totalRevenue = validSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCogs = validSales.reduce((acc, s) => acc + s.totalCost, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalPurchases = approvedPurchases.reduce((acc, p) => acc + p.totalAmount, 0);

    // Chart 1 & Chart 2 time series
    const timeMap = new Map<
      string,
      { date: string; revenue: number; cogs: number; grossProfit: number; purchases: number }
    >();

    for (const s of validSales) {
      const key = s.createdAt.toISOString().slice(0, 10);
      const row = timeMap.get(key) || { date: key, revenue: 0, cogs: 0, grossProfit: 0, purchases: 0 };
      row.revenue += s.totalAmount;
      row.cogs += s.totalCost;
      row.grossProfit += s.totalAmount - s.totalCost;
      timeMap.set(key, row);
    }

    for (const p of approvedPurchases) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const row = timeMap.get(key) || { date: key, revenue: 0, cogs: 0, grossProfit: 0, purchases: 0 };
      row.purchases += p.totalAmount;
      timeMap.set(key, row);
    }

    const chartSeries = Array.from(timeMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Most Profitable Products aggregation
    const productProfitMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        qtySold: number;
        totalRevenue: number;
        totalCogs: number;
        grossProfit: number;
        marginPercent: number;
      }
    >();

    for (const sale of validSales) {
      for (const item of sale.items) {
        const key = item.productId;
        const curr = productProfitMap.get(key) || {
          productId: item.productId,
          productName: item.productName,
          qtySold: 0,
          totalRevenue: 0,
          totalCogs: 0,
          grossProfit: 0,
          marginPercent: 0,
        };
        curr.qtySold += item.quantity;
        curr.totalRevenue += item.subtotal;
        curr.totalCogs += item.totalCost;
        curr.grossProfit += item.subtotal - item.totalCost;
        curr.marginPercent =
          curr.totalRevenue > 0 ? Math.round((curr.grossProfit / curr.totalRevenue) * 100) : 0;
        productProfitMap.set(key, curr);
      }
    }

    const profitableProducts = Array.from(productProfitMap.values()).sort(
      (a, b) => b.grossProfit - a.grossProfit
    );

    // Problematic Products aggregation (highest frequency of stock discrepancy)
    const problemMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        categoryName: string;
        areaType: string;
        discrepancyFrequency: number;
        totalUnitDiff: number;
        totalLossRp: number;
      }
    >();

    for (const op of opnameDiscrepancies) {
      const key = op.productId;
      const curr = problemMap.get(key) || {
        productId: op.productId,
        productName: op.product.name,
        categoryName: op.product.category.name,
        areaType: op.areaType,
        discrepancyFrequency: 0,
        totalUnitDiff: 0,
        totalLossRp: 0,
      };
      curr.discrepancyFrequency += 1;
      curr.totalUnitDiff = Number((curr.totalUnitDiff + op.differenceUnit).toFixed(4));
      curr.totalLossRp += op.lossValueRp;
      problemMap.set(key, curr);
    }

    const problematicProducts = Array.from(problemMap.values()).sort(
      (a, b) => b.discrepancyFrequency - a.discrepancyFrequency || b.totalLossRp - a.totalLossRp
    );

    return NextResponse.json({
      summary: {
        totalRevenue,
        totalPurchases,
        totalCogs,
        grossProfit,
        salesCount: validSales.length,
        purchasesCount: approvedPurchases.length,
      },
      chartSeries,
      profitableProducts,
      problematicProducts,
      salesHistory: validSales,
      purchasesHistory: approvedPurchases,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat laporan keuangan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

