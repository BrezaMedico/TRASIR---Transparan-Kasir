"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import {
  Receipt,
  CheckCircle,
  XCircle,
  Calculator,
  ClockCounterClockwise,
  FileArrowUp,
  Info,
} from "@phosphor-icons/react";

interface SaleRecord {
  id: string;
  receiptNumber: string;
  paymentMethod: string;
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
    status: string;
    reviewNotes: string | null;
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
  status: string;
  reviewNotes: string | null;
  createdAt: string;
  sale: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    paymentMethod: string;
    cashier: { id: string; name: string };
    items: { id: string; productName: string; variantName: string | null; quantity: number; subtotal: number }[];
  };
  requestedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

interface ShiftSummary {
  systemTxCount: number;
  systemCashTotal: number;
  systemQrisTotal: number;
  systemTransferTotal: number;
  systemCardTotal: number;
  systemDigitalTotal: number;
  systemGrandTotal: number;
}

interface ShiftClosingRecord {
  id: string;
  systemTxCount: number;
  systemCashTotal: number;
  systemDigitalTotal?: number;
  systemGrandTotal: number;
  actualCashTotal: number;
  actualDigitalTotal: number;
  cashDifference: number;
  digitalDifference: number;
  totalDifference: number;
  status: string;
  notes: string | null;
  createdAt: string;
  cashier: { id: string; name: string; role: string };
}

