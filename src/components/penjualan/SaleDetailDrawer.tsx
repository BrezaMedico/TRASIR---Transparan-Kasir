"use client";

import React from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { FileArrowUp, XCircle } from "@phosphor-icons/react";
import type { SaleRecord } from "./types";

interface SaleDetailDrawerProps {
  selectedSale: SaleRecord | null;
  showCancelForm: boolean;
  amendmentType: "PEMBATALAN" | "RETUR" | "PERUBAHAN";
  amendmentReason: string;
  amendmentProofName: string | null;
  submittingAmendment: boolean;
  onClose: () => void;
  onStartCancelForm: () => void;
  onHideCancelForm: () => void;
  onAmendmentTypeChange: (val: "PEMBATALAN" | "RETUR" | "PERUBAHAN") => void;
  onAmendmentReasonChange: (val: string) => void;
  onProofUpload: (file: File | null) => void;
  onSubmitAmendment: (e: React.FormEvent) => void;
}

export function SaleDetailDrawer({
  selectedSale,
  showCancelForm,
  amendmentType,
  amendmentReason,
  amendmentProofName,
  submittingAmendment,
  onClose,
  onStartCancelForm,
  onHideCancelForm,
  onAmendmentTypeChange,
  onAmendmentReasonChange,
  onProofUpload,
  onSubmitAmendment,
}: SaleDetailDrawerProps) {
  return (
    <SlideDrawer
      isOpen={Boolean(selectedSale)}
      onClose={onClose}
      title={selectedSale ? `Detail Transaksi #${selectedSale.receiptNumber}` : "Detail Transaksi"}
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
                      {it.variantName && <span className="text-[#202531]">({it.variantName})</span>}
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
                        Peninjau: {am.reviewedBy.name} • {formatDateTimeJakarta(am.reviewedAt)}
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

          {selectedSale.status !== "DIBATALKAN" &&
            selectedSale.status !== "DIKEMBALIKAN" &&
            selectedSale.status !== "MENUNGGU_PERSETUJUAN" && (
              <>
                {!showCancelForm ? (
                  <button
                    type="button"
                    onClick={onStartCancelForm}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] px-4 text-xs font-extrabold text-[#D41448] hover:bg-rose-100 cursor-pointer"
                  >
                    <XCircle size={18} weight="bold" aria-hidden="true" />
                    <span>Ajukan Pembatalan</span>
                  </button>
                ) : (
                  <form
                    onSubmit={onSubmitAmendment}
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
                      <label htmlFor="amend-type" className="block text-xs font-bold text-slate-700 mb-1">
                        Jenis Pengajuan
                      </label>
                      <select
                        id="amend-type"
                        value={amendmentType}
                        onChange={(e) =>
                          onAmendmentTypeChange(
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
                      <label htmlFor="amend-reason" className="block text-xs font-bold text-slate-700 mb-1">
                        Alasan Pembatalan (Wajib, minimal 5 karakter)
                      </label>
                      <textarea
                        id="amend-reason"
                        required
                        minLength={5}
                        rows={3}
                        value={amendmentReason}
                        onChange={(e) => onAmendmentReasonChange(e.target.value)}
                        placeholder="Tuliskan alasan pembatalan transaksi secara jelas..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
                      />
                    </div>

                    <div>
                      <label htmlFor="amend-proof" className="block text-xs font-bold text-slate-700 mb-1">
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
                          onChange={(e) => onProofUpload(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onHideCancelForm}
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
  );
}

