"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData, setCachedData } from "@/lib/client-cache";
import type { GrossProfitReport } from "@/lib/queries/profit";
import {
  ArrowUpRight,
  MagnifyingGlass,
  Storefront,
  Receipt,
  Plus,
  Warning,
  CheckCircle,
  Clock,
  ChartBar,
  TrendUp,
  TrendDown,
  Info,
  Package,
} from "@phosphor-icons/react";

interface DashboardPayload {
  period: "today" | "week" | "month";
  profit: GrossProfitReport;
  kpis: {
    totalRevenue: number;
    totalPurchases: number;
    totalCogs: number;
    estimatedGrossProfit: number;
    grossMarginPct: number;
    discrepancyItemsCount: number;
    totalProductsCount: number;
    lowStockCount: number;
  };
  chartSeries: GrossProfitReport["chartSeries"];
  approvalQueue: {
    productRequests: {
      id: string;
      sku: string;
      name: string;
      sellPrice: number;
      costPrice: number;
      createdAt: string;
      category: { name: string; areaType: string };
      requestedBy: { id: string; name: string; role: string };
    }[];
    purchases: {
      id: string;
      invoiceNumber: string;
      supplierName: string;
      totalAmount: number;
      aiValidationStatus: string;
      createdAt: string;
      submittedBy: { name: string; role: string };
    }[];
    amendments: {
      id: string;
      amendmentType: string;
      reason: string;
      createdAt: string;
      sale: { receiptNumber: string; totalAmount: number };
      requestedBy: { id: string; name: string; role: string };
    }[];
    adjustments: {
      id: string;
      adjustmentType: string;
      quantity: number;
      reason: string;
      createdAt: string;
      product: { name: string; sellUnit: string };
      requestedBy: { name: string; role: string };
    }[];
  };
  anomalies: {
    aiFlaggedPurchases: {
      id: string;
      invoiceNumber: string;
      supplierName: string;
      aiValidationStatus: string;
      totalAmount: number;
      submittedBy: { name: string };
    }[];
    exceedingOpnameItems: {
      id: string;
      areaType: string;
      differenceUnit: number;
      lossValueRp: number;
      toleranceStatus: string;
      product: { name: string; sellUnit: string };
      session: { title: string; createdAt: string };
    }[];
  };
  lowStockProducts: {
    id: string;
    sku: string;
    name: string;
    currentStock: number;
    minStockAlert: number;
    sellUnit: string;
    category: { name: string; areaType: string };
  }[];
}

