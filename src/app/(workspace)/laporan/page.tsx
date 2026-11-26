"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SalesLineChart } from "@/components/charts/SalesLineChart";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { addJakartaDays, getJakartaDateKey } from "@/lib/date-jakarta";
import { RUPIAH_DENOMINATIONS, type DenominationMap } from "@/lib/shift-session";
import {
  CaretDown,
  CaretUp,
  DownloadSimple,
  Info,
  ShieldCheck,
  Trophy,
  WarningOctagon,
} from "@phosphor-icons/react";

interface ShiftAuditItem {
  id: string;
  counterId?: string;
  counterName?: string;
  openedAt: string;
  closedAt: string;
  cashier: { id: string; name: string; username?: string; role: string };
  status: string;
  openingCashTotal: number;
  openingDenominations: DenominationMap | null;
  openingNote: string | null;
  closingDenominations: DenominationMap | null;
  closingNote: string | null;
  operationalExpenses: { description: string; amount: number }[];
  operationalExpenseTotal: number;
  systemTxCount: number;
  systemCashTotal: number;
  systemQrisTotal: number;
  systemTransferTotal: number;
  systemCardTotal: number;
  systemDigitalTotal: number;
  systemGrandTotal: number;
  expectedCashAtClose: number;
  actualCashTotal: number;
  cashDifference: number;
  handoverSyncStatus: "SHIFT_PERTAMA" | "SINKRON" | "TIDAK_SINKRON";
  handoverDifference: number;
  previousShiftClosingCash: number | null;
}

interface ReportPayload {
  granularity?: "hourly" | "daily" | "monthly";
  summary: {
    totalRevenue: number;
    totalPurchases: number;
    totalCogs: number;
    grossProfit: number;
    salesCount: number;
    purchasesCount: number;
  };
  chartSeries: {
    date: string;
    label?: string;
    shortLabel?: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    purchases: number;
    salesCount?: number;
    isFuture?: boolean;
  }[];
  profitableProducts: {
    productId: string;
    productName: string;
    qtySold: number;
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    marginPercent: number;
  }[];
  problematicProducts: {
    productId: string;
    productName: string;
    categoryName: string;
    areaType: string;
    discrepancyFrequency: number;
    totalUnitDiff: number;
    totalLossRp: number;
  }[];
  shiftSummary?: {
    totalShifts: number;
    discrepancyCount: number;
    handoverMismatchCount: number;
    netCashDifferenceRp: number;
  };
  shiftAudits?: ShiftAuditItem[];
}

