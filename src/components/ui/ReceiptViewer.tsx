"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ArrowsOut,
  ArrowSquareOut,
  Camera,
  FilePdf,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Receipt,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { dataUrlToBlobUrl } from "@/lib/receipt-client";

interface ReceiptViewerProps {
  receiptImageData: string | null | undefined;
  sourceLabel?: "Nota Fisik" | "Nota Digital" | null;
  altText?: string;
  canAttachManual?: boolean;
  canReplace?: boolean;
  replacing?: boolean;
  onOpenCamera?: () => void;
  onUploadFile?: (file: File | null) => void;
  onRemove?: () => void;
  compact?: boolean;
}

export function ReceiptViewer({
  receiptImageData,
  sourceLabel,
  altText = "Lampiran foto nota",
  canAttachManual = false,
  canReplace = false,
  replacing = false,
  onOpenCamera,
  onUploadFile,
  onRemove,
  compact = false,
}: ReceiptViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [receiptImageData]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

  const hasReceipt = Boolean(receiptImageData && receiptImageData.trim().length > 10);
  const isPdf = Boolean(receiptImageData?.startsWith("data:application/pdf"));

  const pdfBlobUrl = useMemo(() => {
    if (!hasReceipt || !isPdf || !receiptImageData) return null;
    return dataUrlToBlobUrl(receiptImageData);
  }, [hasReceipt, isPdf, receiptImageData]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const handleOpenPdfNewTab = () => {
    if (!pdfBlobUrl) return;
    window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
  };

  if (!hasReceipt) {
    return (
      <div className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt size={18} weight="bold" className="text-[#202531]" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-[#202531]">Foto / File Nota</h2>
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
            Tanpa Nota
          </span>
        </div>

        <div className="rounded-xl border border-dashed border-[#202531]/20 bg-[#F8FAFC] p-6 text-center space-y-2">
          <Receipt size={28} weight="duotone" className="mx-auto text-[#525866]" aria-hidden="true" />
          <p className="text-sm font-bold text-[#202531]">Belum ada foto nota</p>
          <p className="text-xs text-[#525866] max-w-md mx-auto leading-relaxed">
            Belum ada foto nota yang dilampirkan. Pengajuan tetap dapat diproses tanpa nota, atau Anda bisa melampirkannya selama masih menunggu persetujuan.
          </p>
        </div>

        {canAttachManual && (onOpenCamera || onUploadFile) && (
          <div className="pt-1 space-y-2">
            <p className="text-xs font-semibold text-[#525866]">
              {replacing ? "Menyimpan lampiran nota..." : "Punya notanya? Tambahkan di sini:"}
            </p>
            <div className="flex flex-wrap gap-2">
              {onOpenCamera && (
                <button
                  type="button"
                  disabled={replacing}
                  onClick={onOpenCamera}
                  className="inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] disabled:opacity-50 cursor-pointer"
                >
                  <Camera size={16} weight="bold" aria-hidden="true" />
                  <span>Foto Nota Fisik</span>
                </button>
              )}
              {onUploadFile && (
                <label
                  className={`inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] ${
                    replacing ? "opacity-50 pointer-events-none" : "cursor-pointer"
                  }`}
                >
                  <UploadSimple size={16} weight="bold" aria-hidden="true" />
                  <span>Unggah Nota Digital</span>
                  <input
                    type="file"
                    disabled={replacing}
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      onUploadFile(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#202531]/15 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt size={18} weight="bold" className="text-[#202531]" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-[#202531]">Foto / File Nota</h2>
            {(sourceLabel || isPdf) && (
              <span className="px-2 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                {isPdf ? "Dokumen PDF" : sourceLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!isPdf && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  aria-label="Perkecil tampilan nota"
                  className="min-w-[40px] min-h-[40px] px-2 rounded-lg border border-[#202531]/20 bg-white text-[#202531] hover:bg-[#EBEBEB] flex items-center justify-center cursor-pointer"
                >
                  <MagnifyingGlassMinus size={16} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  title="Reset ukuran gambar"
                  className="min-h-[40px] px-2.5 rounded-lg border border-[#202531]/20 bg-white text-xs font-mono font-bold tabular-nums text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  aria-label="Perbesar tampilan nota"
                  className="min-w-[40px] min-h-[40px] px-2 rounded-lg border border-[#202531]/20 bg-white text-[#202531] hover:bg-[#EBEBEB] flex items-center justify-center cursor-pointer"
                >
                  <MagnifyingGlassPlus size={16} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Putar gambar nota 90 derajat"
                  className="inline-flex items-center gap-1 min-h-[40px] px-2.5 rounded-lg border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
                  <span>Putar</span>
                </button>
              </>
            )}

            {isPdf && pdfBlobUrl && (
              <button
                type="button"
                onClick={handleOpenPdfNewTab}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
              >
                <ArrowSquareOut size={15} weight="bold" aria-hidden="true" />
                <span>Buka Tab Baru</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
            >
              <ArrowsOut size={15} weight="bold" aria-hidden="true" />
              <span>Perbesar</span>
            </button>

            {onRemove && (
              <button
                type="button"
                disabled={replacing}
                onClick={onRemove}
                aria-label="Hapus lampiran nota"
                className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-lg border border-[#FF2A63]/35 bg-[#FFF0F4] text-xs font-bold text-[#D41448] hover:bg-[#FFE0E8] disabled:opacity-50 cursor-pointer"
              >
                <Trash size={15} weight="bold" aria-hidden="true" />
                <span>Hapus Nota</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={`overflow-auto rounded-xl border border-[#202531]/15 bg-[#F1F3F5] p-3 flex justify-center ${
            compact ? "min-h-[200px] max-h-[300px]" : "min-h-[340px] max-h-[540px]"
          }`}
        >
          {isPdf ? (
            pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title={altText}
                className={`w-full rounded-lg bg-white border border-[#202531]/10 ${
                  compact ? "h-[260px]" : "h-[480px]"
                }`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-[#525866]">
                <FilePdf size={36} weight="duotone" className="text-[#D41448]" aria-hidden="true" />
                <span>Dokumen PDF nota terlampir.</span>
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Klik untuk memperbesar gambar nota"
              className="block focus-visible:outline-2 focus-visible:outline-[#202531] rounded cursor-zoom-in self-start"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptImageData || ""}
                alt={altText}
                style={{
                  width: `${zoom * 100}%`,
                  maxWidth: zoom > 1 ? "none" : "100%",
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: "center center",
                }}
                className="h-auto object-contain rounded-lg shadow-sm bg-white transition-transform duration-150"
              />
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#525866]">
          {isPdf
            ? "Tekan Perbesar atau Buka Tab Baru untuk membaca isi dokumen PDF lebih jelas."
            : "Klik gambar untuk memperbesar layar penuh, atau gunakan tombol Putar bila foto miring."}
        </p>

        {canReplace && (onOpenCamera || onUploadFile) && (
          <div className="pt-2.5 border-t border-[#202531]/10 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-xs font-semibold text-[#525866]">
              {replacing ? "Menyimpan foto nota baru..." : "Ingin mengganti foto/file nota?"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenCamera && (
                <button
                  type="button"
                  disabled={replacing}
                  onClick={onOpenCamera}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-[#F8FAFC] border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] disabled:opacity-50 cursor-pointer"
                >
                  <Camera size={15} weight="bold" aria-hidden="true" />
                  <span>Ganti Foto (Kamera)</span>
                </button>
              )}
              {onUploadFile && (
                <label
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-[#F8FAFC] border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] ${
                    replacing ? "opacity-50 pointer-events-none" : "cursor-pointer"
                  }`}
                >
                  <UploadSimple size={15} weight="bold" aria-hidden="true" />
                  <span>Ganti File Nota</span>
                  <input
                    type="file"
                    disabled={replacing}
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      onUploadFile(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] !m-0 bg-[#202531]/90 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Tampilan Layar Penuh Foto Nota"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-[#202531] text-white border-b border-white/15">
              <div className="flex items-center gap-2.5">
                <Receipt size={18} weight="bold" className="text-[#01DAD7]" aria-hidden="true" />
                <span className="text-sm font-extrabold">Foto / File Nota</span>
                {sourceLabel && (
                  <span className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-bold">
                    {sourceLabel}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!isPdf && (
                  <>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                      aria-label="Perkecil gambar nota"
                      className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                    >
                      <MagnifyingGlassMinus size={18} weight="bold" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={resetView}
                      className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-mono font-bold tabular-nums text-white cursor-pointer"
                    >
                      {Math.round(zoom * 100)}% (Reset)
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
                      aria-label="Perbesar gambar nota"
                      className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                    >
                      <MagnifyingGlassPlus size={18} weight="bold" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                    >
                      <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
                      <span>Putar 90°</span>
                    </button>
                  </>
                )}

                {isPdf && pdfBlobUrl && (
                  <button
                    type="button"
                    onClick={handleOpenPdfNewTab}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                  >
                    <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
                    <span>Buka di Tab Baru</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Tutup tampilan layar penuh"
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 cursor-pointer"
                >
                  <X size={16} weight="bold" aria-hidden="true" />
                  <span>Tutup</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start">
              {isPdf ? (
                pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    title={altText}
                    className="w-full max-w-5xl h-[calc(100dvh-110px)] rounded-xl bg-white"
                  />
                ) : (
                  <div className="text-white text-sm py-20">
                    Dokumen PDF tidak dapat ditampilkan inline.
                  </div>
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={receiptImageData || ""}
                  alt={altText}
                  style={{
                    width: `${zoom * 100}%`,
                    maxWidth: zoom > 1 ? "none" : "100%",
                    transform: rotation ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                  className="h-auto object-contain rounded-xl bg-white shadow-2xl"
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
