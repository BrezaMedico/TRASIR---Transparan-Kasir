"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { dataUrlToBlobUrl } from "@/lib/receipt-client";
import { formatRoleLabel } from "@/lib/rbac-shared";
import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import type { AmendmentRecord } from "./types";

interface SalesAmendmentsTabProps {
  amendments: AmendmentRecord[];
  isAdmin: boolean;
  currentUserId: string;
  reviewNotesMap: Record<string, string>;
  onReviewNoteChange: (id: string, val: string) => void;
  confirmReview: { item: AmendmentRecord; decision: "DISETUJUI" | "DITOLAK" } | null;
  onSetConfirmReview: (
    next: { item: AmendmentRecord; decision: "DISETUJUI" | "DITOLAK" } | null
  ) => void;
  processingReviewId: string | null;
  onExecuteReview: (id: string, decision: "DISETUJUI" | "DITOLAK") => void;
}

export function SalesAmendmentsTab({
  amendments,
  isAdmin,
  currentUserId,
  reviewNotesMap,
  onReviewNoteChange,
  confirmReview,
  onSetConfirmReview,
  processingReviewId,
  onExecuteReview,
}: SalesAmendmentsTabProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-extrabold text-slate-900">
          Daftar Permintaan Pembatalan &amp; Koreksi Transaksi
        </h2>
        <p className="text-xs text-slate-600">
          Pembatalan wajib disetujui oleh Pemilik atau Manajer lain (pengaju tidak boleh menyetujui permintaannya sendiri). Stok dan keuntungan kotor baru berubah setelah disetujui.
        </p>
      </div>

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
              onClick={() => onSetConfirmReview(null)}
              className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={processingReviewId === confirmReview.item.id}
              onClick={() => onExecuteReview(confirmReview.item.id, confirmReview.decision)}
              className={`px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-50 ${
                confirmReview.decision === "DISETUJUI" ? "bg-[#202531] text-white" : "bg-[#D41448]"
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
            const isSelfRequest = item.requestedBy.id === currentUserId;
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
                      <strong className="font-mono">{formatRupiah(item.sale.totalAmount)}</strong>
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
                        {/^data:image\/(jpeg|png|webp);base64,/i.test(item.proofImageData) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const blobUrl = dataUrlToBlobUrl(item.proofImageData || "");
                              if (!blobUrl) return;
                              window.open(blobUrl, "_blank", "noopener,noreferrer");
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                            }}
                            className="inline-block text-left"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.proofImageData}
                              alt="Bukti pendukung pembatalan"
                              className="h-20 w-auto rounded-lg border border-slate-300 object-cover"
                            />
                          </button>
                        ) : /^data:application\/pdf;base64,/i.test(item.proofImageData) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const blobUrl = dataUrlToBlobUrl(item.proofImageData || "");
                              if (!blobUrl) return;
                              window.open(blobUrl, "_blank", "noopener,noreferrer");
                              setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#202531] hover:underline"
                          >
                            Unduh Lampiran Bukti (PDF)
                          </button>
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
                          onChange={(e) => onReviewNoteChange(item.id, e.target.value)}
                          placeholder="Catatan keputusan / alasan penolakan (opsional)..."
                          aria-label="Catatan keputusan pembatalan"
                          className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSetConfirmReview({ item, decision: "DISETUJUI" })}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 cursor-pointer"
                          >
                            <CheckCircle size={16} weight="bold" aria-hidden="true" />
                            <span>Setujui</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetConfirmReview({ item, decision: "DITOLAK" })}
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
  );
}

