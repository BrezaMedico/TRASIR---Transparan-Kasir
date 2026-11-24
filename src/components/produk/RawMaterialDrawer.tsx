"use client";

import React, { useEffect, useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { useToast } from "@/components/layout/AppShell";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  FloppyDisk,
  Info,
  Minus,
  Plus,
  CaretDown,
  CaretUp,
  Trash,
} from "@phosphor-icons/react";
import {
  getUnitDisplayLabel,
  type CategoryOption,
  type ProductItem,
  type UnitOption,
} from "./types";

interface RawMaterialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: ProductItem | null;
  categories: CategoryOption[];
  units: UnitOption[];
  isAdmin: boolean;
  canSave: boolean;
  onSaved: (mode: "DIRECT" | "REQUEST", productName: string) => Promise<void> | void;
  onRequestDelete?: (product: ProductItem) => void;
}

const COMMON_MATERIAL_UNITS = [
  { value: "ml", label: "ml (cair)" },
  { value: "g", label: "gram (bubuk/padat)" },
  { value: "pcs", label: "pcs (buah/gelas)" },
];

const MATERIAL_PRESETS = [
  {
    label: "Susu Ultra Milk 1000 ml",
    name: "Susu Ultra Milk",
    packSize: 1000,
    unit: "ml",
    packPrice: 20000,
    packCount: 1,
  },
  {
    label: "Gula Pasir 1000 gram",
    name: "Gula Pasir",
    packSize: 1000,
    unit: "g",
    packPrice: 18000,
    packCount: 1,
  },
  {
    label: "Teh Bubuk 250 gram",
    name: "Teh Bubuk",
    packSize: 250,
    unit: "g",
    packPrice: 15000,
    packCount: 1,
  },
  {
    label: "Cup Gelas 50 pcs",
    name: "Cup Gelas 16oz",
    packSize: 50,
    unit: "pcs",
    packPrice: 15000,
    packCount: 1,
  },
];

