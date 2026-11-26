"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber } from "@/lib/format";
import { CheckCircle, FileArrowUp, XCircle } from "@phosphor-icons/react";
import type { AdjustmentType, InventoryProduct, StockAdjustmentRow } from "./types";

interface InventoryAdjustmentsTabProps {
  canCreate: boolean;
  canApprove: boolean;
  currentUserId: string;
  currentUserRole: string;
  products: InventoryProduct[];
  warehouses: { id: string; name: string }[];
  adjustments: StockAdjustmentRow[];
  adjProductId: string;
  onAdjProductIdChange: (val: string) => void;
  adjType: AdjustmentType;
  onAdjTypeChange: (val: AdjustmentType) => void;
  adjQty: number;
  onAdjQtyChange: (val: number) => void;
  adjReason: string;
  onAdjReasonChange: (val: string) => void;
  adjProof: string;
  onAdjProofUpload: (file: File | null) => void;
  fromWhId: string;
  onFromWhIdChange: (val: string) => void;
  toWhId: string;
  onToWhIdChange: (val: string) => void;
  submittingAdj: boolean;
  onSubmitAdjustment: (e: React.FormEvent) => void;
  onReviewAdjustment: (id: string, decision: "DISETUJUI" | "DITOLAK") => void;
}

export function InventoryAdjustmentsTab({
  canCreate,
  canApprove,
  currentUserId,
  currentUserRole,
  products,
  warehouses,
  adjustments,
  adjProductId,
  onAdjProductIdChange,
  adjType,
  onAdjTypeChange,
  adjQty,
  onAdjQtyChange,
  adjReason,
  onAdjReasonChange,
  adjProof,
  onAdjProofUpload,
  fromWhId,
  onFromWhIdChange,
  toWhId,
  onToWhIdChange,
  submittingAdj,
  onSubmitAdjustment,
  onReviewAdjustment,
}: InventoryAdjustmentsTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {canCreate && (
        <form
          onSubmit={onSubmitAdjustment}
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
        >
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Ajukan Perubahan Stok Non-Penjualan
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Pengurangan/pemindahan stok wajib mencantumkan alasan jelas &amp; bukti foto, serta baru berlaku setelah disetujui Pemilik
            </p>
          </div>

          <div>
            <label htmlFor="adj-prod" className="block text-xs font-bold text-slate-700 mb-1">
              Pilih Barang
            </label>
            <select
              id="adj-prod"
              required
              value={adjProductId}
              onChange={(e) => onAdjProductIdChange(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
            >
              <option value="">-- Pilih Barang --</option>
              {products
                .filter((p) => p.stockMethod !== "RESEP")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stok: {formatNumber(p.currentStock)} {p.sellUnit})
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-type" className="block text-xs font-bold text-slate-700 mb-1">
                Jenis Perubahan
              </label>
              <select
                id="adj-type"
                value={adjType}
                onChange={(e) => onAdjTypeChange(e.target.value as AdjustmentType)}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
              >
                <option value="RUSAK">1. Barang Rusak</option>
                <option value="KEDALUWARSA">2. Barang Kedaluwarsa</option>
                <option value="HILANG">3. Barang Hilang</option>
                <option value="DIKEMBALIKAN">4. Dikembalikan ke Pemasok</option>
                <option value="PINDAH_GUDANG">5. Pindah Antar-Gudang</option>
              </select>
            </div>

            <div>
              <label htmlFor="adj-qty" className="block text-xs font-bold text-slate-700 mb-1">
                Jumlah Unit
              </label>
              <input
                id="adj-qty"
                type="number"
                min={0.01}
                step="any"
                required
                value={adjQty}
                onChange={(e) => onAdjQtyChange(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-mono text-slate-900"
              />
            </div>
          </div>

          {adjType === "PINDAH_GUDANG" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Gudang Asal
                </label>
                <select
                  value={fromWhId}
                  onChange={(e) => onFromWhIdChange(e.target.value)}
                  className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="">Pilih Gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Gudang Tujuan
                </label>
                <select
                  value={toWhId}
                  onChange={(e) => onToWhIdChange(e.target.value)}
                  className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="">Pilih Gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="adj-reason" className="block text-xs font-bold text-slate-700 mb-1">
              Alasan &amp; Kronologi Perubahan (Wajib)
            </label>
            <textarea
              id="adj-reason"
              required
              rows={3}
              value={adjReason}
              onChange={(e) => onAdjReasonChange(e.target.value)}
              placeholder="Jelaskan penyebab kerusakan, kedaluwarsa, atau perpindahan stok..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
            />
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-700 mb-1">
              Bukti Foto Barang (Wajib)
            </span>
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
              <FileArrowUp size={18} weight="bold" aria-hidden="true" />
              <span>
                {adjProof
                  ? "Foto Bukti Terlampir (Klik untuk ganti)"
                  : "Unggah Foto Barang Rusak / Bukti"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onAdjProofUpload(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submittingAdj}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
          >
            <span>{submittingAdj ? "Mengirim Pengajuan..." : "Kirim Pengajuan ke Pemilik"}</span>
          </button>
        </form>
      )}

      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">
          Daftar Pengajuan Perubahan Stok
        </h2>

        {adjustments.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Belum ada pengajuan perubahan stok yang tercatat.
          </div>
        ) : (
          <div className="space-y-3">
            {adjustments.map((adj) => {
              const allowApprove =
                canApprove &&
                adj.status === "MENUNGGU_PERSETUJUAN" &&
                (currentUserRole === "PEMILIK" ||
                  currentUserRole === "MANAJER" ||
                  adj.requestedBy.id !== currentUserId);

              return (
                <div
                  key={adj.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900">
                        {adj.product.name}
                      </span>
                      <StatusBadge
                        status={adj.adjustmentType}
                        tone="amber"
                        customLabel={adj.adjustmentType}
                      />
                      <StatusBadge status={adj.status} />
                    </div>
                    <p className="text-xs text-slate-800">
                      <strong>Jumlah:</strong>{" "}
                      <span className="font-mono font-bold">
                        {formatNumber(adj.quantity)} {adj.product.sellUnit}
                      </span>{" "}
                      • <strong>Alasan:</strong> {adj.reason}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Diajukan oleh {adj.requestedBy.name} ({adj.requestedBy.role}) •{" "}
                      {formatDateTimeJakarta(adj.createdAt)}
                    </p>
                  </div>

                  {allowApprove && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onReviewAdjustment(adj.id, "DISETUJUI")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#166534] text-white text-xs font-bold cursor-pointer"
                      >
                        <CheckCircle size={15} weight="bold" aria-hidden="true" />
                        <span>Setujui</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onReviewAdjustment(adj.id, "DITOLAK")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#9F1239] text-white text-xs font-bold cursor-pointer"
                      >
                        <XCircle size={15} weight="bold" aria-hidden="true" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

