"use client";

import React, { useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import { useToast } from "@/components/layout/AppShell";
import { formatNumber, formatRupiah } from "@/lib/format";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import {
  Camera,
  CaretDown,
  CaretUp,
  ClipboardText,
  CookingPot,
  PaperPlaneTilt,
  Plus,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProposalCartItem } from "./types";

interface ProposalCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ProposalCartItem[];
  onRemoveItem: (clientTempId: string) => void;
  onClearCart: () => void;
  onOpenAddMaterial: () => void;
  onOpenAddProduct: () => void;
  onSubmitted: () => Promise<void> | void;
}

export function ProposalCartDrawer({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onClearCart,
  onOpenAddMaterial,
  onOpenAddProduct,
  onSubmitted,
}: ProposalCartDrawerProps) {
  const { showToast } = useToast();
  const [supplierName, setSupplierName] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [receiptImageData, setReceiptImageData] = useState<string | null>(null);
  const [receiptSource, setReceiptSource] = useState<"FISIK" | "DIGITAL" | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const estimatedTotalCapital = items.reduce((sum, item) => {
    if (item.requestKind === "UPDATE" || item.stockMethod === "RESEP") return sum;
    return sum + Math.round(item.costPrice * Math.max(0, item.currentStock));
  }, 0);

  const handleDigitalUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        showToast(result.error || "Gagal memproses berkas nota.", "error");
        return;
      }
      setReceiptImageData(result.dataUrl);
      setReceiptSource("DIGITAL");
      showToast(`Nota digital "${file.name}" dilampirkan.`, "success");
    } catch {
      showToast("Gagal memproses berkas nota.", "error");
    }
  };

  const handleSubmitBatch = async () => {
    if (items.length === 0) {
      showToast("Daftar pengajuan masih kosong.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const updateCount = items.filter((it) => it.requestKind === "UPDATE").length;
      const allUpdates = updateCount === items.length;
      const payload = {
        batchTitle:
          items.length === 1
            ? allUpdates
              ? `Ubah ${items[0].name}`
              : items[0].name
            : supplierName.trim()
            ? `Pengajuan ${items.length} Item (${supplierName.trim()})`
            : allUpdates
            ? `Paket ${items.length} Perubahan Barang`
            : `Paket ${items.length} Pengajuan Barang`,
        batchNote: batchNote.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        receiptImageData: receiptImageData || undefined,
        receiptSource: receiptImageData ? receiptSource || "DIGITAL" : undefined,
        items: items.map((item) => ({
          clientTempId: item.clientTempId,
          targetProductId: item.targetProductId || undefined,
          sku: item.sku,
          barcode: item.barcode,
          name: item.name,
          categoryId: item.categoryId,
          stockMethod: item.stockMethod,
          isRawMaterial: item.isRawMaterial,
          purchaseUnit: item.purchaseUnit,
          sellUnit: item.sellUnit,
          conversionRatio: item.conversionRatio,
          costPrice: item.costPrice,
          sellPrice: item.sellPrice,
          currentStock: item.currentStock,
          minStockAlert: item.minStockAlert,
          variants: item.variants,
        })),
      };

      const res = await fetch("/api/product-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengirim paket pengajuan.", "error");
        return;
      }

      showToast(
        data.message || `${items.length} barang berhasil dikirim ke Manajer/Pemilik.`,
        "success"
      );
      setSupplierName("");
      setBatchNote("");
      setReceiptImageData(null);
      setReceiptSource(null);
      onClearCart();
      onClose();
      await onSubmitted();
    } catch {
      showToast("Gagal menghubungi server. Coba beberapa saat lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SlideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={`Daftar Pengajuan (${items.length} Item)`}
        subtitle="Kumpulkan beberapa bahan baku, produk, dan resep baru, lalu kirim semuanya sekaligus ke Manajer/Pemilik."
        widthClass="max-w-xl"
      >
        <div className="space-y-5">
          {/* Tombol Tambah Cepat */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddMaterial();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
            >
              <CookingPot size={15} weight="bold" aria-hidden="true" />
              <span>Tambah Bahan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAddProduct();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-[#202531] text-xs font-bold hover:bg-[#EBEBEB] cursor-pointer"
            >
              <Plus size={15} weight="bold" aria-hidden="true" />
              <span>Tambah Menu / Produk</span>
            </button>
          </div>

          {/* Daftar Item dalam Pengajuan */}
          {items.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-[#202531]/20 bg-[#EBEBEB]/40 text-center space-y-2">
              <ClipboardText
                size={32}
                weight="duotone"
                className="mx-auto text-[#525866]"
                aria-hidden="true"
              />
              <p className="text-sm font-bold text-[#202531]">
                Daftar pengajuan masih kosong.
              </p>
              <p className="text-xs text-[#525866]">
                Tambahkan bahan baku atau menu/produk baru lalu kirim semuanya sekaligus.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item, idx) => {
                const kindLabel = item.isRawMaterial
                  ? "Bahan Baku"
                  : item.stockMethod === "RESEP"
                  ? "Menu Resep"
                  : "Barang Jadi";
                const itemEstCost =
                  item.stockMethod === "RESEP"
                    ? 0
                    : Math.round(item.costPrice * Math.max(0, item.currentStock));
                const ratio = item.conversionRatio > 1 ? item.conversionRatio : 1;
                const isPackaged = item.stockMethod !== "RESEP" && ratio > 1;
                const packCount = isPackaged
                  ? item.packCount ?? Number((item.currentStock / ratio).toFixed(2))
                  : item.currentStock;
                const packPrice = isPackaged
                  ? item.packPrice ?? Math.round(item.costPrice * ratio)
                  : item.costPrice;
                const unitLabel = getUnitDisplayLabel(item.sellUnit);
                const isExpanded = Boolean(expandedIds[item.clientTempId]);
                const summaryQtyLabel =
                  item.stockMethod === "RESEP"
                    ? "Menu Resep"
                    : isPackaged
                    ? `${formatNumber(packCount)} ${item.purchaseUnit || "kemasan"}`
                    : `${formatNumber(item.currentStock)} ${unitLabel}`;

                return (
                  <div
                    key={item.clientTempId}
                    className="p-3 rounded-2xl bg-white border border-[#202531]/15"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[11px] font-bold text-[#525866] shrink-0">
                          #{idx + 1}
                        </span>
                        {item.requestKind === "UPDATE" && (
                          <span className="px-1.5 py-0.5 rounded bg-[#EBEBEB] border border-[#202531]/15 text-[10px] font-extrabold text-[#202531] shrink-0">
                            Ubah
                          </span>
                        )}
                        <span className="text-sm font-extrabold text-[#202531] truncate">
                          {item.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F8FAFC] border border-[#202531]/10 text-[11px] font-mono font-semibold text-[#525866] shrink-0">
                          {summaryQtyLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpand(item.clientTempId)}
                          className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg border border-[#202531]/15 bg-[#F8FAFC] text-[11px] font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                        >
                          <span>{isExpanded ? "Tutup" : "Lihat lengkap"}</span>
                          {isExpanded ? (
                            <CaretUp size={13} weight="bold" aria-hidden="true" />
                          ) : (
                            <CaretDown size={13} weight="bold" aria-hidden="true" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.clientTempId)}
                          aria-label={`Hapus ${item.name} dari daftar pengajuan`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] shrink-0 cursor-pointer"
                        >
                          <Trash size={15} weight="bold" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-[#202531]/10 space-y-1.5 text-xs text-[#525866]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-block px-2 py-0.5 rounded bg-[#EBEBEB] text-[#202531] text-[11px] font-bold">
                            {kindLabel}
                          </span>
                          {item.requestKind === "UPDATE" && (
                            <span className="inline-block px-2 py-0.5 rounded bg-[#E0F7F6] text-[#005B59] text-[11px] font-bold">
                              Usulan Ubah
                            </span>
                          )}
                        </div>

                        {item.requestKind === "UPDATE" && item.previousSnapshot && (
                          <p className="text-[11px] text-[#202531] bg-[#F8FAFC] border border-[#202531]/10 rounded-lg px-2.5 py-1.5 font-medium">
                            Perubahan:{" "}
                            {!item.isRawMaterial &&
                              `Harga jual ${formatRupiah(item.previousSnapshot.sellPrice)} -> ${formatRupiah(item.sellPrice)}`}
                            {item.previousSnapshot.costPrice !== item.costPrice &&
                              `${!item.isRawMaterial ? " • " : ""}Harga modal ${formatRupiah(item.previousSnapshot.costPrice)} -> ${formatRupiah(item.costPrice)}`}
                            {item.stockMethod !== "RESEP" &&
                              item.previousSnapshot.currentStock !== item.currentStock &&
                              `${!item.isRawMaterial || item.previousSnapshot.costPrice !== item.costPrice ? " • " : ""}Stok ${formatNumber(item.previousSnapshot.currentStock)} -> ${formatNumber(item.currentStock)} ${unitLabel}`}
                          </p>
                        )}

                        {item.stockMethod === "RESEP" ? (
                          <p>
                            Harga jual{" "}
                            <strong className="font-mono tabular-nums text-[#202531]">
                              {formatRupiah(item.sellPrice)}
                            </strong>{" "}
                            • Modal bahan{" "}
                            <strong className="font-mono tabular-nums text-[#202531]">
                              {formatRupiah(item.costPrice)}
                            </strong>
                          </p>
                        ) : isPackaged ? (
                          <div className="space-y-1">
                            <p>
                              (isi {formatNumber(ratio)} {unitLabel}) •{" "}
                              <strong className="font-mono tabular-nums text-[#202531]">
                                {formatRupiah(packPrice)}/{item.purchaseUnit || "kemasan"}
                              </strong>
                              {itemEstCost > 0 && (
                                <>
                                  {" "}
                                  • Total{" "}
                                  <strong className="font-mono tabular-nums text-[#202531]">
                                    {formatRupiah(itemEstCost)}
                                  </strong>
                                </>
                              )}
                            </p>
                            <p className="text-[11px] text-[#525866]">
                              Stok masuk:{" "}
                              <strong className="font-mono tabular-nums text-[#202531]">
                                {formatNumber(item.currentStock)} {unitLabel}
                              </strong>
                              {!item.isRawMaterial && item.sellPrice > 0
                                ? ` • Harga jual: ${formatRupiah(item.sellPrice)}`
                                : ""}
                            </p>
                          </div>
                        ) : (
                          <p>
                            Jumlah{" "}
                            <strong className="font-mono tabular-nums text-[#202531]">
                              {formatNumber(item.currentStock)} {unitLabel}
                            </strong>{" "}
                            • Harga beli{" "}
                            <strong className="font-mono tabular-nums text-[#202531]">
                              {formatRupiah(item.costPrice)}/{unitLabel}
                            </strong>
                            {itemEstCost > 0 && (
                              <>
                                {" "}
                                • Total{" "}
                                <strong className="font-mono tabular-nums text-[#202531]">
                                  {formatRupiah(itemEstCost)}
                                </strong>
                              </>
                            )}
                            {!item.isRawMaterial && item.sellPrice > 0
                              ? ` • Harga jual: ${formatRupiah(item.sellPrice)}`
                              : ""}
                          </p>
                        )}

                        {item.stockMethod === "RESEP" &&
                          item.variants &&
                          item.variants[0]?.ingredients &&
                          item.variants[0].ingredients.length > 0 && (
                            <p className="text-[11px] text-[#525866]">
                              Bahan:{" "}
                              {item.variants[0].ingredients
                                .map(
                                  (ig) =>
                                    `${ig.materialName || "Bahan"} ${formatNumber(ig.quantity)} ${getUnitDisplayLabel(ig.unit)}`
                                )
                                .join(", ")}
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}

              {estimatedTotalCapital > 0 && (
                <div className="p-3.5 rounded-xl bg-[#EBEBEB] flex items-center justify-between text-xs">
                  <span className="font-bold text-[#202531]">
                    Total Estimasi Nilai Belanja/Stok Awal
                  </span>
                  <span className="font-mono text-sm font-extrabold tabular-nums text-[#202531]">
                    {formatRupiah(estimatedTotalCapital)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lampiran Nota (Opsional) - Tanpa Referensi AI untuk Pegawai */}
          {items.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 space-y-3.5">
              <div>
                <p className="text-xs font-extrabold text-[#202531]">
                  Lampiran Nota (Opsional)
                </p>
                <p className="text-[11px] text-[#525866] mt-0.5 leading-relaxed">
                  Tambahkan foto nota fisik atau file nota digital jika tersedia. Anda tetap dapat mengirim pengajuan tanpa nota.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="batch-supplier-name"
                    className="block text-xs font-bold text-[#202531] mb-1"
                  >
                    Nama Pemasok / Toko
                  </label>
                  <input
                    id="batch-supplier-name"
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Contoh: Toko Bahan Kue Maju"
                    className="w-full px-3 h-11 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="batch-note-input"
                    className="block text-xs font-bold text-[#202531] mb-1"
                  >
                    Catatan Pengajuan
                  </label>
                  <input
                    id="batch-note-input"
                    type="text"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    placeholder="Contoh: Stok belanja pagi"
                    className="w-full px-3 h-11 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
                  />
                </div>
              </div>

              <div className="space-y-2">
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
                    <span>Unggah Nota Digital</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        handleDigitalUpload(e.target.files?.[0] || null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-[#525866]">
                  Format JPG, PNG, WEBP, atau PDF (maks. 2 MB).
                </p>
              </div>

              {receiptImageData && (
                <ReceiptViewer
                  receiptImageData={receiptImageData}
                  sourceLabel={receiptSource === "FISIK" ? "Nota Fisik" : "Nota Digital"}
                  altText="Pratinjau lampiran nota pengajuan"
                  compact
                  canReplace
                  onOpenCamera={() => setCameraOpen(true)}
                  onUploadFile={handleDigitalUpload}
                  onRemove={() => {
                    setReceiptImageData(null);
                    setReceiptSource(null);
                  }}
                />
              )}
            </div>
          )}

          {/* Submit Batch */}
          {items.length > 0 && (
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={onClearCart}
                className="px-4 min-h-[48px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
              >
                Kosongkan
              </button>
              <button
                type="button"
                disabled={submitting}
                aria-busy={submitting}
                onClick={handleSubmitBatch}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                <PaperPlaneTilt size={18} weight="bold" aria-hidden="true" />
                <span>
                  {submitting
                    ? "Mengirim Pengajuan..."
                    : `Kirim Semua Pengajuan (${items.length} Item)`}
                </span>
              </button>
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
          showToast("Foto nota fisik dilampirkan.", "success");
        }}
      />
    </>
  );
}
