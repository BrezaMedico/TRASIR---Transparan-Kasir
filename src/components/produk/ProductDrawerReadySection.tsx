"use client";

import React from "react";
import { formatRupiah } from "@/lib/format";
import { Minus, Plus } from "@phosphor-icons/react";
import { getUnitDisplayLabel, type UnitOption } from "./types";
import { COMMON_SELL_UNITS } from "./useProductDrawerForm";

interface ProductDrawerReadySectionProps {
  isEditing: boolean;
  costPrice: number;
  sellPrice: number;
  sellUnit: string;
  useOtherUnit: boolean;
  currentStock: number;
  readyProfit: number;
  units: UnitOption[];
  onCostPriceChange: (val: number) => void;
  onSellUnitChange: (val: string) => void;
  onToggleOtherUnit: (next: boolean) => void;
  onCurrentStockChange: React.Dispatch<React.SetStateAction<number>>;
}

export function ProductDrawerReadySection({
  isEditing,
  costPrice,
  sellPrice,
  sellUnit,
  useOtherUnit,
  currentStock,
  readyProfit,
  units,
  onCostPriceChange,
  onSellUnitChange,
  onToggleOtherUnit,
  onCurrentStockChange,
}: ProductDrawerReadySectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <label htmlFor="ready-cost" className="block text-sm font-bold text-slate-900">
            Harga Modal / Beli per 1 {getUnitDisplayLabel(sellUnit)}
          </label>
          <div className="relative">
            <span
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 select-none"
              aria-hidden="true"
            >
              Rp
            </span>
            <input
              id="ready-cost"
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => onCostPriceChange(Math.max(0, Number(e.target.value) || 0))}
              className="w-full pl-11 pr-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-slate-900">Satuan Jual</span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_SELL_UNITS.map((u) => {
              const active = !useOtherUnit && sellUnit === u.value;
              return (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => {
                    onToggleOtherUnit(false);
                    onSellUnitChange(u.value);
                  }}
                  className={`flex-1 min-w-[68px] px-2.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer ${
                    active
                      ? "bg-[#202531] text-white border-[#202531]"
                      : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {u.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onToggleOtherUnit(!useOtherUnit)}
              className={`px-2.5 min-h-[44px] rounded-xl text-xs font-bold border cursor-pointer ${
                useOtherUnit
                  ? "bg-[#202531] text-white border-[#202531]"
                  : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
            >
              Lainnya
            </button>
          </div>
          {useOtherUnit && (
            <select
              aria-label="Pilih satuan jual lainnya"
              value={sellUnit}
              onChange={(e) => onSellUnitChange(e.target.value)}
              className="w-full px-3 h-10 mt-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white cursor-pointer"
            >
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.label || u.name} ({u.group})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="ready-stock" className="text-sm font-bold text-[#202531]">
            {isEditing
              ? `Sisa Stok Sekarang (${getUnitDisplayLabel(sellUnit)})`
              : `Jumlah Stok Awal (${getUnitDisplayLabel(sellUnit)})`}
          </label>
          <div className="flex items-center gap-1.5">
            {[5, 10, 25].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => onCurrentStockChange((prev) => Math.max(0, (Number(prev) || 0) + inc))}
                className="px-2.5 min-h-[36px] rounded-lg bg-white border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#E6FBFB] cursor-pointer"
              >
                +{inc}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Kurangi stok awal"
            onClick={() =>
              onCurrentStockChange((prev) => Math.max(0, Number(((Number(prev) || 0) - 1).toFixed(2))))
            }
            className="w-11 h-11 rounded-xl border border-[#202531]/20 bg-white hover:bg-[#EBEBEB] text-[#202531] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Minus size={18} weight="bold" aria-hidden="true" />
          </button>
          <input
            id="ready-stock"
            type="number"
            min={0}
            step="any"
            value={currentStock}
            onChange={(e) => onCurrentStockChange(Math.max(0, Number(e.target.value) || 0))}
            className="flex-1 text-center px-3.5 h-11 rounded-xl border border-[#202531]/20 text-base font-mono font-extrabold text-[#202531] bg-white"
          />
          <button
            type="button"
            aria-label="Tambah stok awal"
            onClick={() =>
              onCurrentStockChange((prev) => Number(((Number(prev) || 0) + 1).toFixed(2)))
            }
            className="w-11 h-11 rounded-xl border border-[#202531]/20 bg-white hover:bg-[#EBEBEB] text-[#202531] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
          <div className="p-2.5 rounded-xl bg-white border border-[#202531]/10">
            <span className="text-[#525866] block">Total Nilai Belanja</span>
            <span className="font-mono font-extrabold text-sm text-[#202531] tabular-nums">
              {formatRupiah(Math.round((Number(currentStock) || 0) * (Number(costPrice) || 0)))}
            </span>
          </div>
          {sellPrice > 0 && (
            <div className="p-2.5 rounded-xl bg-white border border-[#202531]/10">
              <span className="text-[#525866] block">
                Untung Kotor / {getUnitDisplayLabel(sellUnit)}
              </span>
              <span
                className={`font-mono font-extrabold text-sm tabular-nums ${
                  readyProfit < 0 ? "text-[#D41448]" : "text-[#006B69]"
                }`}
              >
                {readyProfit < 0
                  ? `Rugi ${formatRupiah(Math.abs(readyProfit))}`
                  : formatRupiah(readyProfit)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