export default function PenjualanPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"history" | "amendments" | "shift">("history");
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [amendments, setAmendments] = useState<AmendmentRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftClosingRecord[]>([]);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary>({
    systemTxCount: 0,
    systemCashTotal: 0,
    systemQrisTotal: 0,
    systemTransferTotal: 0,
    systemCardTotal: 0,
    systemDigitalTotal: 0,
    systemGrandTotal: 0,
  });
  const [cashiers, setCashiers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [cashierFilter, setCashierFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // Drawer detail & Amendment Request Form
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [amendmentType, setAmendmentType] = useState<"PEMBATALAN" | "RETUR" | "PERUBAHAN">("PEMBATALAN");
  const [amendmentReason, setAmendmentReason] = useState("");
  const [amendmentProof, setAmendmentProof] = useState<string | null>(null);
  const [submittingAmendment, setSubmittingAmendment] = useState(false);

  // Shift Closing Inputs
  const [actualCashInput, setActualCashInput] = useState("");
  const [actualDigitalInput, setActualDigitalInput] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [submittingShift, setSubmittingShift] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, shiftRes] = await Promise.all([
        fetch(`/api/sales${cashierFilter ? `?cashierId=${cashierFilter}` : ""}`, { cache: "no-store" }),
        fetch("/api/shifts", { cache: "no-store" }),
      ]);
      const salesData = await salesRes.json();
      const shiftData = await shiftRes.json();

      if (salesRes.ok) {
        setSales(salesData.sales || []);
        setAmendments(salesData.amendments || []);
        setCashiers(salesData.cashiers || []);
      }
      if (shiftRes.ok) {
        setShiftSummary(shiftData.summary);
        setShifts(shiftData.closings || []);
      }
    } catch {
      showToast("Gagal memuat data penjualan & shift.", "error");
    } finally {
      setLoading(false);
    }
  }, [cashierFilter, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleProofUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAmendmentProof(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRequestAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;
    if (amendmentReason.trim().length < 5) {
      showToast("Alasan pengajuan perubahan wajib diisi minimal 5 karakter.", "error");
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
          reason: amendmentReason,
          proofImageData: amendmentProof,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengirim pengajuan perubahan transaksi.", "error");
        return;
      }

      showToast(
        `Pengajuan ${amendmentType} struk #${selectedSale.receiptNumber} berhasil dikirim untuk persetujuan Pemilik.`,
        "success"
      );
      setAmendmentReason("");
      setAmendmentProof(null);
      setSelectedSale(null);
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const handleReviewAmendment = async (amendmentId: string, decision: "DISETUJUI" | "DITOLAK") => {
    try {
      const res = await fetch("/api/sales/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVIEW",
          amendmentId,
          decision,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan.", "error");
        return;
      }

      showToast(
        decision === "DISETUJUI"
          ? "Pengajuan perubahan transaksi disetujui dan stok otomatis dikembalikan."
          : "Pengajuan perubahan transaksi ditolak.",
        "success"
      );
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    }
  };

  const actualCashNum = Number(actualCashInput.replace(/[^0-9]/g, "")) || 0;
  const actualDigitalNum = Number(actualDigitalInput.replace(/[^0-9]/g, "")) || 0;
  const liveCashDiff = actualCashNum - shiftSummary.systemCashTotal;
  const liveDigitalDiff = actualDigitalNum - shiftSummary.systemDigitalTotal;
  const liveTotalDiff = liveCashDiff + liveDigitalDiff;

  const handleSubmitShiftClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingShift(true);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualCashTotal: actualCashNum,
          actualDigitalTotal: actualDigitalNum,
          notes: shiftNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan rekonsiliasi tutup shift.", "error");
        return;
      }

      showToast("Laporan Tutup Shift & Rekonsiliasi Kas berhasil disimpan ke Audit Trail.", "success");
      setActualCashInput("");
      setActualDigitalInput("");
      setShiftNotes("");
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingShift(false);
    }
  };

  return (
    <AppShell>
      {(session) => {
        const canApprove = session.permissions.penjualan?.canApprove;

        const filteredSales = sales.filter((s) => {
          if (dateFilter && !s.createdAt.startsWith(dateFilter)) return false;
          return true;
        });

        return (
          <div className="space-y-6">
            {/* Page Header & 3 Sub-Feature Horizontal Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Penjualan & Tutup Shift (Rekonsiliasi Kas)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Riwayat transaksi tanpa hapus permanen, alur pengajuan koreksi/retur, dan pencocokan uang fisik akhir shift
                  </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div>
                    <label htmlFor="filter-date" className="sr-only">
                      Filter Tanggal
                    </label>
                    <input
                      id="filter-date"
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                    />
                  </div>
                  {session.user.role !== "KASIR" && (
                    <div>
                      <label htmlFor="filter-cashier" className="sr-only">
                        Filter Kasir
                      </label>
                      <select
                        id="filter-cashier"
                        value={cashierFilter}
                        onChange={(e) => setCashierFilter(e.target.value)}
                        className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                      >
                        <option value="">Semua Kasir</option>
                        {cashiers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* 3 Horizontal Sub-Feature Tabs */}
              <div
                role="tablist"
                aria-label="Sub-fitur Penjualan & Tutup Shift"
                className="flex flex-wrap gap-2 pt-2 border-t border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "history"
                      ? "bg-[#334E6B] text-white"
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
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ClockCounterClockwise size={16} weight="bold" aria-hidden="true" />
                  <span>
                    Pengajuan Perubahan (
                    {amendments.filter((a) => a.status === "MENUNGGU_PERSETUJUAN").length} Menunggu)
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "shift"}
                  onClick={() => setActiveTab("shift")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "shift"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Calculator size={16} weight="bold" aria-hidden="true" />
                  <span>Tutup Shift & Rekonsiliasi Kas</span>
                </button>
              </div>
            </div>

            {/* TAB 1: RIWAYAT TRANSAKSI */}
            {activeTab === "history" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-8 text-center text-xs text-slate-600">
                    Memuat riwayat transaksi penjualan...
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <Receipt
                      size={32}
                      weight="duotone"
                      className="mx-auto text-slate-400"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold text-slate-800">
                      Belum ada transaksi penjualan yang tercatat.
                    </p>
                    <p className="text-xs text-slate-600">
                      Gunakan halaman Kasir (POS) untuk mulai mencatat transaksi penjualan.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                          <th className="py-3.5 px-4">Nomor Struk</th>
                          <th className="py-3.5 px-4">Waktu</th>
                          <th className="py-3.5 px-4">Kasir</th>
                          <th className="py-3.5 px-4">Metode Bayar</th>
                          <th className="py-3.5 px-4 text-right">Total Nilai</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4 text-right">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {filteredSales.map((sale) => (
                          <tr
                            key={sale.id}
                            onClick={() => setSelectedSale(sale)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 px-4 font-mono font-extrabold text-[#334E6B]">
                              #{sale.receiptNumber}
                            </td>
                            <td className="py-3.5 px-4 text-slate-700">
                              {formatDateTimeJakarta(sale.createdAt)}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              {sale.cashier.name}
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
                                }}
                                className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-bold text-[#334E6B] hover:bg-slate-100 cursor-pointer"
                              >
                                Rincian & Koreksi
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PENGAJUAN PERUBAHAN */}
            {activeTab === "amendments" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Daftar Permintaan Koreksi Transaksi (Pembatalan / Retur / Perubahan)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Kasir tidak dapat menghapus transaksi atau menyetujui pengajuannya sendiri. Persetujuan Pemilik atas pembatalan/retur otomatis mengembalikan stok.
                    </p>
                  </div>
                </div>

                {amendments.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada pengajuan pembatalan, pengembalian (retur), atau perubahan transaksi.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {amendments.map((item) => {
                      const isSelfRequest = item.requestedBy.id === session.user.id;
                      const allowDecision =
                        canApprove &&
                        item.status === "MENUNGGU_PERSETUJUAN" &&
                        (session.user.role === "PEMILIK" || !isSelfRequest);

                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-extrabold text-[#334E6B]">
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
                              Diajukan oleh: <strong>{item.requestedBy.name}</strong> ({item.requestedBy.role}) •{" "}
                              {formatDateTimeJakarta(item.createdAt)} • Nilai Transaksi:{" "}
                              <strong className="font-mono">{formatRupiah(item.sale.totalAmount)}</strong>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {allowDecision ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleReviewAmendment(item.id, "DISETUJUI")}
                                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#166534] text-white text-xs font-bold hover:opacity-90 cursor-pointer"
                                >
                                  <CheckCircle size={16} weight="bold" aria-hidden="true" />
                                  <span>Setujui & Kembalikan Stok</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewAmendment(item.id, "DITOLAK")}
                                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#9F1239] text-white text-xs font-bold hover:opacity-90 cursor-pointer"
                                >
                                  <XCircle size={16} weight="bold" aria-hidden="true" />
                                  <span>Tolak</span>
                                </button>
                              </>
                            ) : (
                              item.status === "MENUNGGU_PERSETUJUAN" && (
                                <span className="text-xs font-semibold text-slate-600 italic">
                                  Menunggu keputusan Pemilik
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TUTUP SHIFT & REKONSILIASI KAS (2 Columns) */}
            {activeTab === "shift" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Ringkasan Sistem Hari Ini */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Kolom Kiri: Ringkasan Sistem Hari Ini
                      </h2>
                      <p className="text-xs text-slate-600">
                        Dihitung otomatis oleh sistem berdasarkan transaksi penjualan aktif hari ini
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-xs text-slate-600">Total Transaksi Tercatat</p>
                        <p className="text-lg font-extrabold font-mono text-slate-900 mt-1">
                          {shiftSummary.systemTxCount} Struk
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#E8EEF4] border border-slate-300">
                        <p className="text-xs font-bold text-[#334E6B]">Total Penerimaan Sistem</p>
                        <p className="text-lg font-extrabold font-mono text-[#334E6B] mt-1">
                          {formatRupiah(shiftSummary.systemGrandTotal)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
                      <div className="flex items-center justify-between py-1.5">
                        <span className="font-semibold text-slate-700">Uang Tunai Sistem</span>
                        <span className="font-mono font-extrabold text-slate-900">
                          {formatRupiah(shiftSummary.systemCashTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-slate-600">Pembayaran QRIS</span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatRupiah(shiftSummary.systemQrisTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-slate-600">Pembayaran Transfer Bank</span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatRupiah(shiftSummary.systemTransferTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-slate-600">Pembayaran Kartu Debit/Kredit</span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatRupiah(shiftSummary.systemCardTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-t border-slate-200 font-bold text-slate-900">
                        <span>Total Pembayaran Digital (QRIS + Transfer + Kartu)</span>
                        <span className="font-mono">
                          {formatRupiah(shiftSummary.systemDigitalTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Form Input Kasir & Kalkulator Selisih Kas Netral */}
                  <form
                    onSubmit={handleSubmitShiftClosing}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Kolom Kanan: Input Perhitungan Fisik Kasir
                      </h2>
                      <p className="text-xs text-slate-600">
                        Masukkan jumlah uang tunai fisik di laci kasir dan total bukti pembayaran digital
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="shift-actual-cash"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Uang Tunai Fisik Tersedia di Laci (Rp)
                      </label>
                      <input
                        id="shift-actual-cash"
                        type="number"
                        min={0}
                        required
                        value={actualCashInput}
                        onChange={(e) => setActualCashInput(e.target.value)}
                        placeholder={String(shiftSummary.systemCashTotal)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="shift-actual-digital"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Total Bukti Pembayaran Digital (QRIS/Transfer/Kartu) (Rp)
                      </label>
                      <input
                        id="shift-actual-digital"
                        type="number"
                        min={0}
                        required
                        value={actualDigitalInput}
                        onChange={(e) => setActualDigitalInput(e.target.value)}
                        placeholder={String(shiftSummary.systemDigitalTotal)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900"
                      />
                    </div>

                    {/* Neutral Cash Discrepancy Calculator */}
                    <div
                      className={`p-4 rounded-xl border space-y-2 text-xs ${
                        liveTotalDiff === 0
                          ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
                          : "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>Selisih Kas Tunai</span>
                        <span className="font-mono">{formatRupiah(liveCashDiff)}</span>
                      </div>
                      <div className="flex items-center justify-between font-bold">
                        <span>Selisih Bukti Digital</span>
                        <span className="font-mono">{formatRupiah(liveDigitalDiff)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-current/20 text-sm font-extrabold">
                        <span>Total Selisih Kas Akhir Shift</span>
                        <span className="font-mono">{formatRupiah(liveTotalDiff)}</span>
                      </div>
                      <p className="text-[11px] flex items-center gap-1.5 pt-1">
                        <Info size={14} weight="bold" aria-hidden="true" />
                        <span>
                          Perbedaan catatan sistem dan perhitungan fisik dicatat sebagai bahan evaluasi netral untuk diperiksa Pemilik.
                        </span>
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="shift-notes"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Catatan / Keterangan Kasir (Opsional)
                      </label>
                      <textarea
                        id="shift-notes"
                        rows={2}
                        value={shiftNotes}
                        onChange={(e) => setShiftNotes(e.target.value)}
                        placeholder="Tuliskan keterangan jika terdapat uang kembalian atau selisih..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingShift}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-sm font-bold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle size={18} weight="bold" aria-hidden="true" />
                      <span>
                        {submittingShift
                          ? "Menyimpan Rekonsiliasi..."
                          : "Simpan Tutup Shift & Rekonsiliasi Kas"}
                      </span>
                    </button>
                  </form>
                </div>

                {/* History of Shift Closings */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Riwayat Rekonsiliasi Tutup Shift
                  </h3>
                  {shifts.length === 0 ? (
                    <p className="text-xs text-slate-600 py-4">
                      Belum ada riwayat penutupan shift yang tercatat.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                            <th className="py-3 px-4">Waktu Tutup Shift</th>
                            <th className="py-3 px-4">Kasir</th>
                            <th className="py-3 px-4 text-right">Total Sistem</th>
                            <th className="py-3 px-4 text-right">Total Fisik & Digital</th>
                            <th className="py-3 px-4 text-right">Selisih Kas</th>
                            <th className="py-3 px-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {shifts.map((sh) => (
                            <tr key={sh.id}>
                              <td className="py-3 px-4 text-slate-700">
                                {formatDateTimeJakarta(sh.createdAt)}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {sh.cashier.name}
                              </td>
                              <td className="py-3 px-4 text-right font-mono">
                                {formatRupiah(sh.systemGrandTotal)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono">
                                {formatRupiah(sh.actualCashTotal + sh.actualDigitalTotal)}
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-mono font-bold ${
                                  sh.totalDifference === 0 ? "text-[#166534]" : "text-[#9F1239]"
                                }`}
                              >
                                {formatRupiah(sh.totalDifference)}
                              </td>
                              <td className="py-3 px-4">
                                <StatusBadge status={sh.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SIDE DRAWER: Sale Details, Change Log, & Request Cancellation/Return/Amendment */}
            <SlideDrawer
              isOpen={Boolean(selectedSale)}
              onClose={() => setSelectedSale(null)}
              title={selectedSale ? `Rincian Struk #${selectedSale.receiptNumber}` : "Rincian Struk"}
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
                      <p className="text-xs text-slate-600">Total Pembayaran ({selectedSale.paymentMethod})</p>
                      <p className="text-lg font-extrabold font-mono text-[#334E6B]">
                        {formatRupiah(selectedSale.totalAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Item Breakdown */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                      Rincian Item Terjual
                    </h3>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden text-xs">
                      {selectedSale.items.map((it) => (
                        <div key={it.id} className="p-3 flex items-center justify-between bg-white">
                          <div>
                            <p className="font-bold text-slate-900">
                              {it.productName}{" "}
                              {it.variantName && <span className="text-[#334E6B]">({it.variantName})</span>}
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

                  {/* Change / Amendment Log */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                      Riwayat Perubahan & Audit Struk
                    </h3>
                    {selectedSale.amendments.length === 0 ? (
                      <p className="text-xs text-slate-600 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        Belum ada pengajuan perubahan pada struk ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedSale.amendments.map((am) => (
                          <div
                            key={am.id}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{am.amendmentType}</span>
                              <StatusBadge status={am.status} />
                            </div>
                            <p className="text-slate-700">Alasan: {am.reason}</p>
                            <p className="text-[11px] text-slate-500">
                              Diajukan oleh {am.requestedBy.name} pada{" "}
                              {formatDateTimeJakarta(am.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Form to Request Cancellation / Return / Amendment (No Permanent Delete Guardrail) */}
                  {selectedSale.status !== "DIBATALKAN" &&
                    selectedSale.status !== "DIKEMBALIKAN" && (
                      <form
                        onSubmit={handleRequestAmendment}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                      >
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900">
                            Ajukan Pembatalan / Retur / Perubahan
                          </h3>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Sistem TRASIR tidak menyediakan tombol hapus permanen. Setiap koreksi wajib disertai alasan & bukti untuk disetujui Pemilik.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="amend-type"
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Jenis Koreksi
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
                            Alasan Pengajuan (Wajib)
                          </label>
                          <textarea
                            id="amend-reason"
                            required
                            rows={3}
                            value={amendmentReason}
                            onChange={(e) => setAmendmentReason(e.target.value)}
                            placeholder="Jelaskan alasan pembatalan, pengembalian, atau perubahan secara rinci..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="amend-proof"
                            className="block text-xs font-bold text-slate-700 mb-1"
                          >
                            Lampiran Foto Bukti Pendukung (Opsional / Direkomendasikan)
                          </label>
                          <label
                            htmlFor="amend-proof"
                            className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                            <span>
                              {amendmentProof
                                ? "Bukti Foto Terlampir (Klik untuk ganti)"
                                : "Unggah Foto Struk / Barang Retur"}
                            </span>
                            <input
                              id="amend-proof"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleProofUpload(e.target.files?.[0] || null)}
                            />
                          </label>
                        </div>

                        <button
                          type="submit"
                          disabled={submittingAmendment}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                        >
                          <span>
                            {submittingAmendment
                              ? "Mengirim Pengajuan..."
                              : "Kirim Pengajuan ke Pemilik"}
                          </span>
                        </button>
                      </form>
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
