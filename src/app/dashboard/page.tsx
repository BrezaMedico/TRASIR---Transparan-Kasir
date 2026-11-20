"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import {
  ArrowUpRight,
  MagnifyingGlass,
  Storefront,
  FilePlus,
  ClipboardText,
  WarningOctagon,
  CheckCircle,
  Clock,
  ChartBar,
  Package,
} from "@phosphor-icons/react";

interface DashboardPayload {
  isWarehouseOnly: boolean;
  kpis: {
    totalRevenue: number;
    totalPurchases: number;
    totalCogs: number;
    estimatedGrossProfit: number;
    discrepancyItemsCount: number;
    totalProductsCount: number;
    lowStockCount: number;
  };
  chartSeries: {
    date: string;
    sales: number;
    purchases: number;
    grossProfit: number;
  }[];
  approvalQueue: {
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
      requestedBy: { name: string; role: string };
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
    discrepantShifts: {
      id: string;
      totalDifference: number;
      createdAt: string;
      cashier: { name: string };
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

export default function DashboardPage() {
  const [range, setRange] = useState<"today" | "week" | "month">("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueTab, setQueueTab] = useState<"purchases" | "amendments" | "adjustments">("purchases");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Gagal memuat data dashboard.");
        return;
      }
      setData(json);
    } catch {
      setErrorMsg("Gagal terhubung ke server database.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <AppShell>
      {(session) => {
        const q = searchQuery.trim().toLowerCase();

        const filteredQueuePurchases = (data?.approvalQueue.purchases || []).filter(
          (p) =>
            !q ||
            p.invoiceNumber.toLowerCase().includes(q) ||
            p.supplierName.toLowerCase().includes(q) ||
            p.submittedBy.name.toLowerCase().includes(q)
        );
        const filteredQueueAmendments = (data?.approvalQueue.amendments || []).filter(
          (a) =>
            !q ||
            a.sale.receiptNumber.toLowerCase().includes(q) ||
            a.reason.toLowerCase().includes(q) ||
            a.requestedBy.name.toLowerCase().includes(q)
        );
        const filteredQueueAdjustments = (data?.approvalQueue.adjustments || []).filter(
          (a) =>
            !q ||
            a.product.name.toLowerCase().includes(q) ||
            a.reason.toLowerCase().includes(q) ||
            a.requestedBy.name.toLowerCase().includes(q)
        );

        const maxChartVal = Math.max(
          1,
          ...(data?.chartSeries || []).flatMap((c) => [c.sales, c.purchases, Math.abs(c.grossProfit)])
        );

        return (
          <div className="space-y-6">
            {/* Top Controls: Title, Range Filter, Global Search & Quick Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {data?.isWarehouseOnly
                    ? "Dashboard Ringkasan Stok & Pengadaan"
                    : "Pusat Kendali & Persetujuan Cepat"}
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Ringkasan kesehatan finansial, pergerakan stok, anomali audit, dan antrean persetujuan real-time
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Global Search */}
                <div className="relative flex-1 sm:flex-initial sm:w-64">
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
                    placeholder="Cari nota, struk, produk..."
                    aria-label="Pencarian global di dashboard"
                    className="w-full pl-9 pr-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>

                {/* Time Range Filter Pills */}
                <div
                  role="group"
                  aria-label="Filter rentang waktu"
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
                      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
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
                    className="h-32 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse flex flex-col justify-between"
                  >
                    <div className="h-4 w-28 bg-slate-200 rounded" />
                    <div className="h-7 w-40 bg-slate-200 rounded" />
                  </div>
                ))}
              </div>
            ) : data ? (
              <>
                {/* ROW 1: 4 KPI Cards (Clicking leads to Page 8 Laporan Keuangan or Page 7 Inventaris) */}
                {data.isWarehouseOnly ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Link
                      href="/produk"
                      className="group bg-[#334E6B] text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:bg-[#24384E] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">
                          Total Produk Terdaftar
                        </span>
                        <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                          <Package size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums mt-3">
                        {formatNumber(data.kpis.totalProductsCount)} Produk
                      </p>
                      <p className="text-[11px] text-slate-200 mt-2">
                        Klik untuk melihat Katalog Produk & Satuan
                      </p>
                    </Link>

                    <Link
                      href="/inventaris"
                      className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          Peringatan Stok Menipis
                        </span>
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-3">
                        {formatNumber(data.kpis.lowStockCount)} Item
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        Barang berada di bawah batas stok minimum
                      </p>
                    </Link>

                    <Link
                      href="/inventaris"
                      className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          Jumlah Item Selisih Stok
                        </span>
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-3">
                        {formatNumber(data.kpis.discrepancyItemsCount)} Item
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        Temuan selisih dari sesi Stok Opname
                      </p>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Hero Card (#334E6B Donezo style) */}
                    <Link
                      href="/laporan"
                      className="group bg-[#334E6B] text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:bg-[#24384E] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">
                          Total Pendapatan
                        </span>
                        <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums mt-3">
                        {formatRupiah(data.kpis.totalRevenue)}
                      </p>
                      <p className="text-[11px] text-slate-200 mt-2">
                        Penjualan bersih tercatat • Buka Laporan Keuangan
                      </p>
                    </Link>

                    <Link
                      href="/laporan"
                      className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          Total Pembelian (Disetujui)
                        </span>
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-3">
                        {formatRupiah(data.kpis.totalPurchases)}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        Pengeluaran stok yang telah disetujui Pemilik
                      </p>
                    </Link>

                    <Link
                      href="/laporan"
                      className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          Estimasi Laba Kotor
                        </span>
                        <span className="w-8 h-8 rounded-full bg-[#F0FDFA] text-[#0F766E] flex items-center justify-center">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-2xl font-extrabold font-mono tabular-nums text-[#0F766E] mt-3">
                        {formatRupiah(data.kpis.estimatedGrossProfit)}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        Penjualan dikurangi HPP ({formatRupiah(data.kpis.totalCogs)})
                      </p>
                    </Link>

                    <Link
                      href="/inventaris"
                      className="group bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[#334E6B] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600">
                          Jumlah Item Selisih Stok
                        </span>
                        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center">
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </span>
                      </div>
                      <p
                        className={`text-2xl font-extrabold font-mono tabular-nums mt-3 ${
                          data.kpis.discrepancyItemsCount > 0
                            ? "text-[#9F1239]"
                            : "text-slate-900"
                        }`}
                      >
                        {formatNumber(data.kpis.discrepancyItemsCount)} Item
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        Berdasarkan hasil pencocokan stok fisik (Opname)
                      </p>
                    </Link>
                  </div>
                )}

                {/* ROW 2: Interactive Financial Visualization (Purchases vs Sales & Gross Profit Trend) */}
                {!data.isWarehouseOnly && (
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
                          Perbandingan Pembelian vs Penjualan & Tren Keuntungan Kotor
                        </h2>
                        <p className="text-xs text-slate-600">
                          Dihitung langsung dari transaksi penjualan aktif dan pembelian yang telah disetujui di database
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <span className="w-3 h-3 rounded-sm bg-[#334E6B]" aria-hidden="true" />
                          Penjualan
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <span className="w-3 h-3 rounded-sm bg-[#FC5086]" aria-hidden="true" />
                          Pembelian Disetujui
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <span className="w-3 h-3 rounded-sm bg-[#3DC2CA]" aria-hidden="true" />
                          Laba Kotor
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
                          Belum ada transaksi yang tercatat pada periode ini.
                        </p>
                        <p className="text-xs text-slate-600 max-w-md mx-auto">
                          Grafik hanya menampilkan data aktual dari database. Catat penjualan di Kasir (POS) atau setujui pengajuan pembelian untuk melihat grafik perkembangan.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto pt-2">
                        <div className="min-w-[520px] grid grid-cols-1 gap-3">
                          {data.chartSeries.map((row) => {
                            const salesPct = Math.max(4, Math.round((row.sales / maxChartVal) * 100));
                            const purchPct = Math.max(
                              4,
                              Math.round((row.purchases / maxChartVal) * 100)
                            );
                            const profitPct = Math.max(
                              4,
                              Math.round((Math.max(0, row.grossProfit) / maxChartVal) * 100)
                            );
                            return (
                              <div
                                key={row.date}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between text-xs font-bold text-slate-800 gap-2">
                                  <span className="font-mono">{row.date}</span>
                                  <div className="flex flex-wrap items-center gap-4 font-mono">
                                    <span className="text-[#334E6B]">
                                      Jual: {formatRupiah(row.sales)}
                                    </span>
                                    <span className="text-[#9F1239]">
                                      Beli: {formatRupiah(row.purchases)}
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
                                      style={{ width: `${salesPct}%` }}
                                      title={`Penjualan: ${formatRupiah(row.sales)}`}
                                    />
                                  </div>
                                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#FC5086] rounded-full"
                                      style={{ width: `${purchPct}%` }}
                                      title={`Pembelian: ${formatRupiah(row.purchases)}`}
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
                )}

                {/* ROW 3: 2 Operational Columns (Left: Quick Approval Queue, Right: Anomalies & Quick Actions) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Antrean Persetujuan Cepat */}
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
                            Antrean Persetujuan Cepat
                          </h2>
                        </div>
                        <StatusBadge
                          status="MENUNGGU_PERSETUJUAN"
                          customLabel={`${
                            data.approvalQueue.purchases.length +
                            data.approvalQueue.amendments.length +
                            data.approvalQueue.adjustments.length
                          } Menunggu`}
                        />
                      </div>

                      {/* Horizontal Tabs for Queue */}
                      <div
                        role="tablist"
                        aria-label="Kategori antrean persetujuan"
                        className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={queueTab === "purchases"}
                          onClick={() => setQueueTab("purchases")}
                          className={`px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            queueTab === "purchases"
                              ? "bg-white text-[#334E6B] shadow-sm"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Pembelian ({filteredQueuePurchases.length})
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={queueTab === "amendments"}
                          onClick={() => setQueueTab("amendments")}
                          className={`px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            queueTab === "amendments"
                              ? "bg-white text-[#334E6B] shadow-sm"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Transaksi ({filteredQueueAmendments.length})
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={queueTab === "adjustments"}
                          onClick={() => setQueueTab("adjustments")}
                          className={`px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            queueTab === "adjustments"
                              ? "bg-white text-[#334E6B] shadow-sm"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          Stok ({filteredQueueAdjustments.length})
                        </button>
                      </div>

                      {/* Tab Content */}
                      <div className="space-y-2.5 max-h-80 overflow-y-auto">
                        {queueTab === "purchases" &&
                          (filteredQueuePurchases.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              Tidak ada pengajuan pembelian yang menunggu persetujuan.
                            </div>
                          ) : (
                            filteredQueuePurchases.map((p) => (
                              <Link
                                key={p.id}
                                href={`/pembelian/${p.id}`}
                                className="block p-3.5 rounded-xl border border-slate-200 hover:border-[#334E6B] bg-slate-50/60 hover:bg-white transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-extrabold text-slate-900">
                                      #{p.invoiceNumber}: {p.supplierName}
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      Diajukan oleh {p.submittedBy.name} ({p.submittedBy.role}) •{" "}
                                      {formatDateTimeJakarta(p.createdAt)}
                                    </p>
                                  </div>
                                  <span className="font-mono text-xs font-extrabold text-[#334E6B]">
                                    {formatRupiah(p.totalAmount)}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <StatusBadge status={p.aiValidationStatus} />
                                  <span className="text-[11px] font-bold text-[#334E6B]">
                                    Periksa & Putuskan →
                                  </span>
                                </div>
                              </Link>
                            ))
                          ))}

                        {queueTab === "amendments" &&
                          (filteredQueueAmendments.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              Tidak ada pengajuan pembatalan/retur/perubahan transaksi kasir.
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

                        {queueTab === "adjustments" &&
                          (filteredQueueAdjustments.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              Tidak ada pengajuan perubahan stok yang menunggu persetujuan.
                            </div>
                          ) : (
                            filteredQueueAdjustments.map((adj) => (
                              <Link
                                key={adj.id}
                                href="/inventaris"
                                className="block p-3.5 rounded-xl border border-slate-200 hover:border-[#334E6B] bg-slate-50/60 hover:bg-white transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-extrabold text-slate-900">
                                      {adj.adjustmentType}: {adj.product.name}
                                    </p>
                                    <p className="text-[11px] text-slate-600 mt-0.5">
                                      Oleh {adj.requestedBy.name} • Alasan: {adj.reason}
                                    </p>
                                  </div>
                                  <span className="font-mono text-xs font-bold text-[#9F1239]">
                                    {formatNumber(adj.quantity)} {adj.product.sellUnit}
                                  </span>
                                </div>
                              </Link>
                            ))
                          ))}
                      </div>
                    </div>
                  </section>

                  {/* Right Column: Panel Anomali & Aktivitas Perlu Diperiksa + Tombol Aksi Cepat */}
                  <section
                    aria-labelledby="anomaly-panel-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <WarningOctagon
                            size={20}
                            weight="duotone"
                            className="text-[#9F1239]"
                            aria-hidden="true"
                          />
                          <h2
                            id="anomaly-panel-heading"
                            className="text-base font-extrabold text-slate-900"
                          >
                            Panel Anomali & Temuan Perlu Diperiksa
                          </h2>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600">
                          Evaluasi Berbasis Bukti
                        </span>
                      </div>

                      <div className="space-y-2.5 max-h-64 overflow-y-auto">
                        {data.anomalies.aiFlaggedPurchases.length === 0 &&
                        data.anomalies.discrepantShifts.length === 0 &&
                        data.anomalies.exceedingOpnameItems.length === 0 ? (
                          <div className="py-8 px-4 text-center bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl space-y-1">
                            <CheckCircle
                              size={24}
                              weight="fill"
                              className="mx-auto text-[#166534]"
                              aria-hidden="true"
                            />
                            <p className="text-xs font-bold text-[#166534]">
                              Tidak Ada Temuan Anomali Aktif
                            </p>
                            <p className="text-[11px] text-[#166534]/90">
                              Seluruh nota pembelian, rekonsiliasi kas shift, dan stok opname berada dalam batas wajar.
                            </p>
                          </div>
                        ) : (
                          <>
                            {data.anomalies.aiFlaggedPurchases.map((p) => (
                              <Link
                                key={p.id}
                                href={`/pembelian/${p.id}`}
                                className="block p-3 rounded-xl bg-[#FFF1F2]/60 border border-[#FECDD3] hover:bg-[#FFF1F2] transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[#9F1239]">
                                    Nota Perlu Diperiksa: #{p.invoiceNumber} ({p.supplierName})
                                  </span>
                                  <StatusBadge status={p.aiValidationStatus} />
                                </div>
                                <p className="text-[11px] text-slate-700 mt-1">
                                  Pengaju: {p.submittedBy.name} • Nilai:{" "}
                                  <span className="font-mono font-bold">
                                    {formatRupiah(p.totalAmount)}
                                  </span>
                                </p>
                              </Link>
                            ))}

                            {data.anomalies.discrepantShifts.map((sh) => (
                              <Link
                                key={sh.id}
                                href="/penjualan"
                                className="block p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FEF3C7]/70 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-[#B45309]">
                                    Selisih Kas Tutup Shift ({sh.cashier.name})
                                  </span>
                                  <StatusBadge status="PERLU_DIPERIKSA" />
                                </div>
                                <p className="text-[11px] text-slate-700 mt-1">
                                  Selisih tercatat:{" "}
                                  <span className="font-mono font-bold">
                                    {formatRupiah(sh.totalDifference)}
                                  </span>{" "}
                                  • {formatDateTimeJakarta(sh.createdAt)}
                                </p>
                              </Link>
                            ))}

                            {data.anomalies.exceedingOpnameItems.map((op) => (
                              <Link
                                key={op.id}
                                href="/inventaris"
                                className="block p-3 rounded-xl bg-[#FFF1F2]/60 border border-[#FECDD3] hover:bg-[#FFF1F2] transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-slate-900">
                                    Selisih Stok Melewati Toleransi: {op.product.name}
                                  </span>
                                  <StatusBadge status={op.toleranceStatus} />
                                </div>
                                <p className="text-[11px] text-slate-700 mt-1">
                                  Selisih:{" "}
                                  <span className="font-mono font-bold">
                                    {formatNumber(op.differenceUnit)} {op.product.sellUnit}
                                  </span>{" "}
                                  (Nilai: {formatRupiah(op.lossValueRp)}) • Sesi: {op.session.title}
                                </p>
                              </Link>
                            ))}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="pt-4 border-t border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-700">Tombol Aksi Cepat Operasional</p>
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
                        {session.permissions.pembelian?.canCreate && (
                          <Link
                            href="/pembelian/input"
                            className="flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] text-xs font-bold hover:bg-[#CCFBF1] transition-colors"
                          >
                            <FilePlus size={16} weight="bold" aria-hidden="true" />
                            <span>Catat Pembelian</span>
                          </Link>
                        )}
                        {session.permissions.inventaris?.canCreate && (
                          <Link
                            href="/inventaris"
                            className="flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
                          >
                            <ClipboardText size={16} weight="bold" aria-hidden="true" />
                            <span>Mulai Stok Opname</span>
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
