import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { canViewFinancials } from "@/lib/rbac";
import {
  addJakartaDays,
  enumerateJakartaDateKeys,
  enumerateJakartaMonthKeys,
  getJakartaCurrentHour,
  getJakartaDateKey,
  getJakartaDateParts,
  getJakartaDaysInMonth,
  getJakartaHourKey,
  getJakartaPeriodBounds,
} from "@/lib/date-jakarta";

function formatReportDayLabel(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(dt);
}

function formatReportWeekdayShort(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  }).format(dt);
}

function formatReportDayMonthShort(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(dt);
}

function formatReportMonthLabel(monthKey: string, short = false): string {
  const parts = monthKey.split("-").map(Number);
  if (parts.length !== 2) return monthKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, 15, 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "short",
    year: short ? "2-digit" : "numeric",
  }).format(dt);
}

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

    const now = new Date();
    const todayKey = getJakartaDateKey(now);
    const currentHour = getJakartaCurrentHour(now);

    let granularity: "hourly" | "daily" | "monthly" = "daily";
    interface ReportChartRow {
      date: string;
      label: string;
      shortLabel: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      purchases: number;
      salesCount: number;
      isFuture: boolean;
    }

    const timeMap = new Map<string, ReportChartRow>();

    if (period === "daily") {
      granularity = "hourly";
      for (let h = 0; h < 24; h += 1) {
        const key = `${String(h).padStart(2, "0")}:00`;
        timeMap.set(key, {
          date: key,
          label: `${key} WIB`,
          shortLabel: key,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          purchases: 0,
          salesCount: 0,
          isFuture: h > currentHour,
        });
      }
    } else if (period === "weekly") {
      granularity = "daily";
      const mondayKey = getJakartaDateKey(startDate);
      for (let i = 0; i < 7; i += 1) {
        const key = addJakartaDays(mondayKey, i);
        timeMap.set(key, {
          date: key,
          label: formatReportDayLabel(key),
          shortLabel: formatReportWeekdayShort(key),
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          purchases: 0,
          salesCount: 0,
          isFuture: key > todayKey,
        });
      }
    } else if (period === "custom" && startParam && endParam) {
      const startKey = getJakartaDateKey(startDate);
      const endKey = getJakartaDateKey(endDate);
      if (startKey === endKey) {
        granularity = "hourly";
        for (let h = 0; h < 24; h += 1) {
          const key = `${String(h).padStart(2, "0")}:00`;
          timeMap.set(key, {
            date: key,
            label: `${key} WIB`,
            shortLabel: key,
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            purchases: 0,
            salesCount: 0,
            isFuture: startKey > todayKey || (startKey === todayKey && h > currentHour),
          });
        }
      } else {
        const dateKeys = enumerateJakartaDateKeys(startKey, endKey);
        if (dateKeys.length <= 62) {
          granularity = "daily";
          for (const key of dateKeys) {
            timeMap.set(key, {
              date: key,
              label: formatReportDayLabel(key),
              shortLabel: formatReportDayMonthShort(key),
              revenue: 0,
              cogs: 0,
              grossProfit: 0,
              purchases: 0,
              salesCount: 0,
              isFuture: key > todayKey,
            });
          }
        } else {
          granularity = "monthly";
          const currentMonthKey = todayKey.slice(0, 7);
          for (const mk of enumerateJakartaMonthKeys(startKey, endKey)) {
            timeMap.set(mk, {
              date: mk,
              label: formatReportMonthLabel(mk, false),
              shortLabel: formatReportMonthLabel(mk, true),
              revenue: 0,
              cogs: 0,
              grossProfit: 0,
              purchases: 0,
              salesCount: 0,
              isFuture: mk > currentMonthKey,
            });
          }
        }
      }
    } else {
      granularity = "daily";
      const { year, monthIndex } = getJakartaDateParts(now);
      const daysInMonth = getJakartaDaysInMonth(year, monthIndex);
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      for (let d = 1; d <= daysInMonth; d += 1) {
        const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
        timeMap.set(key, {
          date: key,
          label: formatReportDayLabel(key),
          shortLabel: formatReportDayMonthShort(key),
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          purchases: 0,
          salesCount: 0,
          isFuture: key > todayKey,
        });
      }
    }

    const resolveBucketKey = (dt: Date): string => {
      if (granularity === "hourly") return getJakartaHourKey(dt);
      if (granularity === "monthly") return getJakartaDateKey(dt).slice(0, 7);
      return getJakartaDateKey(dt);
    };

    const resolveBucketLabels = (key: string): { label: string; shortLabel: string } => {
      if (granularity === "hourly") return { label: `${key} WIB`, shortLabel: key };
      if (granularity === "monthly") {
        return {
          label: formatReportMonthLabel(key, false),
          shortLabel: formatReportMonthLabel(key, true),
        };
      }
      return {
        label: formatReportDayLabel(key),
        shortLabel: period === "weekly" ? formatReportWeekdayShort(key) : formatReportDayMonthShort(key),
      };
    };

    for (const s of validSales) {
      const key = resolveBucketKey(s.createdAt);
      const saleCogs =
        s.items.length > 0
          ? s.items.reduce(
              (sum, it) =>
                sum +
                (it.totalCost > 0 ? it.totalCost : Math.round((it.unitCost || 0) * it.quantity)),
              0
            )
          : s.totalCost;
      const fallbackLabels = resolveBucketLabels(key);
      const row = timeMap.get(key) || {
        date: key,
        label: fallbackLabels.label,
        shortLabel: fallbackLabels.shortLabel,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        purchases: 0,
        salesCount: 0,
        isFuture: false,
      };
      row.revenue += s.totalAmount;
      row.cogs += saleCogs;
      row.grossProfit += s.totalAmount - saleCogs;
      row.salesCount += 1;
      row.isFuture = false;
      timeMap.set(key, row);
    }

    for (const p of approvedPurchases) {
      const key = resolveBucketKey(p.createdAt);
      const fallbackLabels = resolveBucketLabels(key);
      const row = timeMap.get(key) || {
        date: key,
        label: fallbackLabels.label,
        shortLabel: fallbackLabels.shortLabel,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        purchases: 0,
        salesCount: 0,
        isFuture: false,
      };
      row.purchases += p.totalAmount;
      row.isFuture = false;
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
      granularity,
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
