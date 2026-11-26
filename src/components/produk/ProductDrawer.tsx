"use client";

import React from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { ClipboardText, FloppyDisk, Info, Trash } from "@phosphor-icons/react";
import type { CategoryOption, ProductItem, ProposalCartItem, UnitOption } from "./types";
import { useProductDrawerForm } from "./useProductDrawerForm";
import { ProductDrawerKindSelector } from "./ProductDrawerKindSelector";
import { ProductDrawerReadySection } from "./ProductDrawerReadySection";
import { ProductDrawerRecipeVariants } from "./ProductDrawerRecipeVariants";
import { ProductDrawerIngredientList } from "./ProductDrawerIngredientList";
import { ProductDrawerAdvancedSection } from "./ProductDrawerAdvancedSection";

interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: ProductItem | null;
  products: ProductItem[];
  queuedMaterials?: ProductItem[];
  categories: CategoryOption[];
  units: UnitOption[];
  isAdmin: boolean;
  canSave: boolean;
  onSaved: (mode: "DIRECT" | "REQUEST", productName: string) => Promise<void> | void;
  onSwitchToAddMaterial: () => void;
  onRequestDelete?: (product: ProductItem) => void;
  onAddToCart?: (item: ProposalCartItem) => void;
}

export function ProductDrawer({
  isOpen,
  onClose,
  editingProduct,
  products,
  queuedMaterials = [],
  categories,
  units,
  isAdmin,
  canSave,
  onSaved,
  onSwitchToAddMaterial,
  onRequestDelete,
  onAddToCart,
}: ProductDrawerProps) {
  const form = useProductDrawerForm({
    isOpen,
    onClose,
    editingProduct,
    products,
    queuedMaterials,
    categories,
    isAdmin,
    onSaved,
    onAddToCart,
  });

  return (
    <SlideDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingProduct
          ? `Ubah Menu: ${editingProduct.name}`
          : isAdmin
          ? "Tambah Menu / Produk Jual"
          : "Ajukan Menu / Produk Baru"
      }
      subtitle="Pilih produk langsung jual atau menu racikan yang memecah stok bahan baku secara otomatis."
      widthClass="max-w-2xl"
    >
      <form onSubmit={form.handleSubmit} className="space-y-5">
        {!isAdmin && (
          <div className="p-3.5 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs text-[#202531] flex items-start gap-2.5">
            <Info size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              {editingProduct
                ? onAddToCart
                  ? "Perubahan harga atau data produk akan masuk ke Daftar Pengajuan agar Anda bisa mengedit item lain lalu mengirimnya sekaligus ke Manajer/Pemilik."
                  : "Usulan perubahan produk akan berstatus Menunggu Persetujuan Pemilik atau Manajer."
                : onAddToCart
                ? "Menu/produk akan dimasukkan ke Daftar Pengajuan agar bisa dikirim bersamaan dengan bahan baku dan nota."
                : "Produk yang Anda kirim akan berstatus Menunggu Persetujuan dan aktif di Kasir setelah disetujui Pemilik atau Manajer."}
            </p>
          </div>
        )}

        <ProductDrawerKindSelector
          productKind={form.productKind}
          onChange={form.setProductKind}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label htmlFor="prod-drawer-name" className="block text-sm font-bold text-slate-900">
              {form.productKind === "RECIPE" ? "Nama Menu" : "Nama Produk"}
            </label>
            <input
              id="prod-drawer-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              placeholder={
                form.productKind === "RECIPE"
                  ? "Contoh: Es Kopi Susu, Teh Manis"
                  : "Contoh: Air Mineral 600ml, Roti Cokelat"
              }
              className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:border-[#202531]"
            />
          </div>

          {!(form.productKind === "RECIPE" && form.variants.length > 1) && (
            <div className="space-y-1.5">
              <label htmlFor="prod-drawer-sellprice" className="block text-sm font-bold text-slate-900">
                Harga Jual di Kasir
              </label>
              <div className="relative">
                <span
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id="prod-drawer-sellprice"
                  type="number"
                  min={0}
                  required
                  value={form.sellPrice}
                  onChange={(e) => {
                    const nextVal = Math.max(0, Number(e.target.value) || 0);
                    form.setSellPrice(nextVal);
                    if (form.productKind === "RECIPE" && form.variants.length === 1) {
                      form.setVariants((prev) =>
                        prev.map((v, i) => (i === 0 ? { ...v, sellPrice: nextVal } : v))
                      );
                    }
                  }}
                  placeholder="15000"
                  className="w-full pl-11 pr-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white focus:border-[#202531]"
                />
              </div>
            </div>
          )}
        </div>

        {form.productKind === "READY" ? (
          <ProductDrawerReadySection
            isEditing={Boolean(editingProduct)}
            costPrice={form.costPrice}
            sellPrice={form.sellPrice}
            sellUnit={form.sellUnit}
            useOtherUnit={form.useOtherUnit}
            currentStock={form.currentStock}
            readyProfit={form.readyProfit}
            units={units}
            onCostPriceChange={form.setCostPrice}
            onSellUnitChange={form.setSellUnit}
            onToggleOtherUnit={form.setUseOtherUnit}
            onCurrentStockChange={form.setCurrentStock}
          />
        ) : (
          <div className="space-y-4">
            <ProductDrawerRecipeVariants
              variants={form.variants}
              safeVariantIdx={form.safeVariantIdx}
              currentVariant={form.currentVariant}
              sellPrice={form.sellPrice}
              availableMaterials={form.availableMaterials}
              queuedMaterialIdSet={form.queuedMaterialIdSet}
              onSetVariants={form.setVariants}
              onSetActiveVariantIdx={form.setActiveVariantIdx}
              onSetSellPrice={form.setSellPrice}
              onToggleMaterial={form.toggleMaterialInVariant}
              onSwitchToAddMaterial={onSwitchToAddMaterial}
            />
            <ProductDrawerIngredientList
              variants={form.variants}
              currentVariant={form.currentVariant}
              sellPrice={form.sellPrice}
              allMaterialsPool={form.allMaterialsPool}
              activeStats={form.activeStats}
              onUpdateQty={form.updateIngredientQty}
              onRemoveIngredient={form.removeIngredient}
              onEnableMultiSize={() => {
                form.setVariants((prev) => [
                  { ...prev[0], name: "Regular", sellPrice: form.sellPrice || prev[0].sellPrice },
                  {
                    name: "Large",
                    sellPrice: Math.max(0, (form.sellPrice || prev[0].sellPrice || 10000) + 3000),
                    costPrice: 0,
                    ingredients: prev[0].ingredients.map((ig) => ({ ...ig })),
                  },
                ]);
                form.setActiveVariantIdx(1);
              }}
            />
          </div>
        )}

        <ProductDrawerAdvancedSection
          showAdvanced={form.showAdvanced}
          onToggleAdvanced={() => form.setShowAdvanced((prev) => !prev)}
          productKind={form.productKind}
          useBulkSplit={form.useBulkSplit}
          onUseBulkSplitChange={form.setUseBulkSplit}
          purchaseUnit={form.purchaseUnit}
          onPurchaseUnitChange={form.setPurchaseUnit}
          sellUnit={form.sellUnit}
          conversionRatio={form.conversionRatio}
          onConversionRatioChange={form.setConversionRatio}
          sku={form.sku}
          onSkuChange={form.setSku}
          barcode={form.barcode}
          onBarcodeChange={form.setBarcode}
          categoryId={form.categoryId}
          onCategoryIdChange={form.setCategoryId}
          minStockAlert={form.minStockAlert}
          onMinStockAlertChange={form.setMinStockAlert}
          categories={categories}
          units={units}
        />

        {canSave && (
          <div className="space-y-2.5">
            <button
              type="submit"
              disabled={form.submitting}
              aria-busy={form.submitting}
              className="w-full flex items-center justify-center gap-2 px-5 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              {!isAdmin && onAddToCart ? (
                <ClipboardText size={18} weight="bold" aria-hidden="true" />
              ) : (
                <FloppyDisk size={18} weight="bold" aria-hidden="true" />
              )}
              <span>
                {form.submitting
                  ? "Menyimpan Menu..."
                  : editingProduct
                  ? !isAdmin && onAddToCart
                    ? "Masukkan Perubahan ke Daftar Pengajuan"
                    : "Simpan Perubahan"
                  : isAdmin
                  ? "Simpan & Aktifkan di Kasir"
                  : onAddToCart
                  ? "Masukkan ke Daftar Pengajuan"
                  : "Kirim Pengajuan Menu"}
              </span>
            </button>

            {editingProduct && onRequestDelete && (
              <button
                type="button"
                disabled={form.submitting}
                onClick={() => {
                  const target = editingProduct;
                  onClose();
                  onRequestDelete(target);
                }}
                className="w-full flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] text-[#D41448] text-sm font-bold hover:bg-[#FFE0E8] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Trash size={17} weight="bold" aria-hidden="true" />
                <span>
                  {editingProduct.stockMethod === "RESEP" ? "Hapus Produk & Resep" : "Hapus Produk"}
                </span>
              </button>
            )}
          </div>
        )}
      </form>
    </SlideDrawer>
  );
}
