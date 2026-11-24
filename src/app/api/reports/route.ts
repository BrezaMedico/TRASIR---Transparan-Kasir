import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { canViewFinancials } from "@/lib/rbac";
import { getJakartaDateKey, getJakartaPeriodBounds } from "@/lib/date-jakarta";

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    // Informasi keuangan hanya dapat diakses Pemilik & Manajer
    if (!canViewFinancials(user.role)) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses Laporan Keuangan." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "monthly"; // daily | weekly | monthly | custom
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    let startDate: Date;
    let endDate = new Date();

    if (period === "daily") {
      const b = getJakartaPeriodBounds("today");
      startDate = b.startDate;
      endDate = b.endDate;
    } else if (period === "weekly") {
      const b = getJakartaPeriodBounds("week");
      startDate = b.startDate;
      endDate = b.endDate;
    } else if (period === "custom" && startParam && endParam) {
      startDate = new Date(`${startParam}T00:00:00+07:00`);
      endDate = new Date(`${endParam}T23:59:59.999+07:00`);
    } else {
      const b = getJakartaPeriodBounds("month");
      startDate = b.startDate;
      endDate = b.endDate;
    }

    const [validSales, approvedPurchases, opnameDiscrepancies] = await Promise.all([
      prisma.sale.findMany({
        where: {
          roomId: user.roomId,
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
          roomId: user.roomId,
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
          session: { roomId: user.roomId },
          differenceUnit: { not: 0 },
        },
        include: {
          product: { include: { category: true } },
          session: { select: { title: true, createdAt: true } },
        },
      }),
    ]);

    const totalRevenue = validSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCogs = validSales.reduce((acc, s) => {
      if (s.items.length > 0) {
        return (
          acc +
          s.items.reduce(
            (sum, it) =>
              sum + (it.totalCost > 0 ? it.totalCost : Math.round((it.unitCost || 0) * it.quantity)),
            0
          )
        );
      }
      return acc + s.totalCost;
    }, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalPurchases = approvedPurchases.reduce((acc, p) => acc + p.totalAmount, 0);

    const timeMap = new Map<
      string,
      { date: string; revenue: number; cogs: number; grossProfit: number; purchases: number }
    >();

    for (const s of validSales) {
      const key = getJakartaDateKey(s.createdAt);
      const saleCogs =
        s.items.length > 0
          ? s.items.reduce(
              (sum, it) =>
                sum +
                (it.totalCost > 0 ? it.totalCost : Math.round((it.unitCost || 0) * it.quantity)),
              0
            )
          : s.totalCost;
      const row = timeMap.get(key) || {
        date: key,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        purchases: 0,
      };
      row.revenue += s.totalAmount;
      row.cogs += saleCogs;
      row.grossProfit += s.totalAmount - saleCogs;
      timeMap.set(key, row);
    }

    for (const p of approvedPurchases) {
      const key = getJakartaDateKey(p.createdAt);
      const row = timeMap.get(key) || {
        date: key,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        purchases: 0,
      };
      row.purchases += p.totalAmount;
      timeMap.set(key, row);
    }

    const chartSeries = Array.from(timeMap.values()).sort((a, b) => a.date.localeCompare(b.date));

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
        const itemCost =
          item.totalCost > 0 ? item.totalCost : Math.round((item.unitCost || 0) * item.quantity);
        curr.qtySold += item.quantity;
        curr.totalRevenue += item.subtotal;
        curr.totalCogs += itemCost;
        curr.grossProfit += item.subtotal - itemCost;
        curr.marginPercent =
          curr.totalRevenue > 0 ? Math.round((curr.grossProfit / curr.totalRevenue) * 100) : 0;
        productProfitMap.set(key, curr);
      }
    }

    const profitableProducts = Array.from(productProfitMap.values()).sort(
      (a, b) => b.grossProfit - a.grossProfit
    );

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
