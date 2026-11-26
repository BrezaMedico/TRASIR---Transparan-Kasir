"use client";

import React from "react";
import { PRODUK_PAGE_STEP } from "./useProdukCatalog";

interface ProdukPaginationFooterProps {
  shownCount: number;
  totalCount: number;
  nounLabel: string;
  onShowMore: () => void;
  onCollapse: () => void;
}

export function ProdukPaginationFooter({
  shownCount,
  totalCount,
  nounLabel,
  onShowMore,
  onCollapse,
}: ProdukPaginationFooterProps) {
  if (totalCount === 0) return null;
  const remaining = totalCount - shownCount;
  if (remaining <= 0 && totalCount <= PRODUK_PAGE_STEP) return null;

  return (
    <div className="px-4 sm:px-5 py-3.5 bg-[#F8FAFC] border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <p className="text-xs font-medium text-[#525866]">
        Menampilkan <strong className="text-[#202531]">{shownCount}</strong> dari{" "}
        <strong className="text-[#202531]">{totalCount}</strong> {nounLabel}
      </p>
      <div className="flex items-center gap-2">
        {remaining > 0 ? (
          <button
            type="button"
            onClick={onShowMore}
            className="min-h-[44px] px-4 rounded-xl border border-[#202531]/20 bg-white hover:bg-[#EBEBEB] text-xs font-extrabold text-[#202531] cursor-pointer transition-colors"
          >
            Tampilkan {Math.min(PRODUK_PAGE_STEP, remaining)} Lagi
          </button>
        ) : (
          <button
            type="button"
            onClick={onCollapse}
            className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-[#525866] hover:text-[#202531] hover:bg-[#EBEBEB]/60 cursor-pointer transition-colors"
          >
            Ringkas ke {PRODUK_PAGE_STEP}
          </button>
        )}
      </div>
    </div>
  );
}

