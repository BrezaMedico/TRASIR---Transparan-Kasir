"use client";

import React from "react";
import { formatNumber, formatRupiah } from "@/lib/format";
import { CheckCircle, Plus } from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProductItem, type VariantRow } from "./types";

interface ProductDrawerRecipeVariantsProps {
  variants: VariantRow[];
  safeVariantIdx: number;
  currentVariant: VariantRow;
  sellPrice: number;
  availableMaterials: ProductItem[];
  queuedMaterialIdSet: Set<string>;
  onSetVariants: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  onSetActiveVariantIdx: (idx: number) => void;
  onSetSellPrice: (val: number) => void;
  onToggleMaterial: (mat: ProductItem) => void;
  onSwitchToAddMaterial: () => void;
}

export function ProductDrawerRecipeVariants({
  variants,
  safeVariantIdx,
  currentVariant,
  sellPrice,
  availableMaterials,
  queuedMaterialIdSet,
  onSetVariants,
  onSetActiveVariantIdx,
  onSetSellPrice,
  onToggleMaterial,
  onSwitchToAddMaterial,
}: ProductDrawerRecipeVariantsProps) {
  return (
    <>
      {variants.length > 1 && (
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-slate-800">
              Pilih Ukuran yang Sedang Diatur Resepnya:
            </p>
            <button
              type="button"
              onClick={() => {
                const nextIdx = variants.length;
                onSetVariants((prev) => [
                  ...prev,
                  {
                    name: nextIdx === 1 ? "Large" : `Ukuran ${nextIdx + 1}`,
                    sellPrice: Math.max(0, (sellPrice || 10000) + 3000),
                    costPrice: 0,
                    ingredients: prev[0]?.ingredients.map((ig) => ({ ...ig })) || [],
                  },
                ]);
                onSetActiveVariantIdx(nextIdx);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#01DAD7] text-[#202531] text-xs font-bold cursor-pointer"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              <span>Ukuran Baru</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {variants.map((v, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSetActiveVariantIdx(idx)}
                className={`px-3.5 min-h-[40px] rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  safeVariantIdx === idx
                    ? "bg-[#202531] text-white border-[#202531]"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {v.name || `Ukuran ${idx + 1}`} ({formatRupiah(v.sellPrice)})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="variant-name-input" className="block text-xs font-bold text-slate-700 mb-1">
                Nama Ukuran
              </label>
              <input
                id="variant-name-input"
                type="text"
                value={currentVariant.name}
                onChange={(e) =>
                  onSetVariants((prev) =>
                    prev.map((row, i) =>
                      i === safeVariantIdx ? { ...row, name: e.target.value } : row
                    )
                  )
                }
                placeholder="Regular / Large"
                className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="variant-price-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Harga Jual Ukuran Ini (Rp)
                </label>
                <input
                  id="variant-price-input"
                  type="number"
                  min={0}
                  value={currentVariant.sellPrice}
                  onChange={(e) => {
                    const nextVal = Math.max(0, Number(e.target.value) || 0);
                    if (safeVariantIdx === 0) onSetSellPrice(nextVal);
                    onSetVariants((prev) =>
                      prev.map((row, i) =>
                        i === safeVariantIdx ? { ...row, sellPrice: nextVal } : row
                      )
                    );
                  }}
                  className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  onSetVariants((prev) => {
                    const next = prev.filter((_, i) => i !== safeVariantIdx);
                    if (next.length === 1) onSetSellPrice(next[0].sellPrice);
                    return next;
                  });
                  onSetActiveVariantIdx(0);
                }}
                className="px-3 h-10 rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] text-[#D41448] text-xs font-bold cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#EBEBEB]/60 border border-[#202531]/15 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-extrabold text-[#202531]">
              Pilih Bahan Baku untuk Resep Ini
            </p>
            <p className="text-xs text-[#202531]">
              Klik bahan di bawah untuk memasukkan ke resep, lalu tentukan takaran per gelas/porsi.
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitchToAddMaterial}
            className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#01DAD7]/20 cursor-pointer"
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            <span>Bahan Baku Baru</span>
          </button>
        </div>

        {availableMaterials.length === 0 ? (
          <div className="p-4 rounded-xl bg-white border border-[#FDE68A] text-xs text-[#92400E] space-y-2.5">
            <p className="font-bold">Belum ada bahan baku di stok Anda.</p>
            <p>
              Masukkan bahan baku terlebih dahulu (misalnya <strong>Susu Ultra Milk 1000 ml</strong> atau <strong>Gula Pasir 1000 gram</strong>), nanti bahan tersebut otomatis muncul di sini untuk dipecah ke resep.
            </p>
            <button
              type="button"
              onClick={onSwitchToAddMaterial}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold cursor-pointer"
            >
              <Plus size={16} weight="bold" aria-hidden="true" />
              <span>Masukkan Bahan Baku Pertama</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableMaterials.map((mat) => {
              const selected = currentVariant.ingredients.some((ig) => ig.materialId === mat.id);
              const uLabel = getUnitDisplayLabel(mat.sellUnit);
              return (
                <button
                  key={mat.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onToggleMaterial(mat)}
                  className={`inline-flex items-center gap-2 px-3 py-2 min-h-[42px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202531] ${
                    selected
                      ? "bg-[#202531] text-white border-[#202531]"
                      : "bg-white text-slate-900 border-[#202531]/20 hover:bg-[#01DAD7]/20"
                  }`}
                >
                  {selected ? (
                    <CheckCircle size={15} weight="fill" aria-hidden="true" />
                  ) : (
                    <Plus size={14} weight="bold" aria-hidden="true" />
                  )}
                  <span>
                    {mat.name}
                    {queuedMaterialIdSet.has(mat.id) ? " (Di Daftar Pengajuan)" : ""}
                  </span>
                  <span className={`font-mono text-[11px] ${selected ? "text-[#01DAD7]" : "text-[#525866]"}`}>
                    ({formatNumber(mat.currentStock)} {uLabel})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