export default function LaporanPage() {
  const { showToast } = useToast();

  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "custom">("monthly");
  const [startDate, setStartDate] = useState(() => addJakartaDays(getJakartaDateKey(), -30));
  const [endDate, setEndDate] = useState(() => getJakartaDateKey());
  const initialReport = getCachedData<ReportPayload>("/api/reports?period=monthly") ?? null;
  const [report, setReport] = useState<ReportPayload | null>(initialReport);
  const [loading, setLoading] = useState(!initialReport);
  const [shiftFilter, setShiftFilter] = useState<"ALL" | "FLAGGED">("ALL");
  const [counterFilter, setCounterFilter] = useState<string>("ALL");
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    const qs =
      period === "custom"
        ? `?period=custom&startDate=${startDate}&endDate=${endDate}`
        : `?period=${period}`;
    const url = `/api/reports${qs}`;
    const cached = getCachedData<ReportPayload>(url);
    if (cached) {
      setReport(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<ReportPayload & { error?: string }>(url, {
        force: true,
      });
      if (ok) {
        setReport(data);
      } else if (!cached) {
        showToast(data.error || "Gagal memuat laporan keuangan.", "error");
      }
    } catch {
      if (!cached) {
        showToast("Gagal menghubungi server.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, showToast]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCsv = () => {
    if (!report) return;
    const rows = [
      ["LAPORAN KEUANGAN & ANALISIS BISNIS TRASIR"],
      ["Periode", period.toUpperCase()],
      ["Total Pendapatan (Penjualan)", String(report.summary.totalRevenue)],
      ["Total Pembelian (Disetujui)", String(report.summary.totalPurchases)],
      ["Modal / HPP Barang Terjual", String(report.summary.totalCogs)],
      ["Keuntungan Kotor (Total Penjualan - HPP)", String(report.summary.grossProfit)],
      [],
      ["Tanggal", "Pendapatan (Rp)", "HPP Barang Terjual (Rp)", "Keuntungan Kotor (Rp)", "Pembelian Disetujui (Rp)"],
      ...report.chartSeries
        .filter((c) => !c.isFuture)
        .map((c) => [
          c.date,
          String(c.revenue),
          String(c.cogs),
          String(c.grossProfit),
          String(c.purchases),
        ]),
      [],
      ["AUDIT SHIFT & REKONSILIASI KAS"],
      [
        "Loket",
        "Kasir",
        "Waktu Tutup",
        "Estafet Shift Sebelumnya",
        "Modal Awal (Rp)",
        "Penjualan Tunai Sistem (Rp)",
        "Operasional (Rp)",
        "Seharusnya Ada (Rp)",
        "Fisik Loker Dihitung (Rp)",
        "Selisih Kas (Rp)",
        "Status Audit",
      ],
      ...(report.shiftAudits || []).map((s) => [
        `"${(s.counterName || "Loket 1").replace(/"/g, '""')}"`,
        `"${s.cashier.name.replace(/"/g, '""')}"`,
        `"${formatDateTimeJakarta(s.closedAt)}"`,
        s.handoverSyncStatus,
        String(s.openingCashTotal),
        String(s.systemCashTotal),
        String(s.operationalExpenseTotal),
        String(s.expectedCashAtClose),
        String(s.actualCashTotal),
        String(s.cashDifference),
        s.status,
      ]),
    ];

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan-Keuangan-TRASIR-${getJakartaDateKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Laporan Keuangan berhasil diekspor ke berkas CSV.", "success");
  };

  return (
    <AppShell>
      {() => {
        const activeGranularity =
          report?.granularity || (period === "daily" ? "hourly" : "daily");

        return (
          <div className="space-y-6">
            {/* Top Bar: Title, Period Selector (Harian, Bulanan, Rentang Kustom) & Ekspor Laporan */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Laporan Keuangan & Analisis Bisnis
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Perhitungan laba kotor akurat berbasis HPP barang terjual serta pemetaan produk paling menguntungkan dan produk bermasalah
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div
                    role="group"
                    aria-label="Pemilih periode laporan"
                    className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200"
                  >
                    {(
                      [
                        { id: "daily", label: "Harian" },
                        { id: "weekly", label: "Mingguan" },
                        { id: "monthly", label: "Bulanan" },
                        { id: "custom", label: "Rentang Kustom" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={period === p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`px-3 py-1.5 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          period === p.id
                            ? "bg-[#202531] text-white"
                            : "text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={!report}
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2a3140] disabled:opacity-40 cursor-pointer"
                  >
                    <DownloadSimple size={18} weight="bold" aria-hidden="true" />
                    <span>Ekspor Laporan (CSV)</span>
                  </button>
                </div>
              </div>

              {period === "custom" && (
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <label htmlFor="rep-start" className="text-xs font-bold text-slate-700">
                      Dari:
                    </label>
                    <input
                      id="rep-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-3 py-1.5 min-h-[38px] rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="rep-end" className="text-xs font-bold text-slate-700">
                      Sampai:
                    </label>
                    <input
                      id="rep-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-3 py-1.5 min-h-[38px] rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-600">
                Menghitung laporan keuangan dari database...
              </div>
            ) : report ? (
              <>
                {/* ROW 1: 4 Financial Cards + Mandatory Gross Profit Formula Notice */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-bold text-slate-600">Total Pendapatan (Penjualan)</p>
                      <p className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-2">
                        {formatRupiah(report.summary.totalRevenue)}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Dari {report.summary.salesCount} struk penjualan aktif
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-bold text-slate-600">Total Pembelian (Disetujui)</p>
                      <p className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-2">
                        {formatRupiah(report.summary.totalPurchases)}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Dari {report.summary.purchasesCount} nota pembelian disetujui
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <p className="text-xs font-bold text-slate-600">Modal / HPP Barang Terjual</p>
                      <p className="text-2xl font-extrabold font-mono text-[#B45309] tabular-nums mt-2">
                        {formatRupiah(report.summary.totalCogs)}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Modal barang yang benar-benar terjual (bukan sisa stok)
                      </p>
                    </div>

                    <div className="bg-[#202531] text-white rounded-2xl p-5 shadow-sm">
                      <p className="text-xs font-semibold text-slate-200">
                        Keuntungan Kotor (Penjualan - HPP)
                      </p>
                      <p className="text-2xl font-extrabold font-mono tabular-nums mt-2">
                        {formatRupiah(report.summary.grossProfit)}
                      </p>
                      <p className="text-[11px] text-slate-200 mt-1">
                        Rumus: Total Penjualan − HPP Barang Terjual
                      </p>
                    </div>
                  </div>

                  {/* Mandatory Notice per Blueprint & PDF Section 9 */}
                  <div className="p-4 rounded-2xl bg-[#EBEBEB] border border-[#202531]/15 text-xs text-[#202531] flex items-start gap-2.5">
                    <Info size={18} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-extrabold">
                        Catatan Perhitungan Laba Kotor (Keuntungan Kotor = Total Penjualan − HPP):
                      </p>
                      <p className="mt-0.5">
                        HPP merupakan modal dari barang yang benar-benar terjual, bukan seluruh nilai pembelian stok yang masih tersimpan di gudang. Angka Keuntungan Kotor di atas merupakan <strong>laba kotor</strong> dan belum dikurangi biaya operasional toko seperti listrik, sewa tempat, gaji pegawai, maupun biaya operasional lainnya.
                      </p>
                    </div>
                  </div>
                </div>

                {/* ROW 2: Grafik Garis Penjualan, Modal/HPP, & Keuntungan Kotor */}
                <SalesLineChart
                  headingId="report-line-chart-heading"
                  title="Grafik Tren Penjualan, Modal/HPP, & Keuntungan Kotor"
                  subtitle={
                    period === "daily"
                      ? "Pergerakan pendapatan, HPP, dan laba kotor per jam hari ini (WIB)"
                      : period === "weekly"
                      ? "Tren pendapatan, HPP, dan laba kotor harian sepanjang minggu ini"
                      : period === "monthly"
                      ? "Tren pendapatan, HPP, dan laba kotor harian sepanjang bulan ini"
                      : "Tren pendapatan, HPP, dan laba kotor sesuai rentang tanggal pilihan"
                  }
                  granularity={activeGranularity}
                  showCogsSeries={true}
                  data={report.chartSeries.map((c) => ({
                    key: c.date,
                    label: c.label || c.date,
                    shortLabel: c.shortLabel || c.date,
                    revenue: c.revenue,
                    grossProfit: c.grossProfit,
                    cogs: c.cogs,
                    salesCount: c.salesCount,
                    isFuture: c.isFuture,
                  }))}
                  emptyTitle="Belum ada data penjualan tercatat pada periode ini."
                  emptySubtitle="Grafik garis akan muncul otomatis setelah transaksi penjualan dicatat di Kasir."
                />

                {/* ROW 3: 2 Side-by-Side Tables (Produk Paling Menguntungkan & Produk Bermasalah) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Table 1: Produk Paling Menguntungkan */}
                  <section
                    aria-labelledby="profitable-products-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <Trophy size={20} weight="duotone" className="text-[#202531]" aria-hidden="true" />
                      <div>
                        <h2
                          id="profitable-products-heading"
                          className="text-base font-extrabold text-slate-900"
                        >
                          Daftar Produk Paling Menguntungkan
                        </h2>
                        <p className="text-xs text-slate-600">
                          Diurutkan berdasarkan kontribusi laba kotor dan margin tertinggi
                        </p>
                      </div>
                    </div>

                    {report.profitableProducts.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Belum ada produk terjual pada periode ini.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                              <th className="py-2.5 px-3">Produk</th>
                              <th className="py-2.5 px-3 text-right">Terjual</th>
                              <th className="py-2.5 px-3 text-right">Pendapatan</th>
                              <th className="py-2.5 px-3 text-right">Laba Kotor</th>
                              <th className="py-2.5 px-3 text-right">Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {report.profitableProducts.map((p) => (
                              <tr key={p.productId}>
                                <td className="py-2.5 px-3 font-bold text-slate-900">
                                  {p.productName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {formatNumber(p.qtySold)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {formatRupiah(p.totalRevenue)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#202531]">
                                  {formatRupiah(p.grossProfit)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold">
                                  {p.marginPercent}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Table 2: Produk Bermasalah (Frekuensi Selisih Stok Tertinggi) */}
                  <section
                    aria-labelledby="problematic-products-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <WarningOctagon
                        size={20}
                        weight="duotone"
                        className="text-[#D41448]"
                        aria-hidden="true"
                      />
                      <div>
                        <h2
                          id="problematic-products-heading"
                          className="text-base font-extrabold text-slate-900"
                        >
                          Daftar Produk Bermasalah (Selisih Stok)
                        </h2>
                        <p className="text-xs text-slate-600">
                          Produk yang paling sering mengalami selisih pada audit Stok Opname
                        </p>
                      </div>
                    </div>

                    {report.problematicProducts.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Tidak ada produk dengan riwayat selisih stok opname.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                              <th className="py-2.5 px-3">Produk & Area</th>
                              <th className="py-2.5 px-3 text-right">Frekuensi Selisih</th>
                              <th className="py-2.5 px-3 text-right">Akumulasi Unit</th>
                              <th className="py-2.5 px-3 text-right">Nilai Selisih (Rp)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {report.problematicProducts.map((p) => (
                              <tr key={p.productId}>
                                <td className="py-2.5 px-3">
                                  <p className="font-bold text-slate-900">{p.productName}</p>
                                  <div className="mt-0.5">
                                    <StatusBadge status={p.areaType} />
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-[#D41448]">
                                  {p.discrepancyFrequency}x Opname
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {formatNumber(p.totalUnitDiff)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#D41448]">
                                  {formatRupiah(p.totalLossRp)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>

                {/* Section: Audit Shift Kasir & Deteksi Selisih Kas */}
                <section
                  id="audit-shift"
                  aria-labelledby="shift-audit-heading"
                  className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck
                        size={22}
                        weight="duotone"
                        className="text-[#006B69] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <h2
                          id="shift-audit-heading"
                          className="text-base font-extrabold text-[#202531]"
                        >
                          Audit Shift Kasir &amp; Deteksi Selisih Kas
                        </h2>
                        <p className="text-xs text-[#525866] mt-0.5">
                          Perbandingan rahasia antara hitungan uang fisik loker kasir dengan penjualan tunai sistem serta estafet modal shift sebelumnya.
                        </p>
                      </div>
                    </div>

                    <div
                      role="group"
                      aria-label="Filter daftar audit shift"
                      className="inline-flex p-1 rounded-xl bg-[#EBEBEB]/75 border border-[#202531]/10 self-start md:self-auto"
                    >
                      <button
                        type="button"
                        aria-pressed={shiftFilter === "ALL"}
                        onClick={() => setShiftFilter("ALL")}
                        className={`px-3.5 min-h-[38px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          shiftFilter === "ALL"
                            ? "bg-[#202531] text-white"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        Semua Shift ({report.shiftSummary?.totalShifts ?? 0})
                      </button>
                      <button
                        type="button"
                        aria-pressed={shiftFilter === "FLAGGED"}
                        onClick={() => setShiftFilter("FLAGGED")}
                        className={`px-3.5 min-h-[38px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                          shiftFilter === "FLAGGED"
                            ? "bg-[#D41448] text-white"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        Bermasalah (
                        {(report.shiftAudits || []).filter(
                          (s) =>
                            s.status === "PERLU_DIPERIKSA" ||
                            s.handoverSyncStatus === "TIDAK_SINKRON"
                        ).length}
                        )
                      </button>
                    </div>
                  </div>

                  {/* 3 Ringkasan Audit Shift */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
                      <p className="text-xs font-semibold text-[#525866]">Shift Selisih Kas</p>
                      <p
                        className={`text-lg font-extrabold mt-0.5 tabular-nums ${
                          (report.shiftSummary?.discrepancyCount ?? 0) > 0
                            ? "text-[#D41448]"
                            : "text-[#006B69]"
                        }`}
                      >
                        {formatNumber(report.shiftSummary?.discrepancyCount ?? 0)} Shift
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
                      <p className="text-xs font-semibold text-[#525866]">Estafet Modal Tidak Sinkron</p>
                      <p
                        className={`text-lg font-extrabold mt-0.5 tabular-nums ${
                          (report.shiftSummary?.handoverMismatchCount ?? 0) > 0
                            ? "text-[#D41448]"
                            : "text-[#006B69]"
                        }`}
                      >
                        {formatNumber(report.shiftSummary?.handoverMismatchCount ?? 0)} Shift
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
                      <p className="text-xs font-semibold text-[#525866]">Akumulasi Selisih Tunai</p>
                      <p
                        className={`text-lg font-extrabold mt-0.5 tabular-nums ${
                          (report.shiftSummary?.netCashDifferenceRp ?? 0) < 0
                            ? "text-[#D41448]"
                            : (report.shiftSummary?.netCashDifferenceRp ?? 0) > 0
                              ? "text-[#202531]"
                              : "text-[#006B69]"
                        }`}
                      >
                        {formatRupiah(report.shiftSummary?.netCashDifferenceRp ?? 0)}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const counterOptions = Array.from(
                      new Set(
                        (report.shiftAudits || []).map((s) => s.counterName || "Loket 1")
                      )
                    );
                    const filteredAudits = (report.shiftAudits || []).filter((s) => {
                      if (
                        shiftFilter === "FLAGGED" &&
                        s.status !== "PERLU_DIPERIKSA" &&
                        s.handoverSyncStatus !== "TIDAK_SINKRON"
                      ) {
                        return false;
                      }
                      if (
                        counterFilter !== "ALL" &&
                        (s.counterName || "Loket 1") !== counterFilter
                      ) {
                        return false;
                      }
                      return true;
                    });

                    if (filteredAudits.length === 0) {
                      return (
                        <div className="space-y-3">
                          {counterOptions.length > 1 && (
                            <div className="flex justify-end">
                              <select
                                aria-label="Filter loket audit shift"
                                value={counterFilter}
                                onChange={(e) => setCounterFilter(e.target.value)}
                                className="min-h-[38px] rounded-xl border border-[#202531]/20 bg-white px-3 text-xs font-bold text-[#202531]"
                              >
                                <option value="ALL">Semua Loket</option>
                                {counterOptions.map((cname) => (
                                  <option key={cname} value={cname}>
                                    {cname}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="py-8 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            {shiftFilter === "FLAGGED"
                              ? "Tidak ada shift dengan selisih kas atau estafet bermasalah pada periode ini."
                              : "Belum ada catatan tutup shift pada periode ini."}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {counterOptions.length > 1 && (
                          <div className="flex justify-end">
                            <select
                              aria-label="Filter loket audit shift"
                              value={counterFilter}
                              onChange={(e) => setCounterFilter(e.target.value)}
                              className="min-h-[38px] rounded-xl border border-[#202531]/20 bg-white px-3 text-xs font-bold text-[#202531]"
                            >
                              <option value="ALL">Semua Loket</option>
                              {counterOptions.map((cname) => (
                                <option key={cname} value={cname}>
                                  {cname}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                                <th className="py-2.5 px-3">Loket &amp; Kasir</th>
                              <th className="py-2.5 px-3">Estafet Modal Sebelumnya</th>
                              <th className="py-2.5 px-3 text-right">Modal Awal</th>
                              <th className="py-2.5 px-3 text-right">Tunai Sistem</th>
                              <th className="py-2.5 px-3 text-right">Operasional</th>
                              <th className="py-2.5 px-3 text-right">Seharusnya</th>
                              <th className="py-2.5 px-3 text-right">Fisik Loker</th>
                              <th className="py-2.5 px-3 text-right">Selisih Kas</th>
                              <th className="py-2.5 px-3 text-center">Detail</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredAudits.map((s) => {
                              const isExpanded = expandedShiftId === s.id;
                              const isMismatch = s.status === "PERLU_DIPERIKSA";
                              const isSyncMismatch = s.handoverSyncStatus === "TIDAK_SINKRON";

                              return (
                                <React.Fragment key={s.id}>
                                  <tr className={isMismatch ? "bg-[#FFF0F4]/40" : ""}>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="inline-flex items-center rounded-md bg-[#202531] px-2 py-0.5 text-[10px] font-extrabold text-white">
                                          {s.counterName || "Loket 1"}
                                        </span>
                                        <p className="font-extrabold text-[#202531]">
                                          {s.cashier.name}
                                        </p>
                                      </div>
                                      <p className="text-[11px] text-[#525866] tabular-nums mt-0.5">
                                        {formatDateTimeJakarta(s.openedAt)} s/d{" "}
                                        {formatDateTimeJakarta(s.closedAt)}
                                      </p>
                                    </td>
                                    <td className="py-3 px-3">
                                      {s.handoverSyncStatus === "SINKRON" ? (
                                        <span className="inline-flex items-center rounded-full bg-[#E6FBFB] border border-[#006B69]/25 px-2.5 py-0.5 text-[11px] font-bold text-[#006B69]">
                                          Sinkron
                                        </span>
                                      ) : isSyncMismatch ? (
                                        <div>
                                          <span className="inline-flex items-center rounded-full bg-[#FFF0F4] border border-[#FF2A63]/35 px-2.5 py-0.5 text-[11px] font-bold text-[#D41448]">
                                            Tidak Sinkron ({formatRupiah(s.handoverDifference)})
                                          </span>
                                          {s.previousShiftClosingCash !== null && (
                                            <p className="text-[10px] text-[#525866] mt-0.5 tabular-nums">
                                              Shift lalu: {formatRupiah(s.previousShiftClosingCash)}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center rounded-full bg-[#EBEBEB] px-2.5 py-0.5 text-[11px] font-bold text-[#525866]">
                                          Shift Pertama
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                                      {formatRupiah(s.openingCashTotal)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                                      {formatRupiah(s.systemCashTotal)}
                                      <p className="text-[10px] text-[#525866]">
                                        {s.systemTxCount} tx
                                      </p>
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                                      {s.operationalExpenseTotal > 0
                                        ? formatRupiah(s.operationalExpenseTotal)
                                        : "-"}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono font-bold text-[#202531] tabular-nums">
                                      {formatRupiah(s.expectedCashAtClose)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono font-bold text-[#202531] tabular-nums">
                                      {formatRupiah(s.actualCashTotal)}
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                      <p
                                        className={`font-mono font-extrabold tabular-nums ${
                                          isMismatch
                                            ? "text-[#D41448]"
                                            : s.cashDifference === 0
                                              ? "text-[#006B69]"
                                              : "text-[#202531]"
                                        }`}
                                      >
                                        {s.cashDifference > 0
                                          ? `+${formatRupiah(s.cashDifference)}`
                                          : formatRupiah(s.cashDifference)}
                                      </p>
                                      <span
                                        className={`inline-block mt-0.5 text-[10px] font-bold ${
                                          isMismatch ? "text-[#D41448]" : "text-[#006B69]"
                                        }`}
                                      >
                                        {s.status === "SESUAI"
                                          ? "Klop"
                                          : s.status === "DALAM_TOLERANSI"
                                            ? "Dalam Toleransi"
                                            : isMismatch
                                              ? "Perlu Diperiksa"
                                              : "Tercatat"}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedShiftId(isExpanded ? null : s.id)
                                        }
                                        aria-expanded={isExpanded}
                                        className="inline-flex items-center gap-1 px-2.5 min-h-[34px] rounded-lg border border-[#202531]/15 bg-white text-[11px] font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                                      >
                                        <span>{isExpanded ? "Tutup" : "Rincian"}</span>
                                        {isExpanded ? (
                                          <CaretUp size={12} weight="bold" aria-hidden="true" />
                                        ) : (
                                          <CaretDown size={12} weight="bold" aria-hidden="true" />
                                        )}
                                      </button>
                                    </td>
                                  </tr>

                                  {isExpanded && (
                                    <tr className="bg-[#EBEBEB]/30">
                                      <td colSpan={9} className="p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                          <div className="space-y-1.5">
                                            <p className="font-extrabold text-[#202531]">
                                              Non-Tunai &amp; Total Sistem
                                            </p>
                                            <p className="text-[#525866] tabular-nums">
                                              QRIS: {formatRupiah(s.systemQrisTotal)} · Transfer:{" "}
                                              {formatRupiah(s.systemTransferTotal)} · Kartu:{" "}
                                              {formatRupiah(s.systemCardTotal)}
                                            </p>
                                            <p className="font-bold text-[#202531] tabular-nums">
                                              Omzet Total Sistem: {formatRupiah(s.systemGrandTotal)}
                                            </p>
                                            {s.openingNote && (
                                              <p className="text-[#525866]">
                                                <strong>Catatan Buka:</strong> {s.openingNote}
                                              </p>
                                            )}
                                            {s.closingNote && (
                                              <p className="text-[#525866]">
                                                <strong>Catatan Tutup:</strong> {s.closingNote}
                                              </p>
                                            )}
                                          </div>

                                          <div className="space-y-1.5">
                                            <p className="font-extrabold text-[#202531]">
                                              Rincian Uang Operasional
                                            </p>
                                            {s.operationalExpenses.length === 0 ? (
                                              <p className="text-[#525866]">
                                                Tidak ada pengeluaran operasional tercatat.
                                              </p>
                                            ) : (
                                              <ul className="space-y-1">
                                                {s.operationalExpenses.map((op, i) => (
                                                  <li
                                                    key={i}
                                                    className="flex justify-between text-[#202531] tabular-nums"
                                                  >
                                                    <span>{op.description}</span>
                                                    <span className="font-bold">
                                                      {formatRupiah(op.amount)}
                                                    </span>
                                                  </li>
                                                ))}
                                              </ul>
                                            )}
                                          </div>

                                          <div className="space-y-1.5">
                                            <p className="font-extrabold text-[#202531]">
                                              Pecahan Uang Fisik Tutup Shift
                                            </p>
                                            {s.closingDenominations ? (
                                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums text-[11px]">
                                                {RUPIAH_DENOMINATIONS.filter(
                                                  (d) => (s.closingDenominations?.[String(d)] ?? 0) > 0
                                                ).map((d) => {
                                                  const qty = s.closingDenominations?.[String(d)] ?? 0;
                                                  return (
                                                    <div key={d} className="flex justify-between">
                                                      <span className="text-[#525866]">
                                                        {formatRupiah(d)}
                                                      </span>
                                                      <span className="font-bold text-[#202531]">
                                                        x{qty}
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <p className="text-[#525866]">
                                                Pecahan tidak dirinci (pencatatan lama).
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              </>
            ) : null}
          </div>
        );
      }}
    </AppShell>
  );
}

