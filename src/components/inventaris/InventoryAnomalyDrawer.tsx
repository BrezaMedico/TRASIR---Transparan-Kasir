"use client";

import React from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber, formatRupiah } from "@/lib/format";
import { FileArrowUp } from "@phosphor-icons/react";
import type { OpnameItemRow } from "./types";

interface InventoryAnomalyDrawerProps {
  selectedAnomaly: OpnameItemRow | null;
  canApprove: boolean;
  explanationText: string;
  explanationProof: string;
  ownerNotesInput: string;
  syncPhysicalStock: boolean;
  submittingAnomaly: boolean;
  onClose: () => void;
  onExplanationTextChange: (val: string) => void;
  onExplanationProofUpload: (file: File | null) => void;
  onOwnerNotesChange: (val: string) => void;
  onSyncPhysicalChange: (val: boolean) => void;
  onSaveExplanation: (e: React.FormEvent) => void;
  onOwnerEvaluate: (
    decision: "TERIMA_PENJELASAN" | "MINTA_INFO_TAMBAHAN" | "TANDAI_TINDAK_LANJUT"
  ) => void;
}

export function InventoryAnomalyDrawer({
  selectedAnomaly,
  canApprove,
  explanationText,
  explanationProof,
  ownerNotesInput,
  syncPhysicalStock,
  submittingAnomaly,
  onClose,
  onExplanationTextChange,
  onExplanationProofUpload,
  onOwnerNotesChange,
  onSyncPhysicalChange,
  onSaveExplanation,
  onOwnerEvaluate,
}: InventoryAnomalyDrawerProps) {
  return (
    <SlideDrawer
      isOpen={Boolean(selectedAnomaly)}
      onClose={onClose}
      title={
        selectedAnomaly
          ? `Evaluasi Selisih Stok: ${selectedAnomaly.product.name}`
          : "Penyelesaian Anomali"
      }
      subtitle="Evaluasi adil berbasis Area Pengawasan, penjelasan pegawai, dan bukti pendukung"
    >
      {selectedAnomaly && (
        <div className="space-y-5 text-xs">
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              selectedAnomaly.areaType === "TERBUKA"
                ? "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]"
                : "bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-sm">
                Konteks Keadilan Audit: Area {selectedAnomaly.areaType}
              </span>
              <StatusBadge status={selectedAnomaly.toleranceStatus} />
            </div>
            <p>
              {selectedAnomaly.areaType === "TERBUKA"
                ? "Barang berada di Area Terbuka (dapat diakses langsung oleh pelanggan). Selisih dapat dipengaruhi oleh barang jatuh/rusak, kelalaian pelanggan, atau kesalahan hitung. Ditandai sebagai bahan pemeriksaan, bukan tuduhan otomatis kepada pegawai."
                : "Barang berada di Area Tertutup (gudang/dapur khusus akses pegawai). Pengawasan dilakukan lebih ketat berdasarkan catatan aktivitas, bukti foto, dan penjelasan pegawai yang bertugas."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <p className="text-slate-500">Stok Sistem</p>
              <p className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                {formatNumber(selectedAnomaly.systemStock)} {selectedAnomaly.product.sellUnit}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Stok Fisik</p>
              <p className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                {formatNumber(selectedAnomaly.physicalStock)} {selectedAnomaly.product.sellUnit}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Nilai Selisih</p>
              <p className="font-mono text-sm font-extrabold text-[#9F1239] mt-0.5">
                {formatRupiah(selectedAnomaly.lossValueRp)}
              </p>
            </div>
          </div>

          <form
            onSubmit={onSaveExplanation}
            className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
          >
            <h3 className="text-sm font-extrabold text-slate-900">
              Penjelasan Pegawai &amp; Bukti Pendukung
            </h3>
            <div>
              <label htmlFor="anom-exp" className="block text-xs font-bold text-slate-700 mb-1">
                Keterangan / Penjelasan Pegawai
              </label>
              <textarea
                id="anom-exp"
                required
                rows={3}
                value={explanationText}
                onChange={(e) => onExplanationTextChange(e.target.value)}
                placeholder="Tuliskan penjelasan mengenai penyebab selisih stok yang ditemukan..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>

            <div>
              <span className="block text-xs font-bold text-slate-700 mb-1">
                Unggah Bukti Pendukung (Foto Barang / Catatan)
              </span>
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                <span>
                  {explanationProof
                    ? "Bukti Foto Terlampir (Klik untuk ganti)"
                    : "Lampirkan Foto Bukti Pendukung"}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => onExplanationProofUpload(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            {explanationProof && (
              <div className="p-2 rounded-xl bg-slate-900 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={explanationProof}
                  alt="Bukti pendukung penjelasan selisih stok"
                  width={320}
                  height={220}
                  className="max-h-44 w-auto object-contain rounded"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submittingAnomaly}
              className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
            >
              Simpan Penjelasan &amp; Bukti Pegawai
            </button>
          </form>

          {canApprove && (
            <div className="p-4 rounded-xl border-2 border-[#334E6B] bg-[#E8EEF4]/40 space-y-3">
              <h3 className="text-sm font-extrabold text-[#334E6B]">Keputusan Evaluasi Pemilik</h3>
              <div>
                <label htmlFor="owner-anom-notes" className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Keputusan Pemilik
                </label>
                <textarea
                  id="owner-anom-notes"
                  rows={2}
                  value={ownerNotesInput}
                  onChange={(e) => onOwnerNotesChange(e.target.value)}
                  placeholder="Tuliskan hasil evaluasi atau instruksi tindak lanjut..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncPhysicalStock}
                  onChange={(e) => onSyncPhysicalChange(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span>Sesuaikan stok sistem mengikuti jumlah stok fisik saat Terima Penjelasan</span>
              </label>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  disabled={submittingAnomaly}
                  onClick={() => onOwnerEvaluate("TERIMA_PENJELASAN")}
                  className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#166534] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                >
                  1. Terima Penjelasan
                </button>
                <button
                  type="button"
                  disabled={submittingAnomaly}
                  onClick={() => onOwnerEvaluate("MINTA_INFO_TAMBAHAN")}
                  className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#B45309] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                >
                  2. Minta Info Tambahan
                </button>
                <button
                  type="button"
                  disabled={submittingAnomaly}
                  onClick={() => onOwnerEvaluate("TANDAI_TINDAK_LANJUT")}
                  className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#9F1239] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                >
                  3. Tandai Tindak Lanjut
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </SlideDrawer>
  );
}

