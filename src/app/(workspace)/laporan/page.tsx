"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  DownloadSimple,
  Info,
  ChartBar,
  TrendUp,
  Trophy,
  WarningOctagon,
} from "@phosphor-icons/react";

interface ReportPayload {
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
    revenue: number;
    cogs: number;
    grossProfit: number;
    purchases: number;
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
}

export default function LaporanPage() {
  const { showToast } = useToast();

  const [period, setPeriod] = useState<"daily" | "monthly" | "custom">("monthly");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const initialReport = getCachedData<ReportPayload>("/api/reports?period=monthly") ?? null;
  const [report, setReport] = useState<ReportPayload | null>(initialReport);
  const [loading, setLoading] = useState(!initialReport);

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
      ...report.chartSeries.map((c) => [
        c.date,
        String(c.revenue),
        String(c.cogs),
        String(c.grossProfit),
        String(c.purchases),
      ]),
    ];

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan-Keuangan-TRASIR-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Laporan Keuangan berhasil diekspor ke berkas CSV.", "success");
  };

  return (
    <AppShell>
      {() => {
        const maxVal = Math.max(
          1,
          ...(report?.chartSeries || []).flatMap((c) => [c.revenue, c.cogs, Math.abs(c.grossProfit)])
        );

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
                        { id: "monthly", label: "Bulanan (30 Hari)" },
                        { id: "custom", label: "Rentang Kustom" },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPeriod(p.id)}
                        className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          period === p.id
                            ? "bg-[#334E6B] text-white"
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-40 cursor-pointer"
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

                    <div className="bg-[#334E6B] text-white rounded-2xl p-5 shadow-sm">
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
                  <div className="p-4 rounded-2xl bg-[#F0FDFA] border border-[#99F6E4] text-xs text-[#0F766E] flex items-start gap-2.5">
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

                {/* ROW 2: 2 Side-by-Side Charts (Bar Chart: Pendapatan vs HPP, Line/Trend Chart: Perkembangan Keuntungan Kotor) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Chart 1: Bar Chart Pendapatan vs Modal/HPP */}
                  <section
                    aria-labelledby="bar-chart-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChartBar size={20} weight="duotone" className="text-[#334E6B]" aria-hidden="true" />
                        <h2 id="bar-chart-heading" className="text-base font-extrabold text-slate-900">
                          Grafik Batang: Pendapatan vs Modal / HPP
                        </h2>
                      </div>
                    </div>

                    {report.chartSeries.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Belum ada data penjualan tercatat pada periode ini.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {report.chartSeries.map((c) => {
                          const revPct = Math.max(4, Math.round((c.revenue / maxVal) * 100));
                          const cogsPct = Math.max(4, Math.round((c.cogs / maxVal) * 100));
                          return (
                            <div
                              key={c.date}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between font-mono font-bold">
                                <span>{c.date}</span>
                                <span>
                                  Pendapatan: {formatRupiah(c.revenue)} | HPP: {formatRupiah(c.cogs)}
                                </span>
                              </div>
                              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#334E6B] rounded-full"
                                  style={{ width: `${revPct}%` }}
                                />
                              </div>
                              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#FC5086] rounded-full"
                                  style={{ width: `${cogsPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Chart 2: Perkembangan Keuntungan Kotor */}
                  <section
                    aria-labelledby="line-chart-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendUp size={20} weight="duotone" className="text-[#0F766E]" aria-hidden="true" />
                        <h2 id="line-chart-heading" className="text-base font-extrabold text-slate-900">
                          Perkembangan Keuntungan Kotor dari Waktu ke Waktu
                        </h2>
                      </div>
                    </div>

                    {report.chartSeries.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Belum ada perkembangan keuntungan kotor untuk ditampilkan.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {report.chartSeries.map((c) => {
                          const profitPct = Math.max(
                            4,
                            Math.round((Math.max(0, c.grossProfit) / maxVal) * 100)
                          );
                          return (
                            <div
                              key={c.date}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between font-mono font-bold">
                                <span>{c.date}</span>
                                <span className="text-[#0F766E]">
                                  Laba Kotor: {formatRupiah(c.grossProfit)}
                                </span>
                              </div>
                              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#3DC2CA] rounded-full"
                                  style={{ width: `${profitPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                {/* ROW 3: 2 Side-by-Side Tables (Produk Paling Menguntungkan & Produk Bermasalah) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Table 1: Produk Paling Menguntungkan */}
                  <section
                    aria-labelledby="profitable-products-heading"
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <Trophy size={20} weight="duotone" className="text-[#166534]" aria-hidden="true" />
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
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#166534]">
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
                        className="text-[#9F1239]"
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
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-[#9F1239]">
                                  {p.discrepancyFrequency}x Opname
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {formatNumber(p.totalUnitDiff)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#9F1239]">
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
              </>
            ) : null}
          </div>
        );
      }}
    </AppShell>
  );
}

