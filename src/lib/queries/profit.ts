import { prisma } from "@/lib/prisma";
import {
  addJakartaDays,
  getJakartaCurrentHour,
  getJakartaDateKey,
  getJakartaDateParts,
  getJakartaDaysInMonth,
  getJakartaHourKey,
  getJakartaPeriodBounds,
  type ProfitPeriod,
} from "@/lib/date-jakarta";

export interface ProfitSeriesPoint {
  key: string;
  label: string;
  shortLabel?: string;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  salesCount: number;
  isFuture?: boolean;
}

export interface GrossProfitReport {
  period: ProfitPeriod;
  timezone: "Asia/Jakarta";
  periodLabel: string;
  previousPeriodLabel: string;
  startDate: string;
  endDate: string;
  formula: string;
  disclaimer: string;
  metrics: {
    grossProfit: number;
    netSalesRevenue: number;
    grossSalesSubtotal: number;
    totalDiscounts: number;
    totalCogs: number;
    grossMarginPct: number;
    activeSalesCount: number;
    cancelledSalesCount: number;
    totalUnitsSold: number;
  };
  dataQuality: {
    isCalculationComplete: boolean;
    hasIncompleteCostData: boolean;
    incompleteCostItemsCount: number;
    incompleteProductNames: string[];
    warningMessage: string | null;
  };
  comparison: {
    hasComparisonData: boolean;
    previousGrossProfit: number;
    previousNetRevenue: number;
    previousTotalCogs: number;
    previousSalesCount: number;
    grossProfitDeltaRp: number;
    grossProfitDeltaPct: number | null;
    revenueDeltaPct: number | null;
  };
  chartSeries: ProfitSeriesPoint[];
}

interface SaleWithItems {
  id: string;
  totalAmount: number;
  discountAmount: number;
  totalCost: number;
  status: string;
  createdAt: Date;
  items: {
    productName: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
    totalCost: number;
  }[];
}

function summarizeSalesPeriod(sales: SaleWithItems[]) {
  let netSalesRevenue = 0;
  let grossSalesSubtotal = 0;
  let totalDiscounts = 0;
  let totalCogs = 0;
  let totalUnitsSold = 0;
  let incompleteCostItemsCount = 0;
  const incompleteProducts = new Set<string>();

  for (const sale of sales) {
    netSalesRevenue += sale.totalAmount;
    totalDiscounts += sale.discountAmount || 0;

    if (sale.items.length > 0) {
      let itemCogsSum = 0;
      for (const item of sale.items) {
        grossSalesSubtotal += item.subtotal;
        totalUnitsSold += item.quantity;
        // Gunakan snapshot HPP historis yang tercatat saat transaksi terjadi
        const itemHistoricalCost =
          item.totalCost > 0
            ? item.totalCost
            : Math.round((item.unitCost || 0) * item.quantity);
        itemCogsSum += itemHistoricalCost;

        if (item.quantity > 0 && item.unitCost <= 0 && item.totalCost <= 0) {
          incompleteCostItemsCount += 1;
          incompleteProducts.add(item.productName);
        }
      }
      totalCogs += itemCogsSum;
    } else {
      grossSalesSubtotal += sale.totalAmount + (sale.discountAmount || 0);
      totalCogs += sale.totalCost;
      if (sale.totalAmount > 0 && sale.totalCost <= 0) {
        incompleteCostItemsCount += 1;
      }
    }
  }

  const grossProfit = netSalesRevenue - totalCogs;
  const grossMarginPct =
    netSalesRevenue > 0 ? Number(((grossProfit / netSalesRevenue) * 100).toFixed(1)) : 0;

  return {
    netSalesRevenue,
    grossSalesSubtotal,
    totalDiscounts,
    totalCogs,
    grossProfit,
    grossMarginPct,
    totalUnitsSold: Number(totalUnitsSold.toFixed(2)),
    incompleteCostItemsCount,
    incompleteProductNames: Array.from(incompleteProducts).slice(0, 8),
  };
}

function formatShortDayLabel(dateKey: string): string {
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

function formatWeekdayShort(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  }).format(dt);
}

function formatDayMonthShort(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  }).format(dt);
}

/**
 * Menghitung laporan Keuntungan Kotor (Gross Profit) per ruangan untuk periode
 * Hari Ini, Minggu Ini (awal Senin), atau Bulan Ini dalam zona waktu Asia/Jakarta.
 */