export function RawMaterialDrawer({
  isOpen,
  onClose,
  editingProduct,
  categories,
  units,
  isAdmin,
  canSave,
  onSaved,
  onRequestDelete,
}: RawMaterialDrawerProps) {
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [packSize, setPackSize] = useState<number>(1000);
  const [unit, setUnit] = useState<string>("ml");
  const [useOtherUnit, setUseOtherUnit] = useState(false);
  const [packPrice, setPackPrice] = useState<number>(0);
  const [packCount, setPackCount] = useState<number>(1);
  const [directTotalStock, setDirectTotalStock] = useState<number>(1000);

  // Pengaturan tambahan (terlipat agar ramah pemula)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minStockAlert, setMinStockAlert] = useState<number>(200);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const defaultClosedCat =
      categories.find((c) => c.areaType === "TERTUTUP") || categories[0];

    if (editingProduct) {
      const ratio = editingProduct.conversionRatio > 0 ? editingProduct.conversionRatio : 1;
      const reconstructedPackPrice = Math.round(editingProduct.costPrice * ratio);
      const isCommon = COMMON_MATERIAL_UNITS.some((u) => u.value === editingProduct.sellUnit);

      setName(editingProduct.name);
      setPackSize(ratio);
      setUnit(editingProduct.sellUnit);
      setUseOtherUnit(!isCommon);
      setPackPrice(reconstructedPackPrice);
      setPackCount(Math.max(0, Number((editingProduct.currentStock / ratio).toFixed(2))));
      setDirectTotalStock(editingProduct.currentStock);
      setSku(editingProduct.sku);
      setCategoryId(editingProduct.categoryId);
      setMinStockAlert(editingProduct.minStockAlert);
      setShowAdvanced(false);
    } else {
      setName("");
      setPackSize(1000);
      setUnit("ml");
      setUseOtherUnit(false);
      setPackPrice(0);
      setPackCount(1);
      setDirectTotalStock(1000);
      setSku(`BHN-${Math.floor(1000 + Math.random() * 9000)}`);
      setCategoryId(defaultClosedCat?.id || "");
      setMinStockAlert(200);
      setShowAdvanced(false);
    }
  }, [isOpen, editingProduct, categories]);

  const safePackSize = Math.max(1, Number(packSize) || 1);
  const safePackPrice = Math.max(0, Number(packPrice) || 0);
  const computedTotalStock = editingProduct
    ? Math.max(0, Number(directTotalStock) || 0)
    : Number((Math.max(0, Number(packCount) || 0) * safePackSize).toFixed(2));
  const rawCostPerUnit = safePackPrice / safePackSize;
  const savedCostPerUnit =
    safePackPrice > 0 ? Math.max(1, Math.round(rawCostPerUnit)) : 0;
  const unitLabel = getUnitDisplayLabel(unit);

  const applyPreset = (preset: (typeof MATERIAL_PRESETS)[number]) => {
    setName(preset.name);
    setPackSize(preset.packSize);
    setUnit(preset.unit);
    setUseOtherUnit(false);
    setPackPrice(preset.packPrice);
    setPackCount(preset.packCount);
    setDirectTotalStock(preset.packSize * preset.packCount);
    setMinStockAlert(Math.max(1, Math.round(preset.packSize * 0.2)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Nama bahan baku wajib diisi.", "error");
      return;
    }
    if (safePackSize <= 0) {
      showToast("Isi per kemasan harus lebih dari 0.", "error");
      return;
    }
    const resolvedCategoryId =
      categoryId ||
      categories.find((c) => c.areaType === "TERTUTUP")?.id ||
      categories[0]?.id ||
      "";
    if (!resolvedCategoryId) {
      showToast("Kategori ruangan belum tersedia. Muat ulang halaman lalu coba lagi.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        id: editingProduct?.id || undefined,
        sku: sku.trim() || `BHN-${Math.floor(1000 + Math.random() * 9000)}`,
        barcode: editingProduct?.barcode || null,
        name: trimmedName,
        categoryId: resolvedCategoryId,
        stockMethod: safePackSize > 1 ? "PECAH" : "TETAP",
        isRawMaterial: true,
        purchaseUnit: "kemasan",
        sellUnit: unit,
        conversionRatio: safePackSize,
        costPrice: savedCostPerUnit,
        sellPrice: 0,
        currentStock: computedTotalStock,
        minStockAlert: Math.max(0, Number(minStockAlert) || Math.round(safePackSize * 0.2)),
      };

      const res = await fetch("/api/products", {
        method: editingProduct ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan bahan baku.", "error");
        return;
      }

      if (data.mode === "REQUEST") {
        showToast(
          data.message || "Usulan bahan baku dikirim dan menunggu persetujuan Pemilik atau Manajer.",
          "info"
        );
        await onSaved("REQUEST", trimmedName);
      } else {
        showToast(
          editingProduct
            ? `Bahan baku "${data.product.name}" berhasil diperbarui.`
            : `Bahan baku "${data.product.name}" (${formatNumber(computedTotalStock)} ${unitLabel}) siap dipakai di resep.`,
          "success"
        );
        await onSaved("DIRECT", data.product.name);
      }
      onClose();
    } catch {
      showToast("Gagal menghubungi server. Coba beberapa saat lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={editingProduct ? `Ubah Bahan Baku: ${editingProduct.name}` : "Tambah Bahan Baku"}
      subtitle="Cukup isi ukuran kemasan dan harga aslinya. Pemecahan takaran dilakukan nanti saat membuat resep."
      widthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {!editingProduct && !isAdmin && (
          <div className="p-3.5 rounded-xl bg-[#EBEBEB] text-[#202531] border border-[#202531]/15 flex items-start gap-2.5">
            <Info size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Bahan baku yang Anda masukkan akan masuk antrean{" "}
              <strong>Menunggu Persetujuan</strong> sebelum aktif dipakai di resep.
            </p>
          </div>
        )}

        {/* Contoh Cepat 1-Klik untuk Pemula */}
        {!editingProduct && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700">
              Baru mulai? Klik contoh untuk mengisi cepat:
            </p>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-100 hover:bg-[#01DAD7]/20 hover:text-[#202531] border border-[#202531]/15 hover:border-[#01DAD7] text-xs font-semibold text-slate-800 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202531]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 1. Nama Bahan Baku */}
        <div className="space-y-1.5">
          <label htmlFor="mat-name" className="block text-sm font-bold text-slate-900">
            1. Nama Bahan Baku
          </label>
          <input
            id="mat-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Susu Ultra Milk, Gula Pasir, Teh Bubuk"
            className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:border-[#202531] focus:ring-2 focus:ring-[#202531]/15"
          />
        </div>

        {/* 2. Isi per Kemasan & Satuan */}
        <div className="space-y-2">
          <label htmlFor="mat-pack-size" className="block text-sm font-bold text-slate-900">
            2. Isi 1 Kemasan Berapa?
          </label>
          <p className="text-xs text-slate-600">
            Lihat ukuran di kemasan aslinya. Misalnya 1 kotak Susu Ultra Milk isinya{" "}
            <strong>1000 ml</strong>, atau 1 bungkus gula isinya <strong>1000 gram</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-5">
              <input
                id="mat-pack-size"
                type="number"
                min={1}
                step="any"
                required
                value={packSize}
                onChange={(e) => {
                  const nextSize = Math.max(1, Number(e.target.value) || 1);
                  setPackSize(nextSize);
                  if (!editingProduct) {
                    setDirectTotalStock(nextSize * packCount);
                    setMinStockAlert(Math.max(1, Math.round(nextSize * 0.2)));
                  }
                }}
                aria-label="Jumlah isi per kemasan"
                className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white focus:border-[#202531]"
              />
            </div>

            <div className="sm:col-span-7 flex flex-wrap gap-1.5">
              {COMMON_MATERIAL_UNITS.map((opt) => {
                const active = !useOtherUnit && unit === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setUseOtherUnit(false);
                      setUnit(opt.value);
                    }}
                    className={`flex-1 min-w-[76px] px-3 min-h-[44px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202531] ${
                      active
                        ? "bg-[#202531] text-white border-[#202531]"
                        : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {opt.value === "g" ? "gram" : opt.value}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUseOtherUnit((prev) => !prev)}
                className={`px-3 min-h-[44px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer ${
                  useOtherUnit
                    ? "bg-[#202531] text-white border-[#202531]"
                    : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                Lainnya
              </button>
            </div>
          </div>

          {useOtherUnit && (
            <div className="pt-1">
              <label htmlFor="mat-other-unit" className="block text-xs font-bold text-slate-700 mb-1">
                Pilih satuan lain
              </label>
              <select
                id="mat-other-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white cursor-pointer"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.label || u.name} ({u.group})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 3. Harga Asli Beli 1 Kemasan */}
        <div className="space-y-1.5">
          <label htmlFor="mat-pack-price" className="block text-sm font-bold text-slate-900">
            3. Harga Beli Asli (untuk 1 Kemasan {formatNumber(safePackSize)} {unitLabel})
          </label>
          <div className="relative">
            <span
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 select-none"
              aria-hidden="true"
            >
              Rp
            </span>
            <input
              id="mat-pack-price"
              type="number"
              min={0}
              required
              value={packPrice}
              onChange={(e) => setPackPrice(Math.max(0, Number(e.target.value) || 0))}
              placeholder="20000"
              className="w-full pl-11 pr-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white focus:border-[#202531]"
            />
          </div>
          <p className="text-xs text-slate-600">
            Masukkan harga asli 1 kotak/bungkus sesuai struk belanja Anda.
          </p>
        </div>

        {/* 4. Stok yang Dimasukkan / Sisa Stok */}
        {!editingProduct ? (
          <div className="space-y-2">
            <label htmlFor="mat-pack-count" className="block text-sm font-bold text-slate-900">
              4. Berapa Kemasan yang Ada di Stok Sekarang?
            </label>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Kurangi jumlah kemasan"
                onClick={() => setPackCount((prev) => Math.max(0, Number((prev - 1).toFixed(2))))}
                className="w-11 h-11 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-200 text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <Minus size={18} weight="bold" aria-hidden="true" />
              </button>
              <input
                id="mat-pack-count"
                type="number"
                min={0}
                step="any"
                value={packCount}
                onChange={(e) => setPackCount(Math.max(0, Number(e.target.value) || 0))}
                className="w-28 text-center h-11 rounded-xl border border-slate-300 text-base font-mono font-extrabold text-slate-900 bg-white"
              />
              <button
                type="button"
                aria-label="Tambah jumlah kemasan"
                onClick={() => setPackCount((prev) => Number((prev + 1).toFixed(2)))}
                className="w-11 h-11 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-200 text-slate-800 flex items-center justify-center cursor-pointer"
              >
                <Plus size={18} weight="bold" aria-hidden="true" />
              </button>
              <span className="text-xs font-bold text-slate-700">
                kemasan ({formatNumber(computedTotalStock)} {unitLabel})
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="mat-edit-stock" className="block text-sm font-bold text-slate-900">
              4. Sisa Stok Saat Ini ({unitLabel})
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="mat-edit-stock"
                type="number"
                min={0}
                step="any"
                value={directTotalStock}
                onChange={(e) => setDirectTotalStock(Math.max(0, Number(e.target.value) || 0))}
                className="flex-1 min-w-[140px] px-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-extrabold text-slate-900 bg-white"
              />
              <button
                type="button"
                onClick={() => setDirectTotalStock((prev) => Number((prev + safePackSize).toFixed(2)))}
                className="px-3.5 min-h-[44px] rounded-xl bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7] hover:bg-[#01DAD7]/35 text-xs font-bold cursor-pointer"
              >
                +1 Kemasan (+{formatNumber(safePackSize)} {unitLabel})
              </button>
            </div>
          </div>
        )}

        {/* Ringkasan Otomatis Ramah Pemula */}
        <div className="p-4 rounded-2xl bg-[#EBEBEB]/60 border border-[#202531]/15 space-y-2.5">
          <p className="text-xs font-extrabold text-[#202531]">
            Ringkasan Otomatis (Siap Dipecah di Resep)
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-[#202531]/15">
              <p className="text-slate-600">Total Stok Bahan</p>
              <p className="text-base font-extrabold font-mono text-slate-900 mt-0.5 tabular-nums">
                {formatNumber(computedTotalStock)} {unitLabel}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#202531]/15">
              <p className="text-slate-600">Modal per 1 {unitLabel}</p>
              <p className="text-base font-extrabold font-mono text-[#202531] mt-0.5 tabular-nums">
                {formatRupiah(savedCostPerUnit)} / {unitLabel}
              </p>
            </div>
          </div>
          <p className="text-xs text-[#202531]">
            Nanti saat membuat menu seperti <strong>Kopi Susu</strong> atau <strong>Teh Manis</strong>, Anda cukup pilih bahan ini lalu masukkan berapa {unitLabel} yang dipakai per gelas.
          </p>
        </div>

        {/* Pengaturan Tambahan (Progressive Disclosure) */}
        <div className="border-t border-slate-200 pt-3">
          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 cursor-pointer"
          >
            {showAdvanced ? (
              <CaretUp size={15} weight="bold" aria-hidden="true" />
            ) : (
              <CaretDown size={15} weight="bold" aria-hidden="true" />
            )}
            <span>Pengaturan Tambahan (Kode SKU, Kategori, Batas Stok Menipis)</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mat-sku" className="block text-xs font-bold text-slate-700 mb-1">
                    Kode SKU (Otomatis)
                  </label>
                  <input
                    id="mat-sku"
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="mat-min-alert" className="block text-xs font-bold text-slate-700 mb-1">
                    Ingatkan jika sisa stok di bawah ({unitLabel})
                  </label>
                  <input
                    id="mat-min-alert"
                    type="number"
                    min={0}
                    step="any"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="mat-cat" className="block text-xs font-bold text-slate-700 mb-1">
                  Kategori Penyimpanan
                </label>
                <select
                  id="mat-cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.areaType})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {canSave && (
          <div className="space-y-2.5">
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="w-full flex items-center justify-center gap-2 px-5 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150 cursor-pointer"
            >
              <FloppyDisk size={18} weight="bold" aria-hidden="true" />
              <span>
                {submitting
                  ? "Menyimpan Bahan Baku..."
                  : editingProduct
                  ? "Simpan Perubahan Bahan Baku"
                  : isAdmin
                  ? "Simpan Bahan Baku"
                  : "Kirim Usulan Bahan Baku"}
              </span>
            </button>

            {editingProduct && onRequestDelete && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  const target = editingProduct;
                  onClose();
                  onRequestDelete(target);
                }}
                className="w-full flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] text-[#D41448] text-sm font-bold hover:bg-[#FFE0E8] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Trash size={17} weight="bold" aria-hidden="true" />
                <span>Hapus Bahan Baku</span>
              </button>
            )}
          </div>
        )}
      </form>
    </SlideDrawer>
  );
}

