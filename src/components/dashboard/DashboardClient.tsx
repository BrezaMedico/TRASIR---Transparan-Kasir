"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData, setCachedData } from "@/lib/client-cache";
import { SalesLineChart } from "@/components/charts/SalesLineChart";
import { groupProductRequestsIntoBatches } from "@/lib/product-request-batch";
import type { GrossProfitReport } from "@/lib/queries/profit";
import {
  ArrowUpRight,
  Storefront,
  Receipt,
  Package,
  Warning,
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
      stockMethod: string;
      isRawMaterial: boolean;
      status: string;
      sellPrice: number;
      costPrice: number;
      variantsJson?: string | null;
      createdAt: string;
      category: { name: string; areaType: string };
      requestedBy: { id: string; name: string; role: string };
    }[];
    amendments: {
      id: string;
      amendmentType: string;
      reason: string;
      createdAt: string;
      sale: { receiptNumber: string; totalAmount: number };
      requestedBy: { id: string; name: string; role: string };
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
  const [queueTab, setQueueTab] = useState<"productRequests" | "amendments">("productRequests");
  const [data, setData] = useState<DashboardPayload | null>(() => {
    if (initialData) {
      setCachedData("/api/dashboard?range=month", initialData);
      return initialData;
    }
    return getCachedData<DashboardPayload>("/api/dashboard?range=month") ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => !data);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const skippedFirstFetch = useRef(Boolean(initialData));

  const loadDashboard = useCallback(
    async (silent = false) => {
      const url = `/api/dashboard?range=${range}`;
      const cached = getCachedData<DashboardPayload>(url);
      if (cached) {
        setData(cached);
        setLoading(false);
        setRefreshing(false);
      } else if (!silent) {
        if (data) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
      }
      setErrorMsg(null);
      try {
        const { ok, data: json } = await fetchJsonCached<DashboardPayload & { error?: string }>(
          url,
          { force: true }
        );
        if (!ok) {
          if (!cached && !data) {
            setErrorMsg(json.error || "Gagal memuat ringkasan toko.");
          }
          return;
        }
        setData(json);
      } catch {
        if (!cached && !data) {
          setErrorMsg("Gagal terhubung ke server database. Coba muat ulang.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const productReqs = data?.approvalQueue.productRequests || [];
        const productBatches = groupProductRequestsIntoBatches(productReqs);
        const amendments = data?.approvalQueue.amendments || [];
        const totalPendingQueue = productBatches.length + amendments.length;
        const profit = data?.profit;

        return (
          <div className="space-y-6">
            {/* BARIS 1: Header Minimalis & Pemilih Periode */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[#202531]">
                  Halo, {session.user.name.split(" ")[0]}
                </h1>
                <p className="text-sm text-[#525866] mt-0.5">
                  Ringkasan toko {session.storeName} ({profit?.periodLabel || "Bulan Ini"})
                </p>
              </div>

              <div
                role="group"
                aria-label="Pilih jangka waktu"
                className="inline-flex p-1 rounded-xl bg-white border border-[#202531]/15 self-start sm:self-auto"
              >
                {(
                  [
                    { id: "today", label: "Harian" },
                    { id: "week", label: "Mingguan" },
                    { id: "month", label: "Bulanan" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={range === item.id}
                    onClick={() => setRange(item.id)}
                    className={`px-4 min-h-[44px] sm:min-h-[40px] rounded-lg text-xs font-bold transition-colors duration-150 cursor-pointer ${
                      range === item.id
                        ? "bg-[#202531] text-white"
                        : "text-[#525866] hover:text-[#202531]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* BARIS 2: 3 Tombol Aksi Utama (Ramah Pemula: Langsung Tahu Harus Klik Apa) */}
            <section aria-label="Aksi Cepat Toko">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {session.permissions.kasir?.canView && (
                  <Link
                    href="/kasir"
                    className="group p-5 rounded-2xl bg-[#01DAD7] text-[#202531] flex items-center justify-between gap-4 hover:opacity-95 transition-opacity duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Storefront size={20} weight="bold" aria-hidden="true" />
                        <span className="text-base font-extrabold">Buka Kasir</span>
                      </div>
                      <p className="text-xs font-semibold text-[#202531]/80 mt-1">
                        Catat pesanan dan pembayaran pembeli
                      </p>
                    </div>
                    <ArrowUpRight
                      size={20}
                      weight="bold"
                      className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                )}

                {session.permissions.produk?.canView && (
                  <Link
                    href="/produk"
                    className="group p-5 rounded-2xl bg-[#202531] text-white flex items-center justify-between gap-4 hover:bg-[#2a3140] transition-colors duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Package size={20} weight="bold" className="text-[#01DAD7]" aria-hidden="true" />
                        <span className="text-base font-extrabold">Produk &amp; Bahan Baku</span>
                      </div>
                      <p className="text-xs text-[#EBEBEB]/80 mt-1">
                        Atur menu jualan, harga, dan stok bahan
                      </p>
                    </div>
                    <ArrowUpRight
                      size={20}
                      weight="bold"
                      className="shrink-0 text-[#01DAD7] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                )}

                {session.permissions.penjualan?.canView && (
                  <Link
                    href="/penjualan"
                    className="group p-5 rounded-2xl bg-white border border-[#202531]/15 text-[#202531] flex items-center justify-between gap-4 hover:border-[#202531] transition-colors duration-150"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Receipt size={20} weight="bold" aria-hidden="true" />
                        <span className="text-base font-extrabold">Riwayat Transaksi</span>
                      </div>
                      <p className="text-xs text-[#525866] mt-1">
                        Cek struk masuk atau ajukan pembatalan
                      </p>
                    </div>
                    <ArrowUpRight
                      size={20}
                      weight="bold"
                      className="shrink-0 text-[#525866] group-hover:text-[#202531] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                )}
              </div>
            </section>

            {errorMsg && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs font-semibold text-[#D41448]"
              >
                {errorMsg}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-36 rounded-2xl bg-white border border-[#202531]/10 p-5 animate-pulse flex flex-col justify-between"
                  >
                    <div className="h-4 w-28 bg-[#EBEBEB] rounded" />
                    <div className="h-8 w-40 bg-[#EBEBEB] rounded" />
                    <div className="h-3 w-36 bg-[#EBEBEB] rounded" />
                  </div>
                ))}
              </div>
            ) : data && profit ? (
              <>
                {/* Panduan Mulai Cepat (Hanya tampil jika katalog toko masih kosong) */}
                {data.kpis.totalProductsCount === 0 && (
                  <section
                    aria-label="Panduan Memulai Toko"
                    className="p-5 rounded-2xl bg-white border border-[#202531]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h2 className="text-sm font-extrabold text-[#202531]">
                        Baru memulai toko? Lakukan 2 langkah ini dulu:
                      </h2>
                      <p className="text-xs text-[#525866]">
                        1. Masukkan produk atau bahan baku Anda di menu Produk &amp; Bahan, lalu 2. Buka Kasir untuk mencatat penjualan pertama.
                      </p>
                    </div>
                    <Link
                      href="/produk"
                      className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold shrink-0 hover:opacity-90"
                    >
                      Mulai Tambah Produk
                    </Link>
                  </section>
                )}

                {/* BARIS 3: 3 Kartu Angka Keuangan Sederhana */}
                <section aria-label="Ringkasan Keuangan">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Kartu Utama: Keuntungan Jualan */}
                    <Link
                      href="/laporan"
                      className="group p-6 rounded-2xl bg-[#202531] text-white flex flex-col justify-between hover:bg-[#2a3140] transition-colors duration-150"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#EBEBEB]/80">
                          Keuntungan Jualan
                        </span>
                        <ArrowUpRight
                          size={18}
                          weight="bold"
                          className="text-[#01DAD7] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-3xl font-extrabold font-mono tabular-nums text-[#01DAD7] mt-3">
                        {formatRupiah(profit.metrics.grossProfit)}
                      </p>
                      <p className="text-xs text-[#EBEBEB]/75 mt-2">
                        {profit.comparison.hasComparisonData &&
                        profit.comparison.grossProfitDeltaPct !== null
                          ? `${profit.comparison.grossProfitDeltaRp >= 0 ? "+" : ""}${
                              profit.comparison.grossProfitDeltaPct
                            }% dibanding ${profit.previousPeriodLabel}`
                          : "Uang masuk dikurangi modal barang"}
                      </p>
                    </Link>

                    {/* Kartu 2: Uang Masuk */}
                    <Link
                      href="/penjualan"
                      className="group p-6 rounded-2xl bg-white border border-[#202531]/15 flex flex-col justify-between hover:border-[#202531] transition-colors duration-150"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#525866]">Uang Masuk</span>
                        <ArrowUpRight
                          size={18}
                          weight="bold"
                          className="text-[#525866] group-hover:text-[#202531]"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-3xl font-extrabold font-mono tabular-nums text-[#202531] mt-3">
                        {formatRupiah(profit.metrics.netSalesRevenue)}
                      </p>
                      <p className="text-xs text-[#525866] mt-2">
                        Dari {formatNumber(profit.metrics.activeSalesCount)} transaksi berhasil
                      </p>
                    </Link>

                    {/* Kartu 3: Modal Barang Terpakai */}
                    <div className="p-6 rounded-2xl bg-white border border-[#202531]/15 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#525866]">
                          Modal Barang Terpakai
                        </span>
                        <span className="text-xs font-mono font-bold text-[#202531] px-2 py-0.5 rounded-md bg-[#EBEBEB]">
                          Margin {profit.metrics.grossMarginPct}%
                        </span>
                      </div>
                      <p className="text-3xl font-extrabold font-mono tabular-nums text-[#202531] mt-3">
                        {formatRupiah(profit.metrics.totalCogs)}
                      </p>
                      <p className="text-xs text-[#525866] mt-2">
                        Modal dari {formatNumber(profit.metrics.totalUnitsSold)} item terjual
                      </p>
                    </div>
                  </div>
                </section>

                {/* Peringatan Jujur jika ada produk yang belum diisi harga modal */}
                {profit.dataQuality.hasIncompleteCostData && profit.dataQuality.warningMessage && (
                  <div
                    role="alert"
                    className="p-4 rounded-2xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs text-[#D41448] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Warning size={18} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="font-extrabold">Harga modal beberapa produk masih Rp 0</p>
                        <p className="mt-0.5 text-[#202531]">{profit.dataQuality.warningMessage}</p>
                      </div>
                    </div>
                    <Link
                      href="/produk"
                      className="px-3.5 min-h-[38px] inline-flex items-center justify-center rounded-xl bg-[#202531] text-white font-bold shrink-0"
                    >
                      Lengkapi Modal
                    </Link>
                  </div>
                )}

                {/* BARIS 4: Grafik Garis Penjualan & Keuntungan */}
                <SalesLineChart
                  headingId="chart-section-heading"
                  title={`Grafik Penjualan & Keuntungan (${profit.periodLabel})`}
                  subtitle={
                    range === "today"
                      ? "Perkembangan penjualan dan keuntungan per jam hari ini (WIB)"
                      : range === "week"
                      ? "Tren penjualan dan keuntungan harian dari Senin sampai Minggu"
                      : "Tren penjualan dan keuntungan harian sepanjang bulan ini"
                  }
                  granularity={range === "today" ? "hourly" : "daily"}
                  loading={refreshing}
                  periodControl={{
                    value: range,
                    onChange: setRange,
                    ariaLabel: "Pilih rentang grafik penjualan",
                    options: [
                      { id: "today", label: "Harian" },
                      { id: "week", label: "Mingguan" },
                      { id: "month", label: "Bulanan" },
                    ],
                  }}
                  data={data.chartSeries.map((row) => ({
                    key: row.key,
                    label: row.label,
                    shortLabel: row.shortLabel,
                    revenue: row.netRevenue,
                    grossProfit: row.grossProfit,
                    cogs: row.cogs,
                    salesCount: row.salesCount,
                    isFuture: row.isFuture,
                  }))}
                  emptyTitle={`Belum ada transaksi pada periode ${profit.periodLabel}.`}
                  emptySubtitle="Grafik garis akan terisi otomatis setelah Anda mencatat penjualan di Kasir."
                />

                {/* BARIS 5: 2 Panel Ringkas (Persetujuan & Stok Hampir Habis) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Persetujuan Pegawai */}
                  <section
                    aria-labelledby="approval-queue-heading"
                    className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2
                        id="approval-queue-heading"
                        className="text-base font-extrabold text-[#202531]"
                      >
                        Perlu Persetujuan Anda
                      </h2>
                      {totalPendingQueue > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-[#FF2A63] text-white text-xs font-extrabold">
                          {totalPendingQueue} menunggu
                        </span>
                      )}
                    </div>

                    <div
                      role="tablist"
                      aria-label="Kategori persetujuan"
                      className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EBEBEB]"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={queueTab === "productRequests"}
                        onClick={() => setQueueTab("productRequests")}
                        className={`px-3 min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          queueTab === "productRequests"
                            ? "bg-[#202531] text-white"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        Produk Baru ({productBatches.length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={queueTab === "amendments"}
                        onClick={() => setQueueTab("amendments")}
                        className={`px-3 min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          queueTab === "amendments"
                            ? "bg-[#202531] text-white"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        Batal Transaksi ({amendments.length})
                      </button>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {queueTab === "productRequests" &&
                        (productBatches.length === 0 ? (
                          <p className="py-6 text-center text-xs text-[#525866]">
                            Tidak ada usulan produk baru dari pegawai.
                          </p>
                        ) : (
                          productBatches.map((batch) => (
                            <Link
                              key={batch.batchId}
                              href="/produk?tab=requests"
                              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[#202531]/10 hover:border-[#202531] transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-[#202531] truncate">
                                  {batch.batchTitle}
                                </p>
                                <p className="text-[11px] text-[#525866] mt-0.5 truncate">
                                  Diajukan {batch.requestedBy.name} • {batch.items.length} item
                                  {batch.receiptImageData ? " • Ada Nota" : ""} •{" "}
                                  {formatDateTimeJakarta(batch.createdAt)}
                                </p>
                              </div>
                              <span className="font-mono text-xs font-extrabold text-[#202531] shrink-0">
                                {batch.totalEstimatedCost > 0
                                  ? formatRupiah(batch.totalEstimatedCost)
                                  : `${batch.items.length} item`}
                              </span>
                            </Link>
                          ))
                        ))}

                      {queueTab === "amendments" &&
                        (amendments.length === 0 ? (
                          <p className="py-6 text-center text-xs text-[#525866]">
                            Tidak ada pengajuan pembatalan transaksi.
                          </p>
                        ) : (
                          amendments.map((a) => (
                            <Link
                              key={a.id}
                              href="/penjualan"
                              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[#202531]/10 hover:border-[#202531] transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-[#202531] truncate">
                                  Batal #{a.sale.receiptNumber}
                                </p>
                                <p className="text-[11px] text-[#525866] mt-0.5 truncate">
                                  {a.requestedBy.name}: {a.reason}
                                </p>
                              </div>
                              <span className="font-mono text-xs font-extrabold text-[#D41448] shrink-0">
                                {formatRupiah(a.sale.totalAmount)}
                              </span>
                            </Link>
                          ))
                        ))}
                    </div>
                  </section>

                  {/* Stok Hampir Habis */}
                  <section
                    aria-labelledby="stock-alert-heading"
                    className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2
                        id="stock-alert-heading"
                        className="text-base font-extrabold text-[#202531]"
                      >
                        Stok Hampir Habis
                      </h2>
                      <Link
                        href="/produk"
                        className="text-xs font-bold text-[#202531] hover:underline"
                      >
                        Lihat semua ({formatNumber(data.kpis.totalProductsCount)})
                      </Link>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {data.lowStockProducts.length === 0 ? (
                        <div className="py-8 text-center space-y-1">
                          <p className="text-sm font-bold text-[#202531]">
                            Semua stok produk masih aman.
                          </p>
                          <p className="text-xs text-[#525866]">
                            Produk yang perlu diisi ulang akan muncul di sini secara otomatis.
                          </p>
                        </div>
                      ) : (
                        data.lowStockProducts.map((prod) => (
                          <Link
                            key={prod.id}
                            href="/produk"
                            className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] hover:border-[#FF2A63] transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-[#202531] truncate">
                                {prod.name}
                              </p>
                              <p className="text-[11px] text-[#525866]">
                                Batas minimum: {formatNumber(prod.minStockAlert)} {prod.sellUnit}
                              </p>
                            </div>
                            <span className="font-mono text-xs font-extrabold text-[#D41448] shrink-0">
                              Sisa {formatNumber(prod.currentStock)} {prod.sellUnit}
                            </span>
                          </Link>
                        ))
                      )}
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