export function DashboardClient({
  initialData = null,
}: {
  initialData?: DashboardPayload | null;
}) {
  const [range, setRange] = useState<"today" | "week" | "month">("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueTab, setQueueTab] = useState<"productRequests" | "amendments">("productRequests");
  const [data, setData] = useState<DashboardPayload | null>(() => {
    if (initialData) {
      setCachedData("/api/dashboard?range=month", initialData);
      return initialData;
    }
    return getCachedData<DashboardPayload>("/api/dashboard?range=month") ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => !data);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const skippedFirstFetch = useRef(Boolean(initialData));

  const loadDashboard = useCallback(
    async (silent = false) => {
      const url = `/api/dashboard?range=${range}`;
      const cached = getCachedData<DashboardPayload>(url);
      if (cached) {
        setData(cached);
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }
      setErrorMsg(null);
      try {
        const { ok, data: json } = await fetchJsonCached<DashboardPayload & { error?: string }>(
          url,
          { force: true }
        );
        if (!ok) {
          if (!cached) {
            setErrorMsg(json.error || "Gagal memuat data dashboard.");
          }
          return;
        }
        setData(json);
      } catch {
        if (!cached) {
          setErrorMsg("Gagal terhubung ke server database.");
        }
      } finally {
        setLoading(false);
      }
    },
    [range]
  );

  useEffect(() => {
    if (skippedFirstFetch.current && range === "month") {
      skippedFirstFetch.current = false;
      return;
    }
    loadDashboard();
  }, [loadDashboard, range]);

  return (
    <AppShell>
      {(session) => {
        const q = searchQuery.trim().toLowerCase();

        const filteredProductReqs = (data?.approvalQueue.productRequests || []).filter(
          (pr) =>
            !q ||
            pr.name.toLowerCase().includes(q) ||
            pr.sku.toLowerCase().includes(q) ||
            pr.requestedBy.name.toLowerCase().includes(q)
        );
        const filteredQueueAmendments = (data?.approvalQueue.amendments || []).filter(
          (a) =>
            !q ||
            a.sale.receiptNumber.toLowerCase().includes(q) ||
            a.reason.toLowerCase().includes(q) ||
            a.requestedBy.name.toLowerCase().includes(q)
        );

        const totalPendingQueue =
          (data?.approvalQueue.productRequests.length || 0) +
          (data?.approvalQueue.amendments.length || 0);

        const maxChartVal = Math.max(
          1,
          ...(data?.chartSeries || []).flatMap((c) => [
            c.netRevenue,
            c.cogs,
            Math.abs(c.grossProfit),
          ])
        );

        const profit = data?.profit;

        return (
          <div className="space-y-6">
            {/* Header & Pemilih Periode Keuntungan Kotor */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Dashboard Keuntungan Kotor &amp; Pusat Persetujuan
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Ringkasan keuntungan kotor berbasis HPP historis ({profit?.periodLabel || "Asia/Jakarta"}) serta antrean persetujuan ruangan
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 sm:flex-initial sm:w-60">
                  <MagnifyingGlass
                    size={16}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari produk, struk, nota..."
                    aria-label="Pencarian cepat di dashboard"
                    className="w-full pl-9 pr-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>

                {/* 3 Pilihan Periode: Hari Ini, Minggu Ini (mulai Senin), Bulan Ini */}
                <div
                  role="group"
                  aria-label="Filter periode keuntungan kotor"
                  className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200"
                >
                  {(
                    [
                      { id: "today", label: "Hari Ini" },
                      { id: "week", label: "Minggu Ini" },
                      { id: "month", label: "Bulan Ini" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRange(item.id)}
                      className={`px-3.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        range === item.id
                          ? "bg-[#334E6B] text-white shadow-sm"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] text-xs font-semibold text-[#9F1239]"
              >
                {errorMsg}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-36 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse flex flex-col justify-between"
                  >
                    <div className="h-4 w-28 bg-slate-200 rounded" />
                    <div className="h-7 w-40 bg-slate-200 rounded" />
                    <div className="h-3 w-36 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : data && profit ? (
              <>
                {/* Peringatan Jujur jika Data Harga Modal (HPP) Tidak Lengkap */}
                {profit.dataQuality.hasIncompleteCostData && profit.dataQuality.warningMessage && (
                  <div
                    role="alert"
                    className="p-4 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-3"
                  >
                    <Warning size={20} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" aria-hidden="true" />
                    <div className="space-y-0.5">
                      <p className="font-extrabold">
                        Data Harga Modal (HPP) Belum Lengkap untuk Perhitungan Akurat
                      </p>
                      <p>{profit.dataQuality.warningMessage}</p>
                    </div>
                  </div>
                )}

                {/* BARIS 1: 4 Kartu Keuntungan Kotor (Gross Profit) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Hero Card: Total Keuntungan Kotor */}
                  <Link
                    href="/laporan"
                    className="group bg-[#334E6B] text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:bg-[#24384E] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        Total Keuntungan Kotor
                      </span>
                      <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                        <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="text-2xl font-extrabold font-mono tabular-nums mt-3">
                      {formatRupiah(profit.metrics.grossProfit)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      {profit.comparison.hasComparisonData &&
                      profit.comparison.grossProfitDeltaPct !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold ${
                            profit.comparison.grossProfitDeltaRp >= 0
                              ? "bg-emerald-400/20 text-emerald-100"
                              : "bg-rose-400/20 text-rose-100"
                          }`}
                        >
                          {profit.comparison.grossProfitDeltaRp >= 0 ? (
                            <TrendUp size={12} weight="bold" aria-hidden="true" />
                          ) : (
                            <TrendDown size={12} weight="bold" aria-hidden="true" />
                          )}
                          <span>
                            {profit.comparison.grossProfitDeltaRp >= 0 ? "+" : ""}
                            {profit.comparison.grossProfitDeltaPct}% vs {profit.previousPeriodLabel}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-200">
                          Penjualan Bersih dikurangi HPP
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Kartu 2: Pendapatan Penjualan Bersih */}
                  <Link
                    href="/penjualan"
                    className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">
                        Total Pendapatan Penjualan
                      </span>
                      <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                        <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-3">
                      {formatRupiah(profit.metrics.netSalesRevenue)}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-2">
                      {formatNumber(profit.metrics.activeSalesCount)} transaksi aktif
                      {profit.metrics.totalDiscounts > 0
                        ? ` (Diskon ${formatRupiah(profit.metrics.totalDiscounts)})`
                        : ""}
                      {profit.metrics.cancelledSalesCount > 0
                        ? ` • ${profit.metrics.cancelledSalesCount} dibatalkan`
                        : ""}
                    </p>
                  </Link>

                  {/* Kartu 3: Total HPP */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">
                        Total HPP (Modal Terjual)
                      </span>
                      <span className="w-8 h-8 rounded-full bg-[#FFFBEB] text-[#B45309] flex items-center justify-center">
                        <Package size={16} weight="bold" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="text-2xl font-extrabold font-mono tabular-nums text-[#B45309] mt-3">
                      {formatRupiah(profit.metrics.totalCogs)}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-2">
                      Harga modal historis dari {formatNumber(profit.metrics.totalUnitsSold)} unit terjual
                    </p>
                  </div>

                  {/* Kartu 4: Margin Keuntungan Kotor */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">
                        Margin Keuntungan Kotor
                      </span>
                      <span className="w-8 h-8 rounded-full bg-[#F0FDFA] text-[#0F766E] flex items-center justify-center">
                        <TrendUp size={16} weight="bold" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="text-2xl font-extrabold font-mono tabular-nums text-[#0F766E] mt-3">
                      {profit.metrics.grossMarginPct}%
                    </p>
                    <p className="text-[11px] text-slate-600 mt-2">
                      {profit.comparison.hasComparisonData
                        ? `Periode lalu (${profit.previousPeriodLabel}): ${formatRupiah(
                            profit.comparison.previousGrossProfit
                          )}`
                        : "Rasio laba kotor terhadap penjualan bersih"}
                    </p>
                  </div>
                </div>

                {/* Penjelasan Rumus & Batasan Gross Profit */}
                <div className="p-3.5 rounded-2xl bg-[#F0FDFA] border border-[#99F6E4] text-xs text-[#0F766E] flex items-start gap-2.5">
                  <Info size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                  <p>
                    <strong>{profit.formula}.</strong> {profit.disclaimer}
                  </p>
                </div>

                {/* BARIS 2: Grafik Perkembangan Keuntungan Kotor */}
                <section
                  aria-labelledby="chart-section-heading"
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2
                        id="chart-section-heading"
                        className="text-base font-extrabold text-slate-900"
                      >
                        Grafik Perkembangan Keuntungan Kotor ({profit.periodLabel})
                      </h2>
                      <p className="text-xs text-slate-600">
                        Perbandingan pendapatan penjualan bersih, HPP historis, dan keuntungan kotor (transaksi dibatalkan otomatis dikecualikan)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span className="w-3 h-3 rounded-sm bg-[#334E6B]" aria-hidden="true" />
                        Pendapatan
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span className="w-3 h-3 rounded-sm bg-[#FC5086]" aria-hidden="true" />
                        HPP
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span className="w-3 h-3 rounded-sm bg-[#3DC2CA]" aria-hidden="true" />
                        Keuntungan Kotor
                      </span>
                    </div>
                  </div>

                  {data.chartSeries.length === 0 ? (
                    <div className="py-12 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
                      <ChartBar
                        size={32}
                        weight="duotone"
                        className="mx-auto text-slate-400"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-bold text-slate-800">
                        Belum ada transaksi aktif pada periode {profit.periodLabel}.
                      </p>
                      <p className="text-xs text-slate-600 max-w-md mx-auto">
                        Catat penjualan di halaman Kasir (POS) untuk melihat perkembangan pendapatan, HPP, dan keuntungan kotor secara otomatis.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto pt-1">
                      <div className="min-w-[520px] grid grid-cols-1 gap-3">
                        {data.chartSeries.map((row) => {
                          const revPct = Math.max(4, Math.round((row.netRevenue / maxChartVal) * 100));
                          const cogsPct = Math.max(4, Math.round((row.cogs / maxChartVal) * 100));
                          const profitPct = Math.max(
                            4,
                            Math.round((Math.max(0, row.grossProfit) / maxChartVal) * 100)
                          );
                          return (
                            <div
                              key={row.key}
                              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between text-xs font-bold text-slate-800 gap-2">
                                <span className="font-mono">
                                  {row.label} ({row.salesCount} trx)
                                </span>
                                <div className="flex flex-wrap items-center gap-4 font-mono">
                                  <span className="text-[#334E6B]">
                                    Pendapatan: {formatRupiah(row.netRevenue)}
                                  </span>
                                  <span className="text-[#9F1239]">
                                    HPP: {formatRupiah(row.cogs)}
                                  </span>
                                  <span className="text-[#0F766E]">
                                    Laba Kotor: {formatRupiah(row.grossProfit)}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#334E6B] rounded-full"
                                    style={{ width: `${revPct}%` }}
                                    title={`Pendapatan: ${formatRupiah(row.netRevenue)}`}
                                  />
                                </div>
                                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#FC5086] rounded-full"
                                    style={{ width: `${cogsPct}%` }}
                                    title={`HPP: ${formatRupiah(row.cogs)}`}
                                  />
                                </div>
                                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#3DC2CA] rounded-full"
                                    style={{ width: `${profitPct}%` }}
                                    title={`Keuntungan Kotor: ${formatRupiah(row.grossProfit)}`}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                {/* BARIS 3: Antrean Persetujuan & Ringkasan Stok + Aksi Cepat */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Antrean Persetujuan Cepat (Produk Baru & Pembatalan Transaksi) */}
                  <section
                    aria-labelledby="approval-queue-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Clock size={20} weight="duotone" className="text-[#334E6B]" aria-hidden="true" />
                          <h2
                            id="approval-queue-heading"
                            className="text-base font-extrabold text-slate-900"
                          >
                            Antrean Persetujuan
                          </h2>
                        </div>
                        <StatusBadge
                          status="MENUNGGU_PERSETUJUAN"
                          customLabel={`${totalPendingQueue} Menunggu`}
                        />
                      </div>

                      <div
                        role="tablist"
                        aria-label="Kategori antrean persetujuan"
                        className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={queueTab === "productRequests"}
                          onClick={() => setQueueTab("productRequests")}
                          className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            queueTab === "productRequests"
                              ? "bg-white text-[#334E6B] shadow-sm"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Produk Baru ({filteredProductReqs.length})
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={queueTab === "amendments"}
                          onClick={() => setQueueTab("amendments")}
                          className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            queueTab === "amendments"
                              ? "bg-white text-[#334E6B] shadow-sm"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Pembatalan Transaksi ({filteredQueueAmendments.length})
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-80 overflow-y-auto">
                        {queueTab === "productRequests" &&
                          (filteredProductReqs.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              Tidak ada pengajuan produk baru yang menunggu persetujuan.
                            </div>
                          ) : (
                            filteredProductReqs.map((pr) => (
                              <Link
                                key={pr.id}
                                href="/produk?tab=requests"
                                className="block p-3.5 rounded-xl border border-slate-200 hover:border-[#334E6B] bg-slate-50/60 hover:bg-white transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-extrabold text-slate-900">
                                      {pr.name} ({pr.sku})
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      Diajukan {pr.requestedBy.name} • {pr.category.name} •{" "}
                                      {formatDateTimeJakarta(pr.createdAt)}
                                    </p>
                                  </div>
                                  <span className="font-mono text-xs font-extrabold text-[#334E6B]">
                                    {formatRupiah(pr.sellPrice)}
                                  </span>
                                </div>
                              </Link>
                            ))
                          ))}

                        {queueTab === "amendments" &&
                          (filteredQueueAmendments.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              Tidak ada pengajuan pembatalan transaksi yang menunggu.
                            </div>
                          ) : (
                            filteredQueueAmendments.map((a) => (
                              <Link
                                key={a.id}
                                href="/penjualan"
                                className="block p-3.5 rounded-xl border border-slate-200 hover:border-[#334E6B] bg-slate-50/60 hover:bg-white transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-extrabold text-slate-900">
                                      {a.amendmentType} Struk #{a.sale.receiptNumber}
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      Oleh {a.requestedBy.name} • Alasan: {a.reason}
                                    </p>
                                  </div>
                                  <span className="font-mono text-xs font-bold text-slate-900">
                                    {formatRupiah(a.sale.totalAmount)}
                                  </span>
                                </div>
                              </Link>
                            ))
                          ))}
                      </div>
                    </div>
                  </section>

                  {/* Ringkasan Stok Katalog & Aksi Cepat */}
                  <section
                    aria-labelledby="quick-actions-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Package
                            size={20}
                            weight="duotone"
                            className="text-[#334E6B]"
                            aria-hidden="true"
                          />
                          <h2
                            id="quick-actions-heading"
                            className="text-base font-extrabold text-slate-900"
                          >
                            Status Stok Produk
                          </h2>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">
                          {formatNumber(data.kpis.totalProductsCount)} Produk Aktif
                        </span>
                      </div>

                      <div className="space-y-2.5 max-h-64 overflow-y-auto">
                        {data.lowStockProducts.length === 0 ? (
                          <div className="py-8 px-4 text-center bg-[#F0FDFA] border border-[#99F6E4] rounded-xl space-y-1">
                            <CheckCircle
                              size={24}
                              weight="fill"
                              className="mx-auto text-[#0F766E]"
                              aria-hidden="true"
                            />
                            <p className="text-xs font-bold text-[#0F766E]">
                              Seluruh Stok Produk Aman
                            </p>
                            <p className="text-[11px] text-[#0F766E]/90">
                              Tidak ada produk yang berada di bawah batas minimum stok saat ini.
                            </p>
                          </div>
                        ) : (
                          data.lowStockProducts.map((prod) => (
                            <Link
                              key={prod.id}
                              href="/produk"
                              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FEF3C7]/70 transition-colors"
                            >
                              <div>
                                <p className="text-xs font-extrabold text-slate-900">
                                  {prod.name}
                                </p>
                                <p className="text-[11px] text-slate-600">
                                  {prod.category.name} • SKU: {prod.sku}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono text-xs font-extrabold text-[#9F1239]">
                                  Sisa {formatNumber(prod.currentStock)} {prod.sellUnit}
                                </p>
                                <p className="text-[10px] text-slate-600">
                                  Min: {formatNumber(prod.minStockAlert)} {prod.sellUnit}
                                </p>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Tombol Aksi Cepat Operasional */}
                    <div className="pt-4 border-t border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-700">
                        Aksi Cepat Operasional
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {session.permissions.kasir?.canView && (
                          <Link
                            href="/kasir"
                            className="flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] transition-colors"
                          >
                            <Storefront size={16} weight="bold" aria-hidden="true" />
                            <span>Buka Kasir</span>
                          </Link>
                        )}
                        {session.permissions.produk?.canView && (
                          <Link
                            href="/produk"
                            className="flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] text-xs font-bold hover:bg-[#CCFBF1] transition-colors"
                          >
                            <Plus size={16} weight="bold" aria-hidden="true" />
                            <span>Produk &amp; Stok</span>
                          </Link>
                        )}
                        {session.permissions.penjualan?.canView && (
                          <Link
                            href="/penjualan"
                            className="flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
                          >
                            <Receipt size={16} weight="bold" aria-hidden="true" />
                            <span>Riwayat Transaksi</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </>
            ) : null}
          </div>
        );
      }}
    </AppShell>
  );
}
