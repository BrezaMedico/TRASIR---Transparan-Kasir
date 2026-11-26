"use client";

import React, { useEffect, useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import {
  ReceiptAiCheckPanel,
  normalizeProductBatchAiResult,
} from "@/components/ui/ReceiptAiCheckPanel";
import { useToast } from "@/components/layout/AppShell";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import { formatRoleLabel } from "@/lib/rbac-shared";
import {
  parseProductRequestEnvelope,
  type GroupedProductRequestBatch,
  type ProductRequestAIResult,
} from "@/lib/product-request-batch";
import { CaretDown, CaretUp, CheckCircle, XCircle } from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProductRequestItem } from "./types";

interface ProductBatchReviewDrawerProps {
  batch: GroupedProductRequestBatch<ProductRequestItem> | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId?: string;
  onCompleted: () => Promise<void> | void;
}

export function ProductBatchReviewDrawer({
  batch,
  isOpen,
  onClose,
  isAdmin,
  currentUserId,
  onCompleted,
}: ProductBatchReviewDrawerProps) {
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [receiptImageData, setReceiptImageData] = useState<string | null>(null);
  const [receiptSource, setReceiptSource] = useState<"FISIK" | "DIGITAL" | null>(null);
  const [aiResult, setAiResult] = useState<ProductRequestAIResult | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [rejectMode, setRejectMode] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    if (!batch || !isOpen) return;
    const pendingIds = batch.items
      .filter((i) => i.status === "MENUNGGU_PERSETUJUAN")
      .map((i) => i.id);
    setSelectedIds(pendingIds.length > 0 ? pendingIds : batch.items.map((i) => i.id));
    setRejectionReason("");
    setRejectMode(false);
    setExpandedIds({});
    setReceiptImageData(batch.receiptImageData || null);
    setReceiptSource(batch.receiptSource || null);
    setAiResult(batch.aiScanResult || null);
    setAiError(null);
  }, [batch, isOpen]);

  if (!batch) {
    return (
      <SlideDrawer isOpen={false} onClose={onClose} title="Tinjau Paket Pengajuan">
        {null}
      </SlideDrawer>
    );
  }

  const pendingItems = batch.items.filter((i) => i.status === "MENUNGGU_PERSETUJUAN");
  const hasReceipt = Boolean(receiptImageData && receiptImageData.trim().length > 10);
  const canEditReceipt =
    pendingItems.length > 0 &&
    (isAdmin || Boolean(currentUserId && batch.requestedBy.id === currentUserId));

  const toggleItemSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const persistReceiptUpdate = async (
    nextDataUrl: string | null,
    nextSource: "FISIK" | "DIGITAL" | null
  ) => {
    setSavingReceipt(true);
    try {
      const res = await fetch("/api/product-requests/receipt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.batchId.startsWith("single-") ? undefined : batch.batchId,
          requestIds: batch.items.map((i) => i.id),
          receiptImageData: nextDataUrl,
          receiptSource: nextDataUrl ? nextSource || "DIGITAL" : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memperbarui lampiran nota.", "error");
        return;
      }
      setReceiptImageData(data.receiptImageData ?? null);
      setReceiptSource(data.receiptSource ?? null);
      setAiResult(null);
      setAiError(null);
      showToast(
        nextDataUrl
          ? "Lampiran nota berhasil diperbarui."
          : "Lampiran nota berhasil dihapus.",
        "success"
      );
      await onCompleted();
    } catch {
      showToast("Gagal menghubungi server saat menyimpan lampiran nota.", "error");
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleUploadReceipt = async (file: File | null) => {
    if (!file) return;
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        showToast(result.error || "Gagal memproses berkas nota.", "error");
        return;
      }
      await persistReceiptUpdate(result.dataUrl, "DIGITAL");
    } catch {
      showToast("Gagal memproses berkas nota.", "error");
    }
  };

  const handleAnalyzeWithAi = async () => {
    if (!receiptImageData) {
      showToast("Lampirkan foto nota fisik atau file nota digital terlebih dahulu.", "error");
      return;
    }
    setAnalyzingAi(true);
    setAiError(null);
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
        const msg = data.error || "Gagal memeriksa nota dengan AI.";
        setAiError(msg);
        showToast(msg, "error");
        return;
      }
      setAiResult(data.analysis);
      if (data.analysis?.status === "GAGAL_CEK") {
        showToast("AI Gemini belum tersambung saat ini. Coba cek ulang.", "info");
      } else if (data.analysis?.status === "SESUAI") {
        showToast("Hasil cek AI: cocok dengan nota.", "success");
      } else {
        showToast("Hasil cek AI: ada yang berbeda atau perlu dicek.", "info");
      }
      await onCompleted();
    } catch {
      const msg = "Gagal menghubungi layanan AI Gemini. Coba beberapa saat lagi.";
      setAiError(msg);
      showToast(msg, "error");
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleBatchDecision = async (decision: "DISETUJUI" | "DITOLAK") => {
    if (selectedIds.length === 0) {
      showToast("Pilih minimal 1 barang untuk diproses.", "error");
      return;
    }
    if (decision === "DITOLAK" && !rejectionReason.trim()) {
      showToast("Tuliskan alasan penolakan agar pegawai tahu bagian mana yang salah.", "error");
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
        showToast(data.error || "Gagal memproses keputusan.", "error");
        return;
      }

      showToast(
        decision === "DISETUJUI"
          ? `${data.processedCount} barang berhasil disetujui dan langsung masuk katalog.`
          : `${data.processedCount} barang ditolak.`,
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

  const normalizedAiReport = aiResult
    ? normalizeProductBatchAiResult(aiResult, {
        supplierName: batch.supplierName,
        items: batch.items.map((item) => {
          const env = parseProductRequestEnvelope(item.variantsJson);
          return {
            name: item.name,
            stockMethod: item.stockMethod,
            initialStock: item.stockMethod !== "RESEP" ? env.initialStock ?? 0 : 0,
            sellUnit: item.sellUnit,
            purchaseUnit: item.purchaseUnit,
            conversionRatio: item.conversionRatio,
            costPrice: item.costPrice,
          };
        }),
      })
    : null;

  const rightColumnContent = (
    <div className="space-y-5 text-xs">
      {/* 1. Ringkasan Singkat Pengajuan */}
      <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[#525866]">Total Barang</p>
          <p className="font-mono font-extrabold tabular-nums text-sm text-[#202531] mt-0.5">
            {batch.items.length} Barang
          </p>
        </div>
        <div>
          <p className="text-[#525866]">Total Belanja</p>
          <p className="font-mono font-extrabold tabular-nums text-sm text-[#202531] mt-0.5">
            {formatRupiah(batch.totalEstimatedCost)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[#525866]">Toko / Pemasok</p>
          <p className="font-bold text-[#202531] mt-0.5 truncate">
            {batch.supplierName || "-"}
          </p>
        </div>
        {batch.batchNote && (
          <div className="col-span-2 sm:col-span-3 pt-2 border-t border-[#202531]/10">
            <span className="font-bold text-[#525866]">Catatan Pegawai: </span>
            <span className="text-[#202531]">{batch.batchNote}</span>
          </div>
        )}
      </div>

      {/* 2. CEK NOTA DENGAN AI (Posisi teratas untuk Manajer/Pemilik agar langsung kelihatan) */}
      {isAdmin && (
        <ReceiptAiCheckPanel
          hasReceipt={hasReceipt}
          report={normalizedAiReport}
          loading={analyzingAi}
          errorMessage={aiError}
          onRunCheck={handleAnalyzeWithAi}
        />
      )}

      {/* 3. Daftar Barang Diajukan (Format ramah orang awam) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-[#202531]">
            Daftar Barang yang Diinput Pegawai ({batch.items.length})
          </h3>
          {isAdmin && pendingItems.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setSelectedIds((prev) =>
                  prev.length === pendingItems.length ? [] : pendingItems.map((i) => i.id)
                )
              }
              className="text-xs font-bold text-[#006B69] hover:underline cursor-pointer"
            >
              {selectedIds.length === pendingItems.length
                ? "Batal pilih semua"
                : "Pilih semua"}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {batch.items.map((item) => {
            const env = parseProductRequestEnvelope(item.variantsJson);
            const isUpdate = env.requestKind === "UPDATE";
            const initStock = item.stockMethod !== "RESEP" ? env.initialStock ?? 0 : 0;
            const isPending = item.status === "MENUNGGU_PERSETUJUAN";
            const checked = selectedIds.includes(item.id);
            const ratio = item.conversionRatio > 1 ? item.conversionRatio : 1;
            const isPackaged = item.stockMethod !== "RESEP" && ratio > 1;
            const packCount = isPackaged ? Number((initStock / ratio).toFixed(2)) : initStock;
            const packPrice = isPackaged ? Math.round(item.costPrice * ratio) : item.costPrice;
            const itemTotal = Math.round(item.costPrice * initStock);
            const unitLabel = getUnitDisplayLabel(item.sellUnit);

            const kindLabel = item.isRawMaterial
              ? "Bahan Baku"
              : item.stockMethod === "RESEP"
              ? "Menu Resep"
              : "Barang Jadi";
            const isExpanded = Boolean(expandedIds[item.id]);
            const compactQtyLabel = isUpdate
              ? "Usulan Ubah"
              : item.stockMethod === "RESEP"
              ? "Menu Resep"
              : isPackaged
              ? `${formatNumber(packCount)} ${item.purchaseUnit || "kemasan"}`
              : `${formatNumber(initStock)} ${unitLabel}`;

            return (
              <div
                key={item.id}
                className={`p-3 rounded-2xl border transition-colors ${
                  checked && isPending && isAdmin
                    ? "border-[#202531] bg-white"
                    : "border-[#202531]/15 bg-[#F8FAFC]"
                }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isAdmin && isPending ? (
                      <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleItemSelect(item.id)}
                          className="w-4 h-4 accent-[#202531] shrink-0 cursor-pointer"
                        />
                        <span className="text-sm font-extrabold text-[#202531] truncate">
                          {item.name}
                        </span>
                      </label>
                    ) : (
                      <span className="text-sm font-extrabold text-[#202531] truncate">
                        {item.name}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-[#F8FAFC] border border-[#202531]/10 text-[11px] font-mono font-semibold text-[#525866] shrink-0">
                      {compactQtyLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(batch.status === "SEBAGIAN" || item.status !== "MENUNGGU_PERSETUJUAN") && (
                      <StatusBadge status={item.status} />
                    )}
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg border border-[#202531]/15 bg-white text-[11px] font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                    >
                      <span>{isExpanded ? "Tutup" : "Lihat lengkap"}</span>
                      {isExpanded ? (
                        <CaretUp size={13} weight="bold" aria-hidden="true" />
                      ) : (
                        <CaretDown size={13} weight="bold" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#202531]/10 space-y-1.5 text-xs text-[#525866]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#EBEBEB] text-[#202531] text-[11px] font-bold">
                        {kindLabel}
                      </span>
                      {isUpdate && (
                        <span className="px-2 py-0.5 rounded bg-[#E0F7F6] text-[#005B59] text-[11px] font-bold">
                          Usulan Ubah
                        </span>
                      )}
                      <StatusBadge status={item.status} />
                    </div>

                    {isUpdate && env.previousSnapshot && (
                      <p className="text-[11px] text-[#202531] bg-white border border-[#202531]/10 rounded-lg px-2.5 py-1.5 font-medium">
                        Perubahan:{" "}
                        {!item.isRawMaterial &&
                          `Harga jual ${formatRupiah(env.previousSnapshot.sellPrice)} -> ${formatRupiah(item.sellPrice)}`}
                        {env.previousSnapshot.costPrice !== item.costPrice &&
                          `${!item.isRawMaterial ? " • " : ""}Harga modal ${formatRupiah(env.previousSnapshot.costPrice)} -> ${formatRupiah(item.costPrice)}`}
                        {item.stockMethod !== "RESEP" &&
                          typeof env.initialStock === "number" &&
                          env.previousSnapshot.currentStock !== env.initialStock &&
                          `${!item.isRawMaterial || env.previousSnapshot.costPrice !== item.costPrice ? " • " : ""}Stok ${formatNumber(env.previousSnapshot.currentStock)} -> ${formatNumber(env.initialStock)} ${unitLabel}`}
                      </p>
                    )}

                    {item.stockMethod === "RESEP" ? (
                      <div className="space-y-1">
                        <p>
                          Harga jual:{" "}
                          <strong className="font-mono tabular-nums text-[#202531]">
                            {formatRupiah(item.sellPrice)}
                          </strong>{" "}
                          • Modal bahan:{" "}
                          <strong className="font-mono tabular-nums text-[#202531]">
                            {formatRupiah(item.costPrice)}
                          </strong>
                        </p>
                        {env.variants &&
                          env.variants[0]?.ingredients &&
                          env.variants[0].ingredients.length > 0 && (
                            <p className="text-[11px] text-[#525866]">
                              Bahan:{" "}
                              {env.variants[0].ingredients
                                .map(
                                  (ig) =>
                                    `${ig.materialName || "Bahan"} (${formatNumber(ig.quantity)} ${getUnitDisplayLabel(ig.unit)})`
                                )
                                .join(", ")}
                            </p>
                          )}
                      </div>
                    ) : isPackaged ? (
                      <div className="space-y-1">
                        <p>
                          (isi {formatNumber(ratio)} {unitLabel}) •{" "}
                          <strong className="font-mono tabular-nums text-[#202531]">
                            {formatRupiah(packPrice)}/{item.purchaseUnit || "kemasan"}
                          </strong>{" "}
                          • Total{" "}
                          <strong className="font-mono tabular-nums text-[#202531]">
                            {formatRupiah(itemTotal)}
                          </strong>
                        </p>
                        <p className="text-[11px] text-[#525866]">
                          Stok masuk:{" "}
                          <strong className="font-mono tabular-nums text-[#202531]">
                            {formatNumber(initStock)} {unitLabel}
                          </strong>
                          {!item.isRawMaterial && item.sellPrice > 0
                            ? ` • Harga jual: ${formatRupiah(item.sellPrice)}`
                            : ""}
                        </p>
                      </div>
                    ) : (
                      <p>
                        Jumlah:{" "}
                        <strong className="font-mono tabular-nums text-[#202531]">
                          {formatNumber(initStock)} {unitLabel}
                        </strong>{" "}
                        • Beli:{" "}
                        <strong className="font-mono tabular-nums text-[#202531]">
                          {formatRupiah(item.costPrice)}/{unitLabel}
                        </strong>{" "}
                        • Total:{" "}
                        <strong className="font-mono tabular-nums text-[#202531]">
                          {formatRupiah(itemTotal)}
                        </strong>
                        {!item.isRawMaterial && item.sellPrice > 0 && (
                          <>
                            {" "}
                            • Jual:{" "}
                            <strong className="font-mono tabular-nums text-[#202531]">
                              {formatRupiah(item.sellPrice)}
                            </strong>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Keputusan Anda (Manajer/Pemilik) */}
      {isAdmin && pendingItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 space-y-3">
          <p className="text-sm font-extrabold text-[#202531]">Keputusan Anda</p>

          {!rejectMode ? (
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
                    ? "Menyimpan..."
                    : `Setujui ${selectedIds.length === pendingItems.length ? "Semua " : ""}(${selectedIds.length} Barang)`}
                </span>
              </button>

              <button
                type="button"
                disabled={reviewBusy || selectedIds.length === 0}
                onClick={() => setRejectMode(true)}
                className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-[#D41448] text-xs font-extrabold hover:bg-[#FFE0E8] disabled:opacity-50 cursor-pointer"
              >
                <XCircle size={18} weight="bold" aria-hidden="true" />
                <span>Tolak ({selectedIds.length} Barang)</span>
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-[#FFF0F4]/60 border border-[#FF2A63]/30 p-3.5 space-y-3">
              <div>
                <label
                  htmlFor="batch-reject-reason"
                  className="block text-xs font-extrabold text-[#202531]"
                >
                  Alasan penolakan (wajib diisi)
                </label>
                <p className="text-[11px] text-[#525866] mt-0.5">
                  Jelaskan singkat bagian yang perlu diperbaiki pegawai.
                </p>
              </div>

              <textarea
                id="batch-reject-reason"
                autoFocus
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Contoh: Harga di nota Rp 18.000, bukan Rp 20.000..."
                className="w-full px-3.5 py-2 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={reviewBusy}
                  onClick={() => {
                    setRejectMode(false);
                    setRejectionReason("");
                  }}
                  className="px-4 min-h-[44px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={reviewBusy || selectedIds.length === 0 || !rejectionReason.trim()}
                  aria-busy={reviewBusy}
                  onClick={() => handleBatchDecision("DITOLAK")}
                  className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#D41448] text-white text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  <XCircle size={16} weight="bold" aria-hidden="true" />
                  <span>
                    {reviewBusy
                      ? "Menyimpan..."
                      : `Konfirmasi Tolak (${selectedIds.length} Barang)`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <SlideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={batch.batchTitle}
        subtitle={`Diajukan ${batch.requestedBy.name} (${formatRoleLabel(batch.requestedBy.role)}) • ${formatDateTimeJakarta(batch.createdAt)}`}
        widthClass={hasReceipt ? "max-w-5xl" : "max-w-2xl"}
      >
        {hasReceipt ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 lg:sticky lg:top-0">
              <ReceiptViewer
                receiptImageData={receiptImageData}
                sourceLabel={receiptSource === "FISIK" ? "Nota Fisik" : "Nota Digital"}
                altText={`Lampiran nota ${batch.batchTitle}`}
                canReplace={canEditReceipt}
                replacing={savingReceipt}
                onOpenCamera={canEditReceipt ? () => setCameraOpen(true) : undefined}
                onUploadFile={canEditReceipt ? handleUploadReceipt : undefined}
                onRemove={
                  canEditReceipt
                    ? () => {
                        void persistReceiptUpdate(null, null);
                      }
                    : undefined
                }
              />
            </div>
            <div className="lg:col-span-6">{rightColumnContent}</div>
          </div>
        ) : (
          <div className="space-y-5">
            {rightColumnContent}
            {(canEditReceipt || isAdmin) && (
              <ReceiptViewer
                receiptImageData={null}
                canAttachManual={canEditReceipt}
                replacing={savingReceipt}
                onOpenCamera={() => setCameraOpen(true)}
                onUploadFile={handleUploadReceipt}
              />
            )}
          </div>
        )}
      </SlideDrawer>

      <CameraCaptureModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          void persistReceiptUpdate(dataUrl, "FISIK");
        }}
      />
    </>
  );
}
