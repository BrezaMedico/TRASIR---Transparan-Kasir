"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { CaretLeft, CaretRight, Receipt } from "@phosphor-icons/react";
import type { SaleRecord } from "./types";

interface SalesHistoryTabProps {
  loading: boolean;
  filteredCount: number;
  paginatedSales: SaleRecord[];
  currentPage: number;
  totalPages: number;
  nextCursor: string | null;
  loadingMore: boolean;
  onSelectSale: (sale: SaleRecord) => void;
  onPageChange: (page: number) => void;
  onLoadMore: () => void;
}

export function SalesHistoryTab({
  loading,
  filteredCount,
  paginatedSales,
  currentPage,
  totalPages,
  nextCursor,
  loadingMore,
  onSelectSale,
  onPageChange,
  onLoadMore,
}: SalesHistoryTabProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-600">Memuat riwayat transaksi...</div>
      ) : paginatedSales.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Receipt size={32} weight="duotone" className="mx-auto text-slate-400" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-800">
            Belum ada transaksi yang sesuai filter.
          </p>
          <p className="text-xs text-slate-600">
            Gunakan halaman Kasir (POS) untuk mulai mencatat transaksi.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                  <th className="py-3.5 px-4">Nomor Struk</th>
                  <th className="py-3.5 px-4">Waktu</th>
                  <th className="py-3.5 px-4">Kasir</th>
                  <th className="py-3.5 px-4">Ringkasan Barang</th>
                  <th className="py-3.5 px-4">Metode</th>
                  <th className="py-3.5 px-4 text-right">Total Bayar</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {paginatedSales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => onSelectSale(sale)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-extrabold text-[#202531]">
                      #{sale.receiptNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {formatDateTimeJakarta(sale.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {sale.cashier.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate">
                      {sale.items.map((it) => `${it.productName} (${it.quantity})`).join(", ")}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">{sale.paymentMethod}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                      {formatRupiah(sale.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={sale.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSale(sale);
                        }}
                        className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-bold text-[#202531] hover:bg-slate-100 cursor-pointer"
                      >
                        Lihat Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(totalPages > 1 || nextCursor) && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs">
              <span className="text-slate-600 font-semibold">
                Halaman {currentPage} dari {totalPages} ({filteredCount} transaksi dimuat)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {totalPages > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      <CaretLeft size={14} weight="bold" aria-hidden="true" />
                      <span>Sebelumnya</span>
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      <span>Berikutnya</span>
                      <CaretRight size={14} weight="bold" aria-hidden="true" />
                    </button>
                  </>
                )}
                {nextCursor && (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={onLoadMore}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 min-h-[36px] rounded-lg bg-[#202531] text-white font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {loadingMore ? "Memuat..." : "Muat Lebih Banyak"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

