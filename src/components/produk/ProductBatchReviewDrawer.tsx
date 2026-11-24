"use client";

import React, { useEffect, useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { useToast } from "@/components/layout/AppShell";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { formatRoleLabel } from "@/lib/rbac-shared";
import {
  parseProductRequestEnvelope,
  type GroupedProductRequestBatch,
  type ProductRequestAIResult,
} from "@/lib/product-request-batch";
import {
  Camera,
  CheckCircle,
  FilePdf,
  MagnifyingGlass,
  Sparkle,
  UploadSimple,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProductRequestItem } from "./types";

interface ProductBatchReviewDrawerProps {
  batch: GroupedProductRequestBatch<ProductRequestItem> | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onCompleted: () => Promise<void> | void;
}

export function ProductBatchReviewDrawer({
  batch,
  isOpen,
  onClose,
  isAdmin,
  onCompleted,
}: ProductBatchReviewDrawerProps) {
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [receiptImageData, setReceiptImageData] = useState<string | null>(null);
  const [receiptSource, setReceiptSource] = useState<"FISIK" | "DIGITAL" | null>(null);
  const [aiResult, setAiResult] = useState<ProductRequestAIResult | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (!batch || !isOpen) return;
    const pendingIds = batch.items
      .filter((i) => i.status === "MENUNGGU_PERSETUJUAN")
      .map((i) => i.id);
    setSelectedIds(pendingIds.length > 0 ? pendingIds : batch.items.map((i) => i.id));
    setRejectionReason("");
    setReceiptImageData(batch.receiptImageData || null);
    setReceiptSource(batch.receiptSource || null);
    setAiResult(batch.aiScanResult || null);
  }, [batch, isOpen]);

  if (!batch) {
    return (
      <SlideDrawer isOpen={false} onClose={onClose} title="Tinjau Paket Pengajuan">
        {null}
      </SlideDrawer>
    );
  }

  const pendingItems = batch.items.filter((i) => i.status === "MENUNGGU_PERSETUJUAN");
  const isPdfReceipt = receiptImageData?.startsWith("data:application/pdf");

  const toggleItemSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleUploadReceipt = (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Ukuran file nota maksimal 2 MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReceiptImageData(reader.result);
        setReceiptSource("DIGITAL");
        setAiResult(null);
        showToast("Berkas nota digital siap dipindai AI.", "info");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeWithAi = async () => {
    if (!receiptImageData) {
      showToast("Lampirkan foto nota fisik atau nota digital terlebih dahulu.", "error");
      return;
    }
    setAnalyzingAi(true);
    try {
      const res = await fetch("/api/product-requests/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.batchId.startsWith("single-") ? undefined : batch.batchId,
          requestIds: batch.items.map((i) => i.id),
          receiptImageData,
          receiptSource: receiptSource || "DIGITAL",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memindai kesesuaian nota.", "error");
        return;
      }
      setAiResult(data.analysis);
      showToast(
        data.analysis?.status === "SESUAI"
          ? "Pemindaian selesai: pengajuan sesuai dengan nota."
          : "Pemindaian selesai: ada poin yang perlu dicek.",
        data.analysis?.status === "SESUAI" ? "success" : "info"
      );
      await onCompleted();
    } catch {
      showToast("Gagal menghubungi layanan AI. Coba beberapa saat lagi.", "error");
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleBatchDecision = async (decision: "DISETUJUI" | "DITOLAK") => {
    if (selectedIds.length === 0) {
      showToast("Pilih minimal 1 item untuk diproses.", "error");
      return;
    }
    if (decision === "DITOLAK" && !rejectionReason.trim()) {
      showToast("Tuliskan alasan penolakan singkat agar pengaju tahu perbaikannya.", "error");
      return;
    }

    setReviewBusy(true);
    try {
      const res = await fetch("/api/product-requests/batch-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.batchId.startsWith("single-") ? undefined : batch.batchId,
          requestIds: selectedIds,
          decision,
          rejectionReason: decision === "DITOLAK" ? rejectionReason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan paket.", "error");
        return;
      }

      showToast(
        decision === "DISETUJUI"
          ? `${data.processedCount} item berhasil disetujui dan langsung aktif.`
          : `${data.processedCount} item ditolak.`,
        decision === "DISETUJUI" ? "success" : "info"
      );
      onClose();
      await onCompleted();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <>
      <SlideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={batch.batchTitle}
        subtitle={`Diajukan ${batch.requestedBy.name} (${formatRoleLabel(batch.requestedBy.role)}) pada ${formatDateTimeJakarta(batch.createdAt)}`}
        widthClass="max-w-2xl"
      >
        <div className="space-y-5 text-xs">
          {/* Ringkasan Paket */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[#525866]">Jumlah Item</p>
              <p className="font-mono font-extrabold text-sm text-[#202531] mt-0.5">
                {batch.items.length} Barang
              </p>
            </div>
            <div>
              <p className="text-[#525866]">Estimasi Nilai</p>
              <p className="font-mono font-extrabold text-sm text-[#202531] mt-0.5">
                {formatRupiah(batch.totalEstimatedCost)}
              </p>
            </div>
            <div>
              <p className="text-[#525866]">Pemasok</p>
              <p className="font-bold text-[#202531] mt-0.5 truncate">
                {batch.supplierName || "-"}
              </p>
            </div>
            <div>
              <p className="text-[#525866]">Status Paket</p>
              <div className="mt-1">
                <StatusBadge status={batch.status === "SEBAGIAN" ? "MENUNGGU_PERSETUJUAN" : batch.status} />
              </div>
            </div>
            {batch.batchNote && (
              <div className="col-span-2 sm:col-span-4 pt-2 border-t border-[#202531]/10">
                <span className="font-bold text-[#525866]">Catatan: </span>
                <span className="text-[#202531]">{batch.batchNote}</span>
              </div>
            )}
          </div>

          {/* Daftar Barang dalam Paket */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#202531]">
                Daftar Barang Diajukan ({batch.items.length})
              </h3>
              {isAdmin && pendingItems.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.length === pendingItems.length ? [] : pendingItems.map((i) => i.id)
                    )
                  }
                  className="text-xs font-bold text-[#008F8C] hover:underline cursor-pointer"
                >
                  {selectedIds.length === pendingItems.length ? "Hapus semua centang" : "Pilih semua menunggu"}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {batch.items.map((item) => {
                const env = parseProductRequestEnvelope(item.variantsJson);
                const initStock = item.stockMethod !== "RESEP" ? env.initialStock ?? 0 : 0;
                const isPending = item.status === "MENUNGGU_PERSETUJUAN";
                const checked = selectedIds.includes(item.id);
                const kindLabel = item.isRawMaterial
                  ? "Bahan Baku"
                  : item.stockMethod === "RESEP"
                  ? "Menu Resep"
                  : "Produk Jual";

                return (
                  <label
                    key={item.id}
                    className={`block p-3.5 rounded-2xl border transition-colors ${
                      isPending ? "cursor-pointer" : "opacity-80"
                    } ${
                      checked && isPending
                        ? "border-[#202531] bg-white"
                        : "border-[#202531]/15 bg-[#F8FAFC]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {isAdmin && isPending && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItemSelect(item.id)}
                          className="mt-0.5 w-4 h-4 accent-[#202531] cursor-pointer"
                        />
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-extrabold text-[#202531]">
                              {item.name}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#EBEBEB] text-[#202531] text-[11px] font-bold">
                              {kindLabel}
                            </span>
                            <span className="font-mono text-[11px] text-[#525866]">
                              {item.sku}
                            </span>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#525866]">
                          <span>
                            Modal:{" "}
                            <strong className="font-mono text-[#202531]">
                              {formatRupiah(item.costPrice)}/{getUnitDisplayLabel(item.sellUnit)}
                            </strong>
                          </span>
                          {!item.isRawMaterial && (
                            <span>
                              Jual:{" "}
                              <strong className="font-mono text-[#202531]">
                                {formatRupiah(item.sellPrice)}
                              </strong>
                            </span>
                          )}
                          {item.stockMethod !== "RESEP" && (
                            <span>
                              Stok awal:{" "}
                              <strong className="font-mono text-[#202531]">
                                {formatNumber(initStock)} {getUnitDisplayLabel(item.sellUnit)}
                              </strong>
                            </span>
                          )}
                        </div>

                        {item.stockMethod === "RESEP" &&
                          env.variants &&
                          env.variants.length > 0 &&
                          env.variants[0].ingredients &&
                          env.variants[0].ingredients.length > 0 && (
                            <p className="text-[11px] text-[#525866]">
                              Takaran resep:{" "}
                              {env.variants[0].ingredients
                                .map(
                                  (ig) =>
                                    `${ig.materialName || "Bahan"} (${formatNumber(ig.quantity)} ${getUnitDisplayLabel(ig.unit)})`
                                )
                                .join(", ")}
                            </p>
                          )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* PANEL OPSIONAL: Pindai Nota dengan AI (Fisik & Digital) */}
          <div className="p-4 rounded-2xl border border-[#202531]/20 bg-white space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkle size={18} weight="fill" className="text-[#008F8C]" aria-hidden="true" />
                  <h3 className="text-sm font-extrabold text-[#202531]">
                    Cek Kesesuaian Nota dengan AI (Opsional)
                  </h3>
                </div>
                <p className="text-[11px] text-[#525866] mt-0.5">
                  Cocokkan daftar barang di atas dengan foto nota fisik atau dokumen nota digital. Anda tetap bisa menyetujui langsung tanpa AI.
                </p>
              </div>
              {receiptImageData && (
                <span className="px-2.5 py-1 rounded-md bg-[#EBEBEB] text-[#202531] text-[11px] font-bold">
                  {receiptSource === "FISIK" ? "Nota Fisik" : "Nota Digital"}
                </span>
              )}
            </div>

            {receiptImageData ? (
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#202531]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isPdfReceipt ? (
                    <div className="w-16 h-16 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                      <FilePdf size={28} weight="bold" aria-hidden="true" />
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={receiptImageData}
                      alt="Bukti nota pengajuan"
                      className="w-20 h-20 rounded-xl object-cover border border-[#202531]/15 shrink-0"
                    />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold text-[#202531]">Bukti Nota Terlampir</p>
                    <p className="text-[11px] text-[#525866]">
                      {receiptSource === "FISIK"
                        ? "Tangkapan kamera nota fisik"
                        : "Berkas gambar / PDF nota digital"}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={analyzingAi}
                      aria-busy={analyzingAi}
                      onClick={handleAnalyzeWithAi}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2a3140] disabled:opacity-50 cursor-pointer"
                    >
                      <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                      <span>
                        {analyzingAi
                          ? "Memindai Nota..."
                          : aiResult
                          ? "Pindai Ulang AI"
                          : "Pindai & Cocokkan dengan AI"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              isAdmin && (
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-dashed border-[#202531]/20 space-y-2.5">
                  <p className="text-xs text-[#525866]">
                    Belum ada nota terlampir dari pegawai. Jika ingin memakai AI, unggah foto nota fisik atau file nota digital di bawah:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                    >
                      <Camera size={16} weight="bold" aria-hidden="true" />
                      <span>Foto Nota Fisik</span>
                    </button>
                    <label className="inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer">
                      <UploadSimple size={16} weight="bold" aria-hidden="true" />
                      <span>Unggah Nota Digital (Gambar/PDF)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => handleUploadReceipt(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              )
            )}

            {/* Hasil Analisis AI */}
            {aiResult && (
              <div className="space-y-3 pt-1">
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                    aiResult.status === "SESUAI"
                      ? "bg-[#01DAD7]/15 border-[#008F8C]/40 text-[#202531]"
                      : "bg-[#FFF0F4] border-[#FF2A63]/35 text-[#D41448]"
                  }`}
                >
                  {aiResult.status === "SESUAI" ? (
                    <CheckCircle size={18} weight="fill" className="text-[#008F8C] shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <Warning size={18} weight="fill" className="text-[#D41448] shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div className="space-y-1">
                    <p className="font-extrabold">
                      {aiResult.status === "SESUAI"
                        ? "Hasil Cek AI: Selaras dengan Nota"
                        : aiResult.status === "TERINDIKASI_EDIT"
                        ? "Hasil Cek AI: Nota Perlu Diperiksa Mendalam"
                        : "Hasil Cek AI: Terdapat Selisih / Poin Perlu Dicek"}
                    </p>
                    <p className="text-[#202531] leading-relaxed">{aiResult.neutralSummary}</p>
                    <p className="text-[11px] text-[#525866]">
                      Pemasok nota: <strong>{aiResult.extractedSupplier || "-"}</strong> • Total nota:{" "}
                      <strong className="font-mono">
                        {aiResult.extractedTotal !== null ? formatRupiah(aiResult.extractedTotal) : "-"}
                      </strong>{" "}
                      vs Estimasi input:{" "}
                      <strong className="font-mono">
                        {formatRupiah(aiResult.submittedEstimatedTotal)}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {aiResult.items.map((row, idx) => (
                    <div
                      key={`${row.submittedName}-${idx}`}
                      className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#202531]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-bold text-[#202531]">{row.submittedName}</p>
                        {row.note && <p className="text-[11px] text-[#525866]">{row.note}</p>}
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold self-start sm:self-center shrink-0 ${
                          row.matchStatus === "COCOK"
                            ? "bg-[#202531] text-[#01DAD7]"
                            : row.matchStatus === "RESEP_NON_NOTA"
                            ? "bg-[#EBEBEB] text-[#202531]"
                            : "bg-[#FFF0F4] text-[#D41448] border border-[#FF2A63]/30"
                        }`}
                      >
                        {row.matchStatus === "COCOK"
                          ? "Cocok di Nota"
                          : row.matchStatus === "RESEP_NON_NOTA"
                          ? "Resep Non-Nota"
                          : row.matchStatus === "TIDAK_DITEMUKAN"
                          ? "Tidak Ada di Nota"
                          : "Ada Selisih"}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-[#525866] italic">{aiResult.disclaimer}</p>
              </div>
            )}
          </div>

          {/* Aksi Keputusan 1-Klik Manajer/Pemilik */}
          {isAdmin && pendingItems.length > 0 && (
            <div className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="batch-reject-reason"
                  className="block font-bold text-[#202531] mb-1"
                >
                  Alasan Penolakan (wajib diisi jika menolak)
                </label>
                <textarea
                  id="batch-reject-reason"
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Contoh: Harga susu pada nota berbeda dengan angka yang diinput..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#202531]/20 text-xs text-[#202531]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={reviewBusy || selectedIds.length === 0}
                  aria-busy={reviewBusy}
                  onClick={() => handleBatchDecision("DISETUJUI")}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle size={18} weight="bold" aria-hidden="true" />
                  <span>
                    {reviewBusy
                      ? "Memproses..."
                      : `Setujui ${selectedIds.length === pendingItems.length ? "Semua" : ""} (${selectedIds.length} Item)`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={reviewBusy || selectedIds.length === 0}
                  onClick={() => handleBatchDecision("DITOLAK")}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-[#D41448] text-xs font-extrabold hover:bg-[#FFE0E8] disabled:opacity-50 cursor-pointer"
                >
                  <XCircle size={18} weight="bold" aria-hidden="true" />
                  <span>Tolak ({selectedIds.length} Item)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </SlideDrawer>

      <CameraCaptureModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          setReceiptImageData(dataUrl);
          setReceiptSource("FISIK");
          setAiResult(null);
          showToast("Foto nota fisik siap dipindai AI.", "info");
        }}
      />
    </>
  );
}

