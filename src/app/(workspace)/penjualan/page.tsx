"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData, invalidateCache } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { formatRoleLabel, isStoreAdmin } from "@/lib/rbac-shared";
import {
  Receipt,
  CheckCircle,
  XCircle,
  ClockCounterClockwise,
  FileArrowUp,
  MagnifyingGlass,
  WarningCircle,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";

interface SaleRecord {
  id: string;
  receiptNumber: string;
  paymentMethod: string;
  discountAmount?: number;
  totalAmount: number;
  totalCost: number;
  cashReceived: number;
  changeAmount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  cashier: { id: string; name: string; role: string };
  items: {
    id: string;
    productId: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  amendments: {
    id: string;
    amendmentType: string;
    reason: string;
    proofImageData: string | null;
    proofMimeType?: string | null;
    status: string;
    reviewNotes: string | null;
    reviewedAt?: string | null;
    createdAt: string;
    requestedBy: { id: string; name: string; role: string };
    reviewedBy?: { id: string; name: string; role: string } | null;
  }[];
}

interface AmendmentRecord {
  id: string;
  saleId: string;
  amendmentType: string;
  reason: string;
  proofImageData: string | null;
  proofMimeType?: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  sale: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    paymentMethod: string;
    cashier: { id: string; name: string };
    items: {
      id: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      subtotal: number;
    }[];
  };
  requestedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

const PAGE_SIZE = 15;
const MAX_PROOF_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function PenjualanPage() {
  const { showToast } = useToast();

  const cachedSales = getCachedData<{
    sales?: SaleRecord[];
    amendments?: AmendmentRecord[];
    cashiers?: { id: string; name: string; role: string }[];
  }>("/api/sales");

  const [activeTab, setActiveTab] = useState<"history" | "amendments">("history");
  const [sales, setSales] = useState<SaleRecord[]>(cachedSales?.sales || []);
  const [amendments, setAmendments] = useState<AmendmentRecord[]>(cachedSales?.amendments || []);
  const [cashiers, setCashiers] = useState<{ id: string; name: string; role: string }[]>(
    cachedSales?.cashiers || []
  );

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [cashierFilter, setCashierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(!cachedSales);

  // Drawer detail & Cancellation Form
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [amendmentType, setAmendmentType] = useState<"PEMBATALAN" | "RETUR" | "PERUBAHAN">(
    "PEMBATALAN"
  );
  const [amendmentReason, setAmendmentReason] = useState("");
  const [amendmentProof, setAmendmentProof] = useState<string | null>(null);
  const [amendmentProofName, setAmendmentProofName] = useState<string | null>(null);
  const [submittingAmendment, setSubmittingAmendment] = useState(false);

  // Review Notes & Confirmation per Amendment
  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [confirmReview, setConfirmReview] = useState<{
    item: AmendmentRecord;
    decision: "DISETUJUI" | "DITOLAK";
  } | null>(null);
  const [processingReviewId, setProcessingReviewId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const salesUrl = `/api/sales${cashierFilter ? `?cashierId=${cashierFilter}` : ""}`;
    const hasCached = Boolean(getCachedData(salesUrl));
    if (!hasCached) {
      setLoading(true);
    }
    try {
      const salesRes = await fetchJsonCached<{
        sales?: SaleRecord[];
        amendments?: AmendmentRecord[];
        cashiers?: { id: string; name: string; role: string }[];
      }>(salesUrl, { force: true });

      if (salesRes.ok) {
        setSales(salesRes.data.sales || []);
        setAmendments(salesRes.data.amendments || []);
        setCashiers(salesRes.data.cashiers || []);
      }
    } catch {
      if (!hasCached) {
        showToast("Gagal memuat riwayat transaksi.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [cashierFilter, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, cashierFilter]);

  const handleProofUpload = (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      showToast("Format bukti hanya mendukung JPG, PNG, WEBP, atau PDF.", "error");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      showToast("Ukuran file bukti maksimal 2 MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAmendmentProof(reader.result);
        setAmendmentProofName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRequestAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;
    if (amendmentReason.trim().length < 5) {
      showToast("Alasan pembatalan wajib diisi minimal 5 karakter.", "error");
      return;
    }

    setSubmittingAmendment(true);
    try {
      const res = await fetch("/api/sales/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REQUEST",
          saleId: selectedSale.id,
          amendmentType,
          reason: amendmentReason.trim(),
          proofImageData: amendmentProof,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengirim pengajuan pembatalan.", "error");
        return;
      }

      showToast(
        `Pengajuan ${amendmentType} struk #${selectedSale.receiptNumber} berhasil dikirim (Menunggu Persetujuan).`,
        "success"
      );
      setAmendmentReason("");
      setAmendmentProof(null);
      setAmendmentProofName(null);
      setShowCancelForm(false);
      setSelectedSale(null);
      invalidateCache("/api/dashboard");
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const executeReviewAmendment = async (
    amendmentId: string,
    decision: "DISETUJUI" | "DITOLAK"
  ) => {
    setProcessingReviewId(amendmentId);
    try {
      const notes = (reviewNotesMap[amendmentId] || "").trim();
      const res = await fetch("/api/sales/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVIEW",
          amendmentId,
          decision,
          reviewNotes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan pembatalan.", "error");
        return;
      }

      showToast(
        decision === "DISETUJUI"
          ? "Pembatalan transaksi disetujui. Status diperbarui dan stok otomatis dikembalikan."
          : "Pengajuan pembatalan ditolak. Transaksi tetap aktif.",
        decision === "DISETUJUI" ? "success" : "info"
      );
      setConfirmReview(null);
      invalidateCache("/api/dashboard");
      invalidateCache("/api/reports");
      invalidateCache("/api/products");
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setProcessingReviewId(null);
    }
  };

  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) => {
      if (dateFilter && !s.createdAt.startsWith(dateFilter)) return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.receiptNumber.toLowerCase().includes(q) ||
        s.cashier.name.toLowerCase().includes(q) ||
        s.items.some((it) => it.productName.toLowerCase().includes(q))
      );
    });
  }, [sales, dateFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <AppShell>
      {(session) => {
        const isAdmin = isStoreAdmin(session.user.role);

        return (
          <div className="space-y-6">
            {/* Header & Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Riwayat Transaksi &amp; Pembatalan
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Pantau daftar penjualan kasir serta ajukan atau tinjau pembatalan transaksi
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <MagnifyingGlass
                      size={15}
                      weight="bold"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari struk, produk, kasir..."
                      aria-label="Cari transaksi"
                      className="pl-8 pr-3 py-2 min-h-[40px] w-52 rounded-xl border border-slate-300 text-xs text-slate-900 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <input
                    id="filter-date"
                    type="date"
                    aria-label="Filter tanggal"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                  />

                  <select
                    aria-label="Filter status transaksi"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="NORMAL">Normal</option>
                    <option value="MENUNGGU_PERSETUJUAN">Menunggu Persetujuan</option>
                    <option value="DIBATALKAN">Dibatalkan</option>
                    <option value="DIKEMBALIKAN">Dikembalikan</option>
                  </select>

                  {isAdmin && (
                    <select
                      id="filter-cashier"
                      aria-label="Filter kasir"
                      value={cashierFilter}
                      onChange={(e) => setCashierFilter(e.target.value)}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                    >
                      <option value="">Semua Kasir</option>
                      {cashiers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({formatRoleLabel(c.role)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Sub-fitur Riwayat Transaksi"
                className="flex flex-wrap gap-2 pt-2 border-t border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "history"
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Receipt size={16} weight="bold" aria-hidden="true" />
                  <span>Riwayat Transaksi ({filteredSales.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "amendments"}
                  onClick={() => setActiveTab("amendments")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "amendments"
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ClockCounterClockwise size={16} weight="bold" aria-hidden="true" />
                  <span>
                    Pengajuan Pembatalan (
                    {amendments.filter((a) => a.status === "MENUNGGU_PERSETUJUAN").length} Menunggu)
                  </span>
                </button>
              </div>
            </div>

            {/* TAB 1: RIWAYAT TRANSAKSI */}
            {activeTab === "history" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-8 text-center text-xs text-slate-600">
                    Memuat riwayat transaksi...
                  </div>
                ) : paginatedSales.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <Receipt
                      size={32}
                      weight="duotone"
                      className="mx-auto text-slate-400"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold text-slate-800">
                      Belum ada transaksi yang sesuai filter.
                    </p>
                    <p className="text-xs text-slate-600">
                      Gunakan halaman Kasir (POS) untuk mulai mencatat transaksi.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                            <th className="py-3.5 px-4">Nomor Struk</th>
                            <th className="py-3.5 px-4">Waktu</th>
                            <th className="py-3.5 px-4">Kasir</th>
                            <th className="py-3.5 px-4">Ringkasan Barang</th>
                            <th className="py-3.5 px-4">Metode</th>
                            <th className="py-3.5 px-4 text-right">Total Bayar</th>
                            <th className="py-3.5 px-4">Status</th>
                            <th className="py-3.5 px-4 text-right">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-xs">
                          {paginatedSales.map((sale) => (
                            <tr
                              key={sale.id}
                              onClick={() => {
                                setSelectedSale(sale);
                                setShowCancelForm(false);
                              }}
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <td className="py-3.5 px-4 font-mono font-extrabold text-[#202531]">
                                #{sale.receiptNumber}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700">
                                {formatDateTimeJakarta(sale.createdAt)}
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-900">
                                {sale.cashier.name}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate">
                                {sale.items
                                  .map((it) => `${it.productName} (${it.quantity})`)
                                  .join(", ")}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-700">
                                {sale.paymentMethod}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                                {formatRupiah(sale.totalAmount)}
                              </td>
                              <td className="py-3.5 px-4">
                                <StatusBadge status={sale.status} />
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSale(sale);
                                    setShowCancelForm(false);
                                  }}
                                  className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-bold text-[#202531] hover:bg-slate-100 cursor-pointer"
                                >
                                  Lihat Detail
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs">
                        <span className="text-slate-600 font-semibold">
                          Halaman {currentPage} dari {totalPages} ({filteredSales.length} transaksi)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                          >
                            <CaretLeft size={14} weight="bold" aria-hidden="true" />
                            <span>Sebelumnya</span>
                          </button>
                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                          >
                            <span>Berikutnya</span>
                            <CaretRight size={14} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 2: PENGAJUAN PEMBATALAN & KOREKSI */}
            {activeTab === "amendments" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Daftar Permintaan Pembatalan &amp; Koreksi Transaksi
                  </h2>
                  <p className="text-xs text-slate-600">
                    Pembatalan wajib disetujui oleh Pemilik atau Manajer lain (pengaju tidak boleh menyetujui permintaannya sendiri). Stok dan keuntungan kotor baru berubah setelah disetujui.
                  </p>
                </div>

                {/* Dialog Konfirmasi Persetujuan/Penolakan */}
                {confirmReview && (
                  <div
                    role="alertdialog"
                    className="p-4 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] space-y-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <WarningCircle
                        size={20}
                        weight="fill"
                        className="text-[#D97706] shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div className="space-y-1 text-xs">
                        <p className="font-extrabold text-slate-900">
                          Konfirmasi{" "}
                          {confirmReview.decision === "DISETUJUI"
                            ? "Persetujuan Pembatalan"
                            : "Penolakan Pengajuan"}{" "}
                          Struk #{confirmReview.item.sale.receiptNumber}
                        </p>
                        <p className="text-slate-700">
                          {confirmReview.decision === "DISETUJUI"
                            ? "Transaksi akan ditandai DIBATALKAN, dikecualikan dari laporan keuntungan kotor, dan stok produk dikembalikan otomatis."
                            : "Pengajuan akan ditolak dan transaksi tetap berstatus aktif."}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-7">
                      <button
                        type="button"
                        onClick={() => setConfirmReview(null)}
                        className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={processingReviewId === confirmReview.item.id}
                        onClick={() =>
                          executeReviewAmendment(confirmReview.item.id, confirmReview.decision)
                        }
                        className={`px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 ${
                          confirmReview.decision === "DISETUJUI"
                            ? "bg-[#202531] text-white"
                            : "bg-[#D41448]"
                        }`}
                      >
                        {processingReviewId === confirmReview.item.id
                          ? "Memproses..."
                          : confirmReview.decision === "DISETUJUI"
                          ? "Ya, Setujui & Kembalikan Stok"
                          : "Ya, Tolak Pengajuan"}
                      </button>
                    </div>
                  </div>
                )}

                {amendments.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada pengajuan pembatalan atau koreksi transaksi.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {amendments.map((item) => {
                      const isSelfRequest = item.requestedBy.id === session.user.id;
                      const allowDecision =
                        isAdmin && item.status === "MENUNGGU_PERSETUJUAN" && !isSelfRequest;

                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-extrabold text-[#202531]">
                                  Struk #{item.sale.receiptNumber}
                                </span>
                                <StatusBadge
                                  status={item.amendmentType}
                                  tone="amber"
                                  customLabel={`Ajuan: ${item.amendmentType}`}
                                />
                                <StatusBadge status={item.status} />
                              </div>
                              <p className="text-xs text-slate-800">
                                <strong>Alasan Pengajuan:</strong> {item.reason}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                Diajukan oleh: <strong>{item.requestedBy.name}</strong> (
                                {formatRoleLabel(item.requestedBy.role)}) •{" "}
                                {formatDateTimeJakarta(item.createdAt)} • Nilai Transaksi:{" "}
                                <strong className="font-mono">
                                  {formatRupiah(item.sale.totalAmount)}
                                </strong>
                              </p>

                              {item.reviewedBy && item.reviewedAt && (
                                <p className="text-[11px] text-slate-600">
                                  Diputuskan oleh <strong>{item.reviewedBy.name}</strong> pada{" "}
                                  {formatDateTimeJakarta(item.reviewedAt)}
                                </p>
                              )}

                              {item.reviewNotes && (
                                <p
                                  className={`text-xs font-semibold rounded-lg px-3 py-1.5 border ${
                                    item.status === "DITOLAK"
                                      ? "bg-[#FFF0F4] border-[#FF2A63]/35 text-[#D41448]"
                                      : "bg-[#01DAD7]/15 border-[#01DAD7] text-[#202531]"
                                  }`}
                                >
                                  Catatan Keputusan: {item.reviewNotes}
                                </p>
                              )}

                              {item.proofImageData && (
                                <div className="pt-1">
                                  {/^data:image\/(jpeg|png|webp);base64,/i.test(
                                    item.proofImageData
                                  ) ? (
                                    <a
                                      href={item.proofImageData}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-block"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={item.proofImageData}
                                        alt="Bukti pendukung pembatalan"
                                        className="h-20 w-auto rounded-lg border border-slate-300 object-cover"
                                      />
                                    </a>
                                  ) : /^data:application\/pdf;base64,/i.test(item.proofImageData) ? (
                                    <a
                                      href={item.proofImageData}
                                      download={`bukti-${item.sale.receiptNumber}.pdf`}
                                      className="inline-flex items-center gap-1 text-xs font-bold text-[#202531] hover:underline"
                                    >
                                      Unduh Lampiran Bukti (PDF)
                                    </a>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            <div className="w-full lg:w-80 space-y-2 shrink-0">
                              {allowDecision ? (
                                <>
                                  <input
                                    type="text"
                                    value={reviewNotesMap[item.id] || ""}
                                    onChange={(e) =>
                                      setReviewNotesMap((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Catatan keputusan / alasan penolakan (opsional)..."
                                    aria-label="Catatan keputusan pembatalan"
                                    className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmReview({ item, decision: "DISETUJUI" })
                                      }
                                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 cursor-pointer"
                                    >
                                      <CheckCircle size={16} weight="bold" aria-hidden="true" />
                                      <span>Setujui</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmReview({ item, decision: "DITOLAK" })
                                      }
                                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-[#D41448] text-white text-xs font-bold hover:opacity-90 cursor-pointer"
                                    >
                                      <XCircle size={16} weight="bold" aria-hidden="true" />
                                      <span>Tolak</span>
                                    </button>
                                  </div>
                                </>
                              ) : (
                                item.status === "MENUNGGU_PERSETUJUAN" && (
                                  <p className="text-xs font-semibold text-slate-600 italic lg:text-right">
                                    {isSelfRequest
                                      ? "Anda adalah pengaju. Wajib diputuskan Pemilik atau Manajer lain."
                                      : "Menunggu keputusan Pemilik atau Manajer."}
                                  </p>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SIDE DRAWER: Detail Transaksi & Ajukan Pembatalan */}
            <SlideDrawer
              isOpen={Boolean(selectedSale)}
              onClose={() => {
                setSelectedSale(null);
                setShowCancelForm(false);
              }}
              title={
                selectedSale ? `Detail Transaksi #${selectedSale.receiptNumber}` : "Detail Transaksi"
              }
              subtitle={
                selectedSale
                  ? `${formatDateTimeJakarta(selectedSale.createdAt)} • Kasir: ${selectedSale.cashier.name}`
                  : undefined
              }
            >
              {selectedSale && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-xs text-slate-600">Status Transaksi</p>
                      <div className="mt-1">
                        <StatusBadge status={selectedSale.status} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-600">
                        Total Pembayaran ({selectedSale.paymentMethod})
                      </p>
                      <p className="text-lg font-extrabold font-mono text-[#202531]">
                        {formatRupiah(selectedSale.totalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Produk yang dibeli */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                      Produk &amp; Jumlah Barang
                    </h3>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs">
                      {selectedSale.items.map((it) => (
                        <div key={it.id} className="p-3 flex items-center justify-between bg-white">
                          <div>
                            <p className="font-bold text-slate-900">
                              {it.productName}{" "}
                              {it.variantName && (
                                <span className="text-[#202531]">({it.variantName})</span>
                              )}
                            </p>
                            <p className="text-[11px] font-mono text-slate-600">
                              {it.quantity} x {formatRupiah(it.unitPrice)}
                            </p>
                          </div>
                          <span className="font-mono font-bold text-slate-900">
                            {formatRupiah(it.subtotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Riwayat Pengajuan Pembatalan pada Struk */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                      Riwayat Pengajuan Pembatalan &amp; Audit
                    </h3>
                    {selectedSale.amendments.length === 0 ? (
                      <p className="text-xs text-slate-600 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        Belum ada pengajuan pembatalan pada transaksi ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedSale.amendments.map((am) => (
                          <div
                            key={am.id}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{am.amendmentType}</span>
                              <StatusBadge status={am.status} />
                            </div>
                            <p className="text-slate-700">
                              <strong>Alasan:</strong> {am.reason}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Pengaju: {am.requestedBy.name} • {formatDateTimeJakarta(am.createdAt)}
                            </p>
                            {am.reviewedBy && am.reviewedAt && (
                              <p className="text-[11px] text-slate-600">
                                Peninjau: {am.reviewedBy.name} •{" "}
                                {formatDateTimeJakarta(am.reviewedAt)}
                              </p>
                            )}
                            {am.reviewNotes && (
                              <p
                                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                                  am.status === "DITOLAK"
                                    ? "bg-[#FFF0F4] border-[#FF2A63]/35 text-[#D41448]"
                                    : "bg-[#01DAD7]/15 border-[#01DAD7] text-[#202531]"
                                }`}
                              >
                                {am.status === "DITOLAK" ? "Alasan Penolakan: " : "Catatan: "}
                                {am.reviewNotes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tombol & Formulir Ajukan Pembatalan */}
                  {selectedSale.status !== "DIBATALKAN" &&
                    selectedSale.status !== "DIKEMBALIKAN" &&
                    selectedSale.status !== "MENUNGGU_PERSETUJUAN" && (
                      <>
                        {!showCancelForm ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAmendmentType("PEMBATALAN");
                              setShowCancelForm(true);
                            }}
                            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] px-4 text-xs font-extrabold text-[#D41448] hover:bg-rose-100 cursor-pointer"
                          >
                            <XCircle size={18} weight="bold" aria-hidden="true" />
                            <span>Ajukan Pembatalan</span>
                          </button>
                        ) : (
                          <form
                            onSubmit={handleRequestAmendment}
                            className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                          >
                            <div>
                              <h3 className="text-sm font-extrabold text-slate-900">
                                Formulir Pengajuan Pembatalan Transaksi
                              </h3>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                Pembatalan harus disetujui Pemilik atau Manajer lain sebelum transaksi dibatalkan dan stok dikembalikan.
                              </p>
                            </div>

                            <div>
                              <label
                                htmlFor="amend-type"
                                className="block text-xs font-bold text-slate-700 mb-1"
                              >
                                Jenis Pengajuan
                              </label>
                              <select
                                id="amend-type"
                                value={amendmentType}
                                onChange={(e) =>
                                  setAmendmentType(
                                    e.target.value as "PEMBATALAN" | "RETUR" | "PERUBAHAN"
                                  )
                                }
                                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                              >
                                <option value="PEMBATALAN">
                                  Pembatalan Transaksi (Kembalikan Stok Setelah Disetujui)
                                </option>
                                <option value="RETUR">
                                  Pengembalian Barang / Retur (Kembalikan Stok Setelah Disetujui)
                                </option>
                                <option value="PERUBAHAN">
                                  Perubahan Keterangan / Metode Pembayaran
                                </option>
                              </select>
                            </div>

                            <div>
                              <label
                                htmlFor="amend-reason"
                                className="block text-xs font-bold text-slate-700 mb-1"
                              >
                                Alasan Pembatalan (Wajib, minimal 5 karakter)
                              </label>
                              <textarea
                                id="amend-reason"
                                required
                                minLength={5}
                                rows={3}
                                value={amendmentReason}
                                onChange={(e) => setAmendmentReason(e.target.value)}
                                placeholder="Tuliskan alasan pembatalan transaksi secara jelas..."
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor="amend-proof"
                                className="block text-xs font-bold text-slate-700 mb-1"
                              >
                                Lampiran Bukti Pendukung (Opsional: JPG, PNG, WEBP, atau PDF, maks 2 MB)
                              </label>
                              <label
                                htmlFor="amend-proof"
                                className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                                <span className="truncate">
                                  {amendmentProofName
                                    ? `Terlampir: ${amendmentProofName} (Klik untuk ganti)`
                                    : "Unggah Foto Struk / Bukti Pendukung"}
                                </span>
                                <input
                                  id="amend-proof"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  className="hidden"
                                  onChange={(e) => handleProofUpload(e.target.files?.[0] || null)}
                                />
                              </label>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowCancelForm(false)}
                                className="px-4 py-3 min-h-[44px] rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                disabled={submittingAmendment}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] disabled:opacity-50 cursor-pointer"
                              >
                                <span>
                                  {submittingAmendment
                                    ? "Mengirim Pengajuan..."
                                    : "Kirim Pengajuan Pembatalan"}
                                </span>
                              </button>
                            </div>
                          </form>
                        )}
                      </>
                    )}
                </div>
              )}
            </SlideDrawer>
          </div>
        );
      }}
    </AppShell>
  );
}
