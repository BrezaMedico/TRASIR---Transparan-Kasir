"use client";

import React from "react";
import { formatNumber, formatRupiah } from "@/lib/format";
import { Plus, Trash, Warning } from "@phosphor-icons/react";
import {
  getQuickDosagesForUnit,
  getUnitDisplayLabel,
  type ProductItem,
  type VariantRow,
} from "./types";

interface ProductDrawerIngredientListProps {
  variants: VariantRow[];
  currentVariant: VariantRow;
  sellPrice: number;
  allMaterialsPool: ProductItem[];
  activeStats: {
    totalCost: number;
    resolvedPortions: number;
    profitRp: number;
    marginPct: number;
    effectiveSell: number;
  };
  onUpdateQty: (ingIdx: number, nextQty: number) => void;
  onRemoveIngredient: (ingIdx: number) => void;
  onEnableMultiSize: () => void;
}

export function ProductDrawerIngredientList({
  variants,
  currentVariant,
  allMaterialsPool,
  activeStats,
  onUpdateQty,
  onRemoveIngredient,
  onEnableMultiSize,
}: ProductDrawerIngredientListProps) {
  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-slate-900">
            Takaran Bahan per 1 Porsi {variants.length > 1 ? `(${currentVariant.name})` : ""}
          </p>
          <span className="text-xs font-semibold text-slate-600">
            {currentVariant.ingredients.length} bahan dipilih
          </span>
        </div>

        {currentVariant.ingredients.length === 0 ? (
          <div className="p-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-600">
            Klik salah satu bahan baku di kotak hijau di atas (misalnya <strong>Susu Ultra Milk</strong>) untuk mulai mengatur takaran resep.
          </div>
        ) : (
          <div className="space-y-3">
            {currentVariant.ingredients.map((ing, ingIdx) => {
              const mat = allMaterialsPool.find((p) => p.id === ing.materialId);
              const uLabel = getUnitDisplayLabel(ing.unit);
              const qty = Number(ing.quantity) || 0;
              const ingCost = Math.round((mat?.costPrice || 0) * qty);
              const portionsFromMat = mat && qty > 0 ? Math.floor(mat.currentStock / qty) : 0;
              const packRef =
                mat && mat.conversionRatio > 1 ? mat.conversionRatio : mat?.currentStock || 0;
              const pctOfPack = packRef > 0 ? Math.min(100, Math.round((qty / packRef) * 100)) : 0;
              const quickDosages = getQuickDosagesForUnit(ing.unit);

              return (
                <div
                  key={ing.materialId}
                  className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">
                        {mat?.name || "Bahan Baku"}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Sisa stok:{" "}
                        <strong className="font-mono text-slate-900">
                          {formatNumber(mat?.currentStock || 0)} {uLabel}
                        </strong>{" "}
                        • Modal:{" "}
                        <strong className="font-mono text-slate-800">
                          {formatRupiah(mat?.costPrice || 0)}/{uLabel}
                        </strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveIngredient(ingIdx)}
                      className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-xs font-bold text-[#D41448] hover:bg-[#FFF0F4] cursor-pointer"
                    >
                      <Trash size={14} weight="bold" aria-hidden="true" />
                      <span>Hapus</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`ing-qty-${ing.materialId}`} className="text-xs font-bold text-slate-700">
                        Dipakai per 1 porsi:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`ing-qty-${ing.materialId}`}
                          type="number"
                          min={0.1}
                          step="any"
                          value={ing.quantity}
                          onChange={(e) => onUpdateQty(ingIdx, Number(e.target.value))}
                          className="w-24 px-3 h-10 rounded-xl border border-slate-300 text-sm font-mono font-extrabold text-slate-900 bg-slate-50 focus:bg-white"
                        />
                        <span className="text-xs font-extrabold text-slate-700">{uLabel}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1">
                        Takaran cepat:
                      </span>
                      {quickDosages.map((dose) => (
                        <button
                          key={dose}
                          type="button"
                          onClick={() => onUpdateQty(ingIdx, dose)}
                          className={`px-2.5 min-h-[32px] rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            qty === dose
                              ? "bg-[#202531] text-white border-[#202531]"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {dose} {uLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700">
                        Modal bahan ini:{" "}
                        <strong className="font-mono text-[#B45309]">{formatRupiah(ingCost)}</strong>
                      </span>
                      <span className={`font-bold ${portionsFromMat <= 0 ? "text-[#D41448]" : "text-[#202531]"}`}>
                        {portionsFromMat <= 0
                          ? "Stok belum cukup untuk 1 porsi"
                          : `Cukup untuk ${formatNumber(portionsFromMat)} porsi`}
                      </span>
                    </div>
                    {packRef > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#01DAD7] transition-all duration-150"
                            style={{ width: `${Math.max(4, pctOfPack)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Memakai {pctOfPack}% dari 1 kemasan ({formatNumber(packRef)} {uLabel}) per porsi
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {variants.length === 1 && (
        <div>
          <button
            type="button"
            onClick={onEnableMultiSize}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#202531] hover:underline py-1 cursor-pointer"
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            <span>Menu ini punya lebih dari 1 ukuran? (misal Regular &amp; Large)</span>
          </button>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <p className="text-xs font-extrabold text-slate-900">Ringkasan Otomatis per 1 Porsi</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-slate-600">Total Modal Bahan</p>
            <p className="text-base font-extrabold font-mono text-[#B45309] mt-0.5 tabular-nums">
              {formatRupiah(activeStats.totalCost)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-slate-600">Untung Kotor / Porsi</p>
            <p
              className={`text-base font-extrabold font-mono mt-0.5 tabular-nums ${
                activeStats.profitRp < 0 ? "text-[#D41448]" : "text-[#202531]"
              }`}
            >
              {formatRupiah(activeStats.profitRp)}
              {activeStats.effectiveSell > 0 ? ` (${activeStats.marginPct}%)` : ""}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white border border-slate-200">
            <p className="text-slate-600">Bisa Dibuat Sekarang</p>
            <p className="text-base font-extrabold font-mono text-[#202531] mt-0.5 tabular-nums">
              {formatNumber(activeStats.resolvedPortions)} porsi
            </p>
          </div>
        </div>

        {activeStats.effectiveSell > 0 && activeStats.profitRp < 0 && (
          <div className="p-3 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs font-semibold text-[#D41448] flex items-start gap-2">
            <Warning size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Harga jual ({formatRupiah(activeStats.effectiveSell)}) lebih rendah daripada total modal bahan ({formatRupiah(activeStats.totalCost)}).
            </span>
          </div>
        )}
      </div>
    </>
  );
}

