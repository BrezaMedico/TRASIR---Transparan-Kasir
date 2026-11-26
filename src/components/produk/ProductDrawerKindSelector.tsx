"use client";

import React from "react";
import { CookingPot, Package } from "@phosphor-icons/react";

interface ProductDrawerKindSelectorProps {
  productKind: "READY" | "RECIPE";
  onChange: (kind: "READY" | "RECIPE") => void;
}

export function ProductDrawerKindSelector({
  productKind,
  onChange,
}: ProductDrawerKindSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-extrabold text-[#202531]">Jenis Produk yang Ingin Dijual</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange("READY")}
          className={`p-3.5 rounded-2xl border text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202531] ${
            productKind === "READY"
              ? "bg-[#202531] text-white border-[#202531]"
              : "bg-[#F8FAFC] text-[#202531] border-[#202531]/15 hover:bg-[#EBEBEB]"
          }`}
        >
          <div className="flex items-center gap-2 font-extrabold text-sm">
            <Package size={18} weight="duotone" aria-hidden="true" />
            <span>Barang Jadi (Langsung Jual)</span>
          </div>
          <p className={`text-xs mt-1 ${productKind === "READY" ? "text-slate-200" : "text-[#525866]"}`}>
            Air mineral, roti, snack. Beli lalu langsung dijual.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onChange("RECIPE")}
          className={`p-3.5 rounded-2xl border text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202531] ${
            productKind === "RECIPE"
              ? "bg-[#202531] text-white border-[#202531]"
              : "bg-[#F8FAFC] text-[#202531] border-[#202531]/15 hover:bg-[#EBEBEB]"
          }`}
        >
          <div className="flex items-center gap-2 font-extrabold text-sm">
            <CookingPot size={18} weight="duotone" aria-hidden="true" />
            <span>Menu Racikan (Pakai Resep)</span>
          </div>
          <p className={`text-xs mt-1 ${productKind === "RECIPE" ? "text-slate-200" : "text-[#525866]"}`}>
            Kopi susu, es teh, makanan. Bahan otomatis terpotong saat laku.
          </p>
        </button>
      </div>
    </div>
  );
}

