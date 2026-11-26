"use client";

import React from "react";
import { createPortal } from "react-dom";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { formatRupiah } from "@/lib/format";
import {
  CheckCircle,
  PaperPlaneRight,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";

interface PurchaseActionBarAndModalProps {
  totalCalculated: number;
  viewMode: "INPUT" | "INSPECT";
  isCreateMode: boolean;
  canApprove: boolean;
  approvalStatus: string;
  submitting: boolean;
  mounted: boolean;
  cameraModalOpen: boolean;
  pendingNoteAction: "PERLU_PERBAIKAN" | "DITOLAK" | null;
  decisionNoteInput: string;
  onSubmitPurchase: () => void;
  onApprove: () => void;
  onStartNoteAction: (action: "PERLU_PERBAIKAN" | "DITOLAK") => void;
  onCloseNoteModal: () => void;
  onDecisionNoteChange: (val: string) => void;
  onConfirmNoteDecision: (action: "PERLU_PERBAIKAN" | "DITOLAK") => void;
  onCloseCamera: () => void;
  onCameraCapture: (dataUrl: string) => void;
}

export function PurchaseActionBarAndModal({
  totalCalculated,
  viewMode,
  isCreateMode,
  canApprove,
  approvalStatus,
  submitting,
  mounted,
  cameraModalOpen,
  pendingNoteAction,
  decisionNoteInput,
  onSubmitPurchase,
  onApprove,
  onStartNoteAction,
  onCloseNoteModal,
  onDecisionNoteChange,
  onConfirmNoteDecision,
  onCloseCamera,
  onCameraCapture,
}: PurchaseActionBarAndModalProps) {
  return (
    <>
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-white border-t border-[#202531]/15 px-4 md:px-8 py-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <span className="text-[#525866]">Total Belanja: </span>
          <strong className="font-mono text-sm tabular-nums text-[#202531]">
            {formatRupiah(totalCalculated)}
          </strong>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {viewMode === "INPUT" ? (
            <button
              type="button"
              disabled={submitting}
              aria-busy={submitting}
              onClick={onSubmitPurchase}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <PaperPlaneRight size={16} weight="bold" aria-hidden="true" />
              <span>
                {submitting
                  ? "Mengirim..."
                  : isCreateMode
                  ? "Kirim Pengajuan Pembelian"
                  : "Kirim Perbaikan"}
              </span>
            </button>
          ) : (
            canApprove &&
            approvalStatus !== "DISETUJUI" && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onApprove}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle size={16} weight="bold" aria-hidden="true" />
                  <span>Setujui &amp; Tambah Stok</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onStartNoteAction("PERLU_PERBAIKAN")}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <WarningCircle size={16} weight="bold" aria-hidden="true" />
                  <span>Minta Perbaikan</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onStartNoteAction("DITOLAK")}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-[#D41448] text-xs font-extrabold hover:bg-[#FFE0E8] disabled:opacity-50 cursor-pointer"
                >
                  <XCircle size={16} weight="bold" aria-hidden="true" />
                  <span>Tolak</span>
                </button>
              </>
            )
          )}
        </div>
      </div>

      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={onCloseCamera}
        onCapture={onCameraCapture}
      />

      {mounted &&
        pendingNoteAction &&
        createPortal(
          <div
            className="fixed inset-0 z-[85] !m-0 bg-[#202531]/60 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-note-modal-title"
          >
            <div className="w-full max-w-md rounded-2xl bg-white border border-[#202531]/15 shadow-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="purchase-note-modal-title"
                    className="text-base font-extrabold text-[#202531]"
                  >
                    {pendingNoteAction === "DITOLAK"
                      ? "Alasan Penolakan Pembelian"
                      : "Catatan Perbaikan untuk Pegawai"}
                  </h3>
                  <p className="text-xs text-[#525866] mt-0.5">
                    {pendingNoteAction === "DITOLAK"
                      ? "Jelaskan singkat alasan penolakan agar pegawai tahu penyebabnya."
                      : "Tuliskan bagian nota atau harga yang perlu diperbaiki pegawai."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onCloseNoteModal}
                  aria-label="Tutup dialog catatan"
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-[#525866] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  <X size={18} weight="bold" aria-hidden="true" />
                </button>
              </div>

              <textarea
                id="owner-decision-notes"
                autoFocus
                rows={3}
                value={decisionNoteInput}
                onChange={(e) => onDecisionNoteChange(e.target.value)}
                placeholder="Contoh: Harga di nota Rp 18.000, mohon diperbaiki..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
              />

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onCloseNoteModal}
                  className="px-4 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={submitting || !decisionNoteInput.trim()}
                  aria-busy={submitting}
                  onClick={() => onConfirmNoteDecision(pendingNoteAction)}
                  className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-extrabold text-white hover:opacity-95 disabled:opacity-50 cursor-pointer ${
                    pendingNoteAction === "DITOLAK" ? "bg-[#D41448]" : "bg-[#202531]"
                  }`}
                >
                  <span>
                    {submitting
                      ? "Menyimpan..."
                      : pendingNoteAction === "DITOLAK"
                      ? "Konfirmasi Tolak"
                      : "Kirim Permintaan Perbaikan"}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

