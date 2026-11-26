"use client";

import React from "react";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import { formatRupiah } from "@/lib/format";
import { Camera, Plus, UploadSimple } from "@phosphor-icons/react";
import type { PurchaseCatalogProd, PurchaseInputRow, PurchaseUnitOption } from "./types";
import { PurchaseItemRowCard } from "./PurchaseItemRowCard";

interface PurchaseInputFormProps {
  supplierName: string;
  onSupplierNameChange: (val: string) => void;
  purchaseDate: string;
  onPurchaseDateChange: (val: string) => void;
  invoiceNumber: string;
  onInvoiceNumberChange: (val: string) => void;
  fundingSource: "DANA_TOKO" | "BELANJA_PEMILIK";
  onFundingSourceChange: (val: "DANA_TOKO" | "BELANJA_PEMILIK") => void;
  items: PurchaseInputRow[];
  products: PurchaseCatalogProd[];
  units: PurchaseUnitOption[];
  totalCalculated: number;
  hasReceipt: boolean;
  receiptImageData: string;
  captureMethod: "LIVE_CAMERA" | "DIGITAL_UPLOAD" | "TANPA_NOTA";
  onAddRow: (asNew: boolean) => void;
  onRemoveRow: (rowKey: string) => void;
  onSelectExistingProduct: (rowKey: string, prodId: string) => void;
  onUpdateRow: (rowKey: string, patch: Partial<PurchaseInputRow>) => void;
  onOpenCamera: () => void;
  onUploadFile: (file: File | null) => void;
  onRemoveReceipt: () => void;
}

export function PurchaseInputForm({
  supplierName,
  onSupplierNameChange,
  purchaseDate,
  onPurchaseDateChange,
  invoiceNumber,
  onInvoiceNumberChange,
  fundingSource,
  onFundingSourceChange,
  items,
  products,
  units,
  totalCalculated,
  hasReceipt,
  receiptImageData,
  captureMethod,
  onAddRow,
  onRemoveRow,
  onSelectExistingProduct,
  onUpdateRow,
  onOpenCamera,
  onUploadFile,
  onRemoveReceipt,
}: PurchaseInputFormProps) {
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
        <div>
          <h2 className="text-base font-extrabold text-[#202531]">1. Info Belanja</h2>
          <p className="text-xs text-[#525866]">
            Isi nama toko tempat membeli barang, tanggal nota, dan asal uang belanjanya.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="purch-supplier" className="block text-xs font-bold text-[#202531] mb-1">
              Nama Toko / Pemasok
            </label>
            <input
              id="purch-supplier"
              type="text"
              required
              value={supplierName}
              onChange={(e) => onSupplierNameChange(e.target.value)}
              placeholder="Contoh: Toko Sembako Maju"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm text-[#202531]"
            />
          </div>

          <div>
            <label htmlFor="purch-date" className="block text-xs font-bold text-[#202531] mb-1">
              Tanggal Belanja
            </label>
            <input
              id="purch-date"
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => onPurchaseDateChange(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm text-[#202531]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="purch-inv" className="block text-xs font-bold text-[#202531]">
                Nomor Nota (jika ada)
              </label>
              <button
                type="button"
                onClick={() =>
                  onInvoiceNumberChange(
                    `NOTA-${purchaseDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`
                  )
                }
                className="text-[11px] font-bold text-[#006B69] hover:underline cursor-pointer"
              >
                Buat Otomatis
              </button>
            </div>
            <input
              id="purch-inv"
              type="text"
              value={invoiceNumber}
              onChange={(e) => onInvoiceNumberChange(e.target.value)}
              placeholder="Contoh: INV-001 (boleh otomatis)"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm font-mono text-[#202531]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-[#202531]">Uang yang Dipakai</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <button
              type="button"
              onClick={() => onFundingSourceChange("DANA_TOKO")}
              className={`p-3.5 rounded-xl border text-left space-y-0.5 transition-colors cursor-pointer ${
                fundingSource === "DANA_TOKO"
                  ? "bg-[#E6FBFB] border-[#01DAD7] text-[#202531]"
                  : "bg-[#F8FAFC] border-[#202531]/15 text-[#202531]"
              }`}
            >
              <p className="text-xs font-extrabold">Uang Kas Toko</p>
              <p className="text-[11px] text-[#525866]">Belanja pakai uang toko atau kasir.</p>
            </button>

            <button
              type="button"
              onClick={() => onFundingSourceChange("BELANJA_PEMILIK")}
              className={`p-3.5 rounded-xl border text-left space-y-0.5 transition-colors cursor-pointer ${
                fundingSource === "BELANJA_PEMILIK"
                  ? "bg-[#E6FBFB] border-[#01DAD7] text-[#202531]"
                  : "bg-[#F8FAFC] border-[#202531]/15 text-[#202531]"
              }`}
            >
              <p className="text-xs font-extrabold">Uang Pemilik</p>
              <p className="text-[11px] text-[#525866]">
                Barang dibeli pemilik, pegawai mencatat barang masuk.
              </p>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-[#202531]">2. Barang yang Dibeli</h2>
            <p className="text-xs text-[#525866]">
              Masukkan nama barang, jumlah, dan harga beli per satuan sesuai struk.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {products.length > 0 && (
              <button
                type="button"
                onClick={() => onAddRow(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                <span>Pilih Barang Lama</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onAddRow(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              <span>Tambah Barang Baru</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((row, idx) => (
            <PurchaseItemRowCard
              key={row.rowKey}
              row={row}
              index={idx}
              canRemove={items.length > 1}
              products={products}
              units={units}
              onRemove={onRemoveRow}
              onSelectExistingProduct={onSelectExistingProduct}
              onUpdateRow={onUpdateRow}
            />
          ))}
        </div>

        <div className="p-4 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 flex items-center justify-between">
          <span className="text-xs font-extrabold text-[#202531]">Total Nilai Belanja</span>
          <span className="text-lg font-extrabold font-mono tabular-nums text-[#202531]">
            {formatRupiah(totalCalculated)}
          </span>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-[#202531]">3. Lampiran Nota (Opsional)</h2>
          <p className="text-xs text-[#525866]">
            Tambahkan foto nota fisik atau file nota digital jika tersedia. Anda tetap dapat mengirim pengajuan tanpa nota.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onOpenCamera}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
          >
            <Camera size={18} weight="bold" aria-hidden="true" />
            <span>Foto Nota Fisik</span>
          </button>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-[#202531] text-xs font-bold hover:bg-[#EBEBEB] cursor-pointer">
            <UploadSimple size={18} weight="bold" aria-hidden="true" />
            <span>Unggah Nota Digital</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                onUploadFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <p className="text-[11px] text-[#525866]">Format JPG, PNG, WEBP, atau PDF (maks. 2 MB).</p>

        {hasReceipt && (
          <ReceiptViewer
            receiptImageData={receiptImageData}
            sourceLabel={captureMethod === "LIVE_CAMERA" ? "Nota Fisik" : "Nota Digital"}
            altText={`Pratinjau lampiran nota ${invoiceNumber || "pembelian"}`}
            compact
            canReplace
            onOpenCamera={onOpenCamera}
            onUploadFile={onUploadFile}
            onRemove={onRemoveReceipt}
          />
        )}
      </section>
    </div>
  );
}

