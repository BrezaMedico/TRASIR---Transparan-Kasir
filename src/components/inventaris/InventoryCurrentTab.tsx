"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatNumber } from "@/lib/format";
import { Package } from "@phosphor-icons/react";
import type { InventoryProduct } from "./types";

interface InventoryCurrentTabProps {
  loading: boolean;
  filteredProducts: InventoryProduct[];
}

export function InventoryCurrentTab({ loading, filteredProducts }: InventoryCurrentTabProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-600">
          Memuat posisi stok inventaris...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-12 text-center space-y-2">
          <Package size={32} weight="duotone" className="mx-auto text-slate-400" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-900">
            Belum ada barang yang tercatat di inventaris.
          </p>
          <p className="text-xs text-slate-600">
            Stok barang otomatis masuk setelah pengajuan Pembelian disetujui Pemilik.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                <th className="py-3.5 px-4">SKU &amp; Nama Barang</th>
                <th className="py-3.5 px-4">Kategori &amp; Mode Area</th>
                <th className="py-3.5 px-4">Metode Stok</th>
                <th className="py-3.5 px-4 text-right">Posisi Stok</th>
                <th className="py-3.5 px-4 text-right">Batas Minimum</th>
                <th className="py-3.5 px-4">Indikator Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredProducts.map((p) => {
                const isLow = p.stockMethod !== "RESEP" && p.currentStock <= p.minStockAlert;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4">
                      <p className="font-extrabold text-slate-900">{p.name}</p>
                      <p className="font-mono text-[11px] text-slate-600">{p.sku}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 mb-1">{p.category.name}</p>
                      <StatusBadge status={p.category.areaType} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={p.stockMethod} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                      {p.stockMethod === "RESEP"
                        ? "Mengikuti Bahan Baku"
                        : `${formatNumber(p.currentStock)} ${p.sellUnit}`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                      {p.stockMethod === "RESEP"
                        ? "-"
                        : `${formatNumber(p.minStockAlert)} ${p.sellUnit}`}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.stockMethod === "RESEP" ? (
                        <StatusBadge status="AMAN" customLabel="Produk Resep" />
                      ) : isLow ? (
                        <StatusBadge status="PERLU_PERBAIKAN" customLabel="Stok Menipis" />
                      ) : (
                        <StatusBadge status="AMAN" customLabel="Stok Aman" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

