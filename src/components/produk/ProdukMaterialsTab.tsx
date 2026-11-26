"use client";

import React from "react";
import { formatNumber, formatRupiah } from "@/lib/format";
import { CookingPot, Plus, Trash } from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProductItem, type ProposalCartItem } from "./types";
import { ProdukPaginationFooter } from "./ProdukPaginationFooter";

interface ProdukMaterialsTabProps {
  loading: boolean;
  filteredMaterials: ProductItem[];
  visibleMaterials: ProductItem[];
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  restockingId: string | null;
  proposalCart: ProposalCartItem[];
  onOpenAddMaterial: () => void;
  onQuickRestock: (mat: ProductItem) => void;
  onEditMaterial: (mat: ProductItem) => void;
  onDeleteMaterial: (mat: ProductItem) => void;
  onShowMore: () => void;
  onCollapse: () => void;
}

export function ProdukMaterialsTab({
  loading,
  filteredMaterials,
  visibleMaterials,
  isAdmin,
  canCreate,
  canEdit,
  restockingId,
  proposalCart,
  onOpenAddMaterial,
  onQuickRestock,
  onEditMaterial,
  onDeleteMaterial,
  onShowMore,
  onCollapse,
}: ProdukMaterialsTabProps) {
  return (
    <div role="tabpanel" aria-labelledby="produk-tab-materials" className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-600">Memuat daftar bahan baku...</div>
        ) : filteredMaterials.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <CookingPot
              size={36}
              weight="duotone"
              className="mx-auto text-[#202531]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-slate-900">
                Belum ada bahan baku yang dimasukkan.
              </p>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Contoh: tambah <strong>Susu Ultra Milk</strong> dengan isi <strong>1000 ml</strong> dan harga beli <strong>Rp 20.000</strong>. Nanti pemecahannya langsung diatur di bagian resep.
              </p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={onOpenAddMaterial}
                className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold cursor-pointer"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                <span>Tambah Bahan Baku Pertama</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-200">
              {visibleMaterials.map((mat) => {
                const uLabel = getUnitDisplayLabel(mat.sellUnit);
                const packSize = mat.conversionRatio > 0 ? mat.conversionRatio : 1;
                const packPrice = Math.round(mat.costPrice * packSize);
                const isLow = mat.currentStock <= mat.minStockAlert;
                const busy = restockingId === mat.id;

                return (
                  <div
                    key={mat.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">{mat.name}</p>
                      <p className="text-xs text-slate-600">
                        1 kemasan:{" "}
                        <strong className="font-mono text-slate-800">
                          {formatNumber(packSize)} {uLabel}
                        </strong>{" "}
                        • Harga asli:{" "}
                        <strong className="font-mono text-slate-800">
                          {formatRupiah(packPrice)}
                        </strong>{" "}
                        <span className="text-slate-500">
                          ({formatRupiah(mat.costPrice)}/{uLabel})
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-left sm:text-right min-w-[110px]">
                        <p
                          className={`text-sm font-extrabold font-mono tabular-nums ${
                            isLow ? "text-[#D41448]" : "text-[#202531]"
                          }`}
                        >
                          {formatNumber(mat.currentStock)} {uLabel}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {isLow ? "Stok mulai menipis" : "Sisa stok siap resep"}
                        </p>
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            aria-busy={busy}
                            onClick={() => onQuickRestock(mat)}
                            className="px-3 min-h-[44px] rounded-xl bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7] hover:bg-[#01DAD7]/30 disabled:opacity-50 text-xs font-bold cursor-pointer"
                          >
                            {busy ? "Menambah..." : "+1 Kemasan"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditMaterial(mat)}
                            className="px-3.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#202531] cursor-pointer"
                          >
                            {!isAdmin && proposalCart.some((c) => c.targetProductId === mat.id)
                              ? "Edit Antrean"
                              : "Ubah"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMaterial(mat)}
                            aria-label={`Hapus ${mat.name}`}
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
              shownCount={visibleMaterials.length}
              totalCount={filteredMaterials.length}
              nounLabel="bahan baku"
              onShowMore={onShowMore}
              onCollapse={onCollapse}
            />
          </>
        )}
      </div>
    </div>
  );
}

