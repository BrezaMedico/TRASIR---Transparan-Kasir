"use client";

import React from "react";
import { formatNumber, formatRupiah } from "@/lib/format";
import { CookingPot, Package, Plus, Trash } from "@phosphor-icons/react";
import {
  computeProductMaxPortions,
  getUnitDisplayLabel,
  type ProductItem,
  type ProposalCartItem,
} from "./types";
import { ProdukPaginationFooter } from "./ProdukPaginationFooter";

interface ProdukCatalogTabProps {
  loading: boolean;
  allProducts: ProductItem[];
  filteredSellable: ProductItem[];
  visibleSellable: ProductItem[];
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  proposalCart: ProposalCartItem[];
  onOpenAddMaterial: () => void;
  onOpenAddProduct: () => void;
  onEditProduct: (prod: ProductItem) => void;
  onDeleteProduct: (prod: ProductItem) => void;
  onShowMore: () => void;
  onCollapse: () => void;
}

export function ProdukCatalogTab({
  loading,
  allProducts,
  filteredSellable,
  visibleSellable,
  isAdmin,
  canCreate,
  canEdit,
  proposalCart,
  onOpenAddMaterial,
  onOpenAddProduct,
  onEditProduct,
  onDeleteProduct,
  onShowMore,
  onCollapse,
}: ProdukCatalogTabProps) {
  return (
    <div
      role="tabpanel"
      aria-labelledby="produk-tab-catalog"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
    >
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-600">
          Memuat daftar menu dan produk...
        </div>
      ) : filteredSellable.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <Package size={36} weight="duotone" className="mx-auto text-slate-400" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-extrabold text-slate-900">
              Belum ada menu atau produk jual.
            </p>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              Jika Anda menjual minuman atau makanan racikan, masukkan bahan bakunya dulu di tab Bahan Baku, lalu buat menunya di sini.
            </p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={onOpenAddMaterial}
                className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7] text-xs font-bold cursor-pointer"
              >
                <CookingPot size={16} weight="bold" aria-hidden="true" />
                <span>1. Input Bahan Baku</span>
              </button>
              <button
                type="button"
                onClick={onOpenAddProduct}
                className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold cursor-pointer"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                <span>2. Tambah Menu Jual</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-200">
            {visibleSellable.map((prod) => {
              const isRecipe = prod.stockMethod === "RESEP";
              const maxPortions = computeProductMaxPortions(prod, allProducts);
              const displaySellPrice =
                isRecipe && prod.variants.length > 0 ? prod.variants[0].sellPrice : prod.sellPrice;
              const displayCostPrice =
                isRecipe && prod.variants.length > 0 && prod.variants[0].costPrice > 0
                  ? prod.variants[0].costPrice
                  : prod.costPrice;
              const isLow = isRecipe ? maxPortions <= 0 : prod.currentStock <= prod.minStockAlert;

              return (
                <div
                  key={prod.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-extrabold text-slate-900">{prod.name}</p>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          isRecipe
                            ? "bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {isRecipe ? "Menu Resep" : "Langsung Jual"}
                      </span>
                    </div>

                    {isRecipe && prod.variants[0]?.ingredients.length ? (
                      <p className="text-xs text-slate-600">
                        Bahan:{" "}
                        {prod.variants[0].ingredients
                          .map(
                            (ing) =>
                              `${ing.material.name} (${formatNumber(ing.quantity)} ${getUnitDisplayLabel(ing.unit)})`
                          )
                          .join(", ")}
                        {prod.variants.length > 1 ? ` • ${prod.variants.length} ukuran` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600">
                        Satuan: {getUnitDisplayLabel(prod.sellUnit)} • SKU: {prod.sku}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-extrabold font-mono text-[#202531] tabular-nums">
                        {formatRupiah(displaySellPrice)}
                      </p>
                      <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                        Modal: {formatRupiah(displayCostPrice)}
                      </p>
                    </div>

                    <div className="text-left sm:text-right min-w-[116px]">
                      <p
                        className={`text-xs font-extrabold font-mono tabular-nums ${
                          isLow ? "text-[#D41448]" : "text-[#202531]"
                        }`}
                      >
                        {isRecipe
                          ? `Siap: ${formatNumber(maxPortions)} porsi`
                          : `${formatNumber(prod.currentStock)} ${getUnitDisplayLabel(prod.sellUnit)}`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isRecipe ? "Dari stok bahan" : "Stok tersedia"}
                      </p>
                    </div>

                    {canEdit && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEditProduct(prod)}
                          className="px-3.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#202531] cursor-pointer"
                        >
                          {!isAdmin && proposalCart.some((c) => c.targetProductId === prod.id)
                            ? "Edit Antrean"
                            : "Ubah"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProduct(prod)}
                          aria-label={`Hapus ${prod.name}`}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] text-xs font-bold cursor-pointer transition-colors"
                        >
                          <Trash size={14} weight="bold" aria-hidden="true" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ProdukPaginationFooter
            shownCount={visibleSellable.length}
            totalCount={filteredSellable.length}
            nounLabel="menu & produk"
            onShowMore={onShowMore}
            onCollapse={onCollapse}
          />
        </>
      )}
    </div>
  );
}

