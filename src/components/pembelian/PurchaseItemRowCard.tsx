"use client";

import React from "react";
import { formatRupiah } from "@/lib/format";
import { CaretDown, CaretUp, Trash } from "@phosphor-icons/react";
import type { PurchaseCatalogProd, PurchaseInputRow, PurchaseUnitOption } from "./types";

interface PurchaseItemRowCardProps {
  row: PurchaseInputRow;
  index: number;
  canRemove: boolean;
  products: PurchaseCatalogProd[];
  units: PurchaseUnitOption[];
  onRemove: (rowKey: string) => void;
  onSelectExistingProduct: (rowKey: string, prodId: string) => void;
  onUpdateRow: (rowKey: string, patch: Partial<PurchaseInputRow>) => void;
}

export function PurchaseItemRowCard({
  row,
  index,
  canRemove,
  products,
  units,
  onRemove,
  onSelectExistingProduct,
  onUpdateRow,
}: PurchaseItemRowCardProps) {
  return (
    <div className="p-4 rounded-xl border border-[#202531]/15 bg-[#F8FAFC] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#202531]">
          Barang #{index + 1} {row.isNewProduct ? "(Barang Baru)" : "(Dari Katalog)"}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(row.rowKey)}
            className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-xs font-bold text-[#D41448] hover:bg-[#FFF0F4] cursor-pointer"
          >
            <Trash size={14} weight="bold" aria-hidden="true" />
            <span>Hapus</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        {!row.isNewProduct && products.length > 0 ? (
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-[#202531] mb-1">Pilih Barang</label>
            <select
              value={row.productId || ""}
              onChange={(e) => onSelectExistingProduct(row.rowKey, e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-semibold bg-white text-[#202531]"
            >
              <option value="">-- Pilih Barang --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.purchaseUnit})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-[#202531] mb-1">Nama Barang</label>
            <input
              type="text"
              value={row.itemName}
              onChange={(e) => onUpdateRow(row.rowKey, { itemName: e.target.value })}
              placeholder="Contoh: Gula Pasir 1kg"
              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs bg-white text-[#202531]"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold text-[#202531] mb-1">Jumlah Beli</label>
          <input
            type="number"
            min={0.01}
            step="any"
            value={row.quantity}
            onChange={(e) => onUpdateRow(row.rowKey, { quantity: Number(e.target.value) })}
            className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-[#202531] mb-1">Satuan</label>
          <select
            value={row.unit}
            onChange={(e) => onUpdateRow(row.rowKey, { unit: e.target.value })}
            className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-semibold bg-white text-[#202531]"
          >
            {units.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-[#202531] mb-1">
            Harga Beli / {row.unit} (Rp)
          </label>
          <input
            type="number"
            min={0}
            value={row.unitCost}
            onChange={(e) => onUpdateRow(row.rowKey, { unitCost: Number(e.target.value) })}
            className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-[#202531] mb-1">Subtotal</label>
          <div className="px-3 py-2 min-h-[44px] rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs font-mono font-extrabold tabular-nums text-[#202531] flex items-center">
            {formatRupiah(Math.round(row.quantity * row.unitCost))}
          </div>
        </div>
      </div>

      {row.isNewProduct && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => onUpdateRow(row.rowKey, { showSplitOption: !row.showSplitOption })}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#525866] hover:text-[#202531] cursor-pointer"
          >
            {row.showSplitOption ? (
              <CaretUp size={13} weight="bold" aria-hidden="true" />
            ) : (
              <CaretDown size={13} weight="bold" aria-hidden="true" />
            )}
            <span>Opsional: Atur harga jual atau isi dus/kemasan (contoh: 1 dus = 24 botol)</span>
          </button>

          {row.showSplitOption && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2.5 mt-2 border-t border-[#202531]/10">
              <div>
                <label className="block text-[11px] font-bold text-[#525866] mb-1">
                  Isi per 1 {row.unit} (berapa satuan jual?)
                </label>
                <input
                  type="number"
                  min={1}
                  value={row.conversionRatio}
                  onChange={(e) =>
                    onUpdateRow(row.rowKey, { conversionRatio: Number(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#525866] mb-1">
                  Satuan Jual Terkecil
                </label>
                <select
                  value={row.sellUnit}
                  onChange={(e) => onUpdateRow(row.rowKey, { sellUnit: e.target.value })}
                  className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs bg-white text-[#202531]"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#525866] mb-1">
                  Harga Jual per {row.sellUnit} (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  value={row.sellPrice}
                  onChange={(e) => onUpdateRow(row.rowKey, { sellPrice: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

