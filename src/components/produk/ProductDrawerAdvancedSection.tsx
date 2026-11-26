"use client";

import React from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { CategoryOption, UnitOption } from "./types";

interface ProductDrawerAdvancedSectionProps {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  productKind: "READY" | "RECIPE";
  useBulkSplit: boolean;
  onUseBulkSplitChange: (val: boolean) => void;
  purchaseUnit: string;
  onPurchaseUnitChange: (val: string) => void;
  sellUnit: string;
  conversionRatio: number;
  onConversionRatioChange: (val: number) => void;
  sku: string;
  onSkuChange: (val: string) => void;
  barcode: string;
  onBarcodeChange: (val: string) => void;
  categoryId: string;
  onCategoryIdChange: (val: string) => void;
  minStockAlert: number;
  onMinStockAlertChange: (val: number) => void;
  categories: CategoryOption[];
  units: UnitOption[];
}

export function ProductDrawerAdvancedSection({
  showAdvanced,
  onToggleAdvanced,
  productKind,
  useBulkSplit,
  onUseBulkSplitChange,
  purchaseUnit,
  onPurchaseUnitChange,
  sellUnit,
  conversionRatio,
  onConversionRatioChange,
  sku,
  onSkuChange,
  barcode,
  onBarcodeChange,
  categoryId,
  onCategoryIdChange,
  minStockAlert,
  onMinStockAlertChange,
  categories,
  units,
}: ProductDrawerAdvancedSectionProps) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <button
        type="button"
        aria-expanded={showAdvanced}
        onClick={onToggleAdvanced}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 cursor-pointer"
      >
        {showAdvanced ? (
          <CaretUp size={15} weight="bold" aria-hidden="true" />
        ) : (
          <CaretDown size={15} weight="bold" aria-hidden="true" />
        )}
        <span>
          Pengaturan Tambahan (Opsional: Kode Barang, Barcode, Kategori
          {productKind === "READY" ? ", Pecah Dus" : ""})
        </span>
      </button>

      {showAdvanced && (
        <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          {productKind === "READY" && (
            <div className="space-y-2.5 pb-3 border-b border-slate-200">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBulkSplit}
                  onChange={(e) => onUseBulkSplitChange(e.target.checked)}
                  className="w-4 h-4 rounded text-[#202531]"
                />
                <span>Beli dalam dus/pak lalu jual satuan (Pecah Satuan)</span>
              </label>
              {useBulkSplit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="bulk-unit" className="block text-xs font-bold text-slate-700 mb-1">
                      Satuan Beli Besar
                    </label>
                    <select
                      id="bulk-unit"
                      value={purchaseUnit}
                      onChange={(e) => onPurchaseUnitChange(e.target.value)}
                      className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs bg-white cursor-pointer"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.label || u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bulk-ratio" className="block text-xs font-bold text-slate-700 mb-1">
                      Isi per 1 {purchaseUnit} (dalam {sellUnit})
                    </label>
                    <input
                      id="bulk-ratio"
                      type="number"
                      min={1}
                      step="any"
                      value={conversionRatio}
                      onChange={(e) =>
                        onConversionRatioChange(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="prod-adv-sku" className="block text-xs font-bold text-slate-700 mb-1">
                Kode SKU (Otomatis)
              </label>
              <input
                id="prod-adv-sku"
                type="text"
                value={sku}
                onChange={(e) => onSkuChange(e.target.value)}
                className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
              />
            </div>
            <div>
              <label htmlFor="prod-adv-barcode" className="block text-xs font-bold text-slate-700 mb-1">
                Kode Barcode (Opsional)
              </label>
              <input
                id="prod-adv-barcode"
                type="text"
                value={barcode}
                onChange={(e) => onBarcodeChange(e.target.value)}
                placeholder="899..."
                className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="prod-adv-cat" className="block text-xs font-bold text-slate-700 mb-1">
                Kategori
              </label>
              <select
                id="prod-adv-cat"
                value={categoryId}
                onChange={(e) => onCategoryIdChange(e.target.value)}
                className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-semibold bg-white cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.areaType})
                  </option>
                ))}
              </select>
            </div>
            {productKind === "READY" && (
              <div>
                <label htmlFor="prod-adv-min" className="block text-xs font-bold text-slate-700 mb-1">
                  Batas Peringatan Stok Menipis
                </label>
                <input
                  id="prod-adv-min"
                  type="number"
                  min={0}
                  value={minStockAlert}
                  onChange={(e) =>
                    onMinStockAlertChange(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

