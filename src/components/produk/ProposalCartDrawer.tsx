"use client";

import React, { useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { useToast } from "@/components/layout/AppShell";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  Camera,
  CookingPot,
  FilePdf,
  PaperPlaneTilt,
  Plus,
  ShoppingCartSimple,
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

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl || file.type === "application/pdf") {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height / width) * maxDim);
            width = maxDim;
          } else {
            width = Math.round((width / height) * maxDim);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
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
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const estimatedTotalCapital = items.reduce((sum, item) => {
    if (item.stockMethod === "RESEP") return sum;
    return sum + Math.round(item.costPrice * Math.max(0, item.currentStock));
  }, 0);

  const handleDigitalUpload = async (file: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 && file.type === "application/pdf") {
      showToast("Ukuran PDF maksimal 2 MB.", "error");
      return;
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      if (dataUrl.length > 2_750_000) {
        showToast("Ukuran file setelah diproses masih melebihi batas 2 MB.", "error");
        return;
      }
      setReceiptImageData(dataUrl);
      setReceiptSource("DIGITAL");
      setReceiptFileName(file.name);
      showToast(`Nota digital "${file.name}" dilampirkan.`, "success");
    } catch {
      showToast("Gagal memproses berkas nota.", "error");
    }
  };

  const handleSubmitBatch = async () => {
    if (items.length === 0) {
      showToast("Keranjang pengajuan masih kosong.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        batchTitle:
          items.length === 1
            ? items[0].name
            : supplierName.trim()
            ? `Pengajuan ${items.length} Item (${supplierName.trim()})`
            : `Paket ${items.length} Pengajuan Barang`,
        batchNote: batchNote.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        receiptImageData: receiptImageData || undefined,
        receiptSource: receiptImageData ? receiptSource || "DIGITAL" : undefined,
        items: items.map((item) => ({
          clientTempId: item.clientTempId,
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
      setReceiptFileName(null);
      onClearCart();
      onClose();
      await onSubmitted();
    } catch {
      showToast("Gagal menghubungi server. Coba beberapa saat lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isPdfReceipt = receiptImageData?.startsWith("data:application/pdf");

  return (
    <>
      <SlideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={`Keranjang Pengajuan (${items.length} Item)`}
        subtitle="Kirim beberapa bahan baku, produk, dan resep sekaligus dalam satu paket agar mudah diperiksa Manajer/Pemilik."
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
              <span>+ Tambah Bahan</span>
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
              <span>+ Tambah Menu / Produk</span>
            </button>
          </div>

          {/* Daftar Item dalam Keranjang */}
          {items.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-[#202531]/20 bg-[#EBEBEB]/40 text-center space-y-2">
              <ShoppingCartSimple
                size={32}
                weight="duotone"
                className="mx-auto text-[#525866]"
                aria-hidden="true"
              />
              <p className="text-sm font-bold text-[#202531]">
                Keranjang pengajuan masih kosong.
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
                  : "Produk Jual";
                const itemEstCost =
                  item.stockMethod === "RESEP"
                    ? 0
                    : Math.round(item.costPrice * Math.max(0, item.currentStock));

                return (
                  <div
                    key={item.clientTempId}
                    className="p-3.5 rounded-2xl bg-white border border-[#202531]/15 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-[#525866]">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-extrabold text-[#202531] truncate">
                          {item.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#EBEBEB] text-[#202531] text-[11px] font-bold">
                          {kindLabel}
                        </span>
                      </div>

                      <p className="text-xs text-[#525866]">
                        {item.stockMethod === "RESEP" ? (
                          <>
                            Harga jual{" "}
                            <strong className="font-mono text-[#202531]">
                              {formatRupiah(item.sellPrice)}
                            </strong>{" "}
                            • Modal resep{" "}
                            <strong className="font-mono text-[#202531]">
                              {formatRupiah(item.costPrice)}
                            </strong>
                          </>
                        ) : (
                          <>
                            Stok awal{" "}
                            <strong className="font-mono text-[#202531]">
                              {formatNumber(item.currentStock)} {getUnitDisplayLabel(item.sellUnit)}
                            </strong>{" "}
                            • Modal/unit{" "}
                            <strong className="font-mono text-[#202531]">
                              {formatRupiah(item.costPrice)}
                            </strong>
                            {itemEstCost > 0 && (
                              <>
                                {" "}
                                (Total{" "}
                                <strong className="font-mono text-[#202531]">
                                  {formatRupiah(itemEstCost)}
                                </strong>
                                )
                              </>
                            )}
                          </>
                        )}
                      </p>

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

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.clientTempId)}
                      aria-label={`Hapus ${item.name} dari keranjang`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] shrink-0 cursor-pointer"
                    >
                      <Trash size={16} weight="bold" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}

              {estimatedTotalCapital > 0 && (
                <div className="p-3.5 rounded-xl bg-[#EBEBEB] flex items-center justify-between text-xs">
                  <span className="font-bold text-[#202531]">
                    Total Estimasi Nilai Belanja/Stok Awal
                  </span>
                  <span className="font-mono text-sm font-extrabold text-[#202531]">
                    {formatRupiah(estimatedTotalCapital)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Informasi Pemasok & Nota (Opsional untuk Pemeriksaan AI) */}
          {items.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 space-y-3.5">
              <div>
                <p className="text-xs font-extrabold text-[#202531]">
                  Nota Belanja &amp; Catatan (Opsional)
                </p>
                <p className="text-[11px] text-[#525866] mt-0.5">
                  Lampirkan foto nota fisik atau file nota digital agar Manajer/Pemilik dapat memindai kesesuaiannya dengan AI.
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
                    className="w-full px-3 h-10 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
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
                    className="w-full px-3 h-10 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
                  />
                </div>
              </div>

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
                    onChange={(e) => handleDigitalUpload(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {receiptImageData && (
                <div className="p-3 rounded-xl bg-white border border-[#202531]/15 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {isPdfReceipt ? (
                      <div className="w-12 h-12 rounded-lg bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                        <FilePdf size={22} weight="bold" aria-hidden="true" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={receiptImageData}
                        alt="Pratinjau lampiran nota"
                        className="w-12 h-12 rounded-lg object-cover border border-[#202531]/15 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#202531] truncate">
                        {receiptFileName ||
                          (receiptSource === "FISIK" ? "Foto Nota Fisik" : "Berkas Nota Digital")}
                      </p>
                      <p className="text-[11px] text-[#525866]">
                        {receiptSource === "FISIK" ? "Sumber: Kamera Nota Fisik" : "Sumber: Nota Digital"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptImageData(null);
                      setReceiptSource(null);
                      setReceiptFileName(null);
                    }}
                    className="px-3 min-h-[40px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] text-xs font-bold cursor-pointer"
                  >
                    Hapus Nota
                  </button>
                </div>
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
          setReceiptFileName("Foto-Nota-Fisik.jpg");
          showToast("Foto nota fisik siap dikirim bersama pengajuan.", "success");
        }}
      />
    </>
  );
}