export async function getGrossProfitReport(
  roomId: string,
  periodInput: string = "month",
  now = new Date()
): Promise<GrossProfitReport> {
  const period: ProfitPeriod =
    periodInput === "today" || periodInput === "week" || periodInput === "month"
      ? periodInput
      : "month";

  const bounds = getJakartaPeriodBounds(period, now);

  const [activeSales, cancelledSalesCount, previousActiveSales] = await Promise.all([
    prisma.sale.findMany({
      where: {
        roomId,
        createdAt: { gte: bounds.startDate, lte: bounds.endDate },
        status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
      },
      select: {
        id: true,
        totalAmount: true,
        discountAmount: true,
        totalCost: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            unitCost: true,
            subtotal: true,
            totalCost: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sale.count({
      where: {
        roomId,
        createdAt: { gte: bounds.startDate, lte: bounds.endDate },
        status: { in: ["DIBATALKAN", "DIKEMBALIKAN"] },
      },
    }),
    prisma.sale.findMany({
      where: {
        roomId,
        createdAt: { gte: bounds.previousStartDate, lte: bounds.previousEndDate },
        status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
      },
      select: {
        id: true,
        totalAmount: true,
        discountAmount: true,
        totalCost: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            unitCost: true,
            subtotal: true,
            totalCost: true,
          },
        },
      },
    }),
  ]);

  const current = summarizeSalesPeriod(activeSales);
  const previous = summarizeSalesPeriod(previousActiveSales);

  // Bangun seri grafik kontinu per periode (24 jam WIB untuk Hari Ini, 7 hari Senin-Minggu, atau 1 bulan penuh WIB)
  const bucketMap = new Map<string, ProfitSeriesPoint>();
  const todayKey = getJakartaDateKey(now);
  const currentHour = getJakartaCurrentHour(now);

  if (period === "today") {
    for (let h = 0; h < 24; h += 1) {
      const key = `${String(h).padStart(2, "0")}:00`;
      bucketMap.set(key, {
        key,
        label: `${key} WIB`,
        shortLabel: key,
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        salesCount: 0,
        isFuture: h > currentHour,
      });
    }
  } else if (period === "week") {
    const mondayKey = getJakartaDateKey(bounds.startDate);
    for (let i = 0; i < 7; i += 1) {
      const dateKey = addJakartaDays(mondayKey, i);
      bucketMap.set(dateKey, {
        key: dateKey,
        label: formatShortDayLabel(dateKey),
        shortLabel: formatWeekdayShort(dateKey),
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        salesCount: 0,
        isFuture: dateKey > todayKey,
      });
    }
  } else {
    const { year, monthIndex } = getJakartaDateParts(now);
    const daysInMonth = getJakartaDaysInMonth(year, monthIndex);
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateKey = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      bucketMap.set(dateKey, {
        key: dateKey,
        label: formatShortDayLabel(dateKey),
        shortLabel: formatDayMonthShort(dateKey),
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        salesCount: 0,
        isFuture: dateKey > todayKey,
      });
    }
  }

  for (const sale of activeSales) {
    const key =
      period === "today"
        ? getJakartaHourKey(sale.createdAt)
        : getJakartaDateKey(sale.createdAt);
    const label = period === "today" ? `${key} WIB` : formatShortDayLabel(key);
    const shortLabel =
      period === "today"
        ? key
        : period === "week"
        ? formatWeekdayShort(key)
        : formatDayMonthShort(key);
    const saleCogs =
      sale.items.length > 0
        ? sale.items.reduce(
            (sum, it) =>
              sum + (it.totalCost > 0 ? it.totalCost : Math.round((it.unitCost || 0) * it.quantity)),
            0
          )
        : sale.totalCost;

    const existing = bucketMap.get(key) || {
      key,
      label,
      shortLabel,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      salesCount: 0,
      isFuture: false,
    };
    existing.netRevenue += sale.totalAmount;
    existing.cogs += saleCogs;
    existing.grossProfit += sale.totalAmount - saleCogs;
    existing.salesCount += 1;
    existing.isFuture = false;
    bucketMap.set(key, existing);
  }

  const chartSeries = Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  const hasIncompleteCostData = current.incompleteCostItemsCount > 0;
  const warningMessage = hasIncompleteCostData
    ? `Terdapat ${current.incompleteCostItemsCount} baris produk terjual yang belum memiliki harga modal (HPP) saat transaksi dicatat (${current.incompleteProductNames.join(", ")}). Lengkapi harga modal pada katalog produk agar perhitungan keuntungan kotor ke depan sepenuhnya akurat.`
    : null;

  const hasComparisonData = previousActiveSales.length > 0;
  const grossProfitDeltaRp = current.grossProfit - previous.grossProfit;
  const grossProfitDeltaPct =
    hasComparisonData && previous.grossProfit !== 0
      ? Number(((grossProfitDeltaRp / Math.abs(previous.grossProfit)) * 100).toFixed(1))
      : null;
  const revenueDeltaPct =
    hasComparisonData && previous.netSalesRevenue > 0
      ? Number(
          (((current.netSalesRevenue - previous.netSalesRevenue) / previous.netSalesRevenue) * 100).toFixed(1)
        )
      : null;

  return {
    period,
    timezone: "Asia/Jakarta",
    periodLabel: bounds.label,
    previousPeriodLabel: bounds.previousLabel,
    startDate: bounds.startDate.toISOString(),
    endDate: bounds.endDate.toISOString(),
    formula: "Keuntungan Kotor = Pendapatan Penjualan Bersih - Harga Pokok Penjualan (HPP)",
    disclaimer:
      "Angka di atas adalah Keuntungan Kotor (Gross Profit) berbasis harga modal historis saat transaksi terjadi, bukan keuntungan bersih karena belum dikurangi biaya operasional (listrik, sewa, gaji, dll.).",
    metrics: {
      grossProfit: current.grossProfit,
      netSalesRevenue: current.netSalesRevenue,
      grossSalesSubtotal: current.grossSalesSubtotal,
      totalDiscounts: current.totalDiscounts,
      totalCogs: current.totalCogs,
      grossMarginPct: current.grossMarginPct,
      activeSalesCount: activeSales.length,
      cancelledSalesCount,
      totalUnitsSold: current.totalUnitsSold,
    },
    dataQuality: {
      isCalculationComplete: !hasIncompleteCostData,
      hasIncompleteCostData,
      incompleteCostItemsCount: current.incompleteCostItemsCount,
      incompleteProductNames: current.incompleteProductNames,
      warningMessage,
    },
    comparison: {
      hasComparisonData,
      previousGrossProfit: previous.grossProfit,
      previousNetRevenue: previous.netSalesRevenue,
      previousTotalCogs: previous.totalCogs,
      previousSalesCount: previousActiveSales.length,
      grossProfitDeltaRp,
      grossProfitDeltaPct,
      revenueDeltaPct,
    },
    chartSeries,
  };
}

