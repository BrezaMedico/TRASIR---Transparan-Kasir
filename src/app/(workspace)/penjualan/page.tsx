"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { formatRoleLabel, isStoreAdmin } from "@/lib/rbac-shared";
import { ClockCounterClockwise, MagnifyingGlass, Receipt } from "@phosphor-icons/react";
import { usePenjualanData } from "@/components/penjualan/usePenjualanData";
import { SalesHistoryTab } from "@/components/penjualan/SalesHistoryTab";
import { SalesAmendmentsTab } from "@/components/penjualan/SalesAmendmentsTab";
import { SaleDetailDrawer } from "@/components/penjualan/SaleDetailDrawer";

export default function PenjualanPage() {
  const data = usePenjualanData();
  const [activeTab, setActiveTab] = useState<"history" | "amendments">("history");

  return (
    <AppShell>
      {(session) => {
        const isAdmin = isStoreAdmin(session.user.role);

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Riwayat Transaksi &amp; Pembatalan
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Pantau daftar penjualan kasir serta ajukan atau tinjau pembatalan transaksi
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <MagnifyingGlass
                      size={15}
                      weight="bold"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={data.searchQuery}
                      onChange={(e) => data.setSearchQuery(e.target.value)}
                      placeholder="Cari struk, produk, kasir..."
                      aria-label="Cari transaksi"
                      className="pl-8 pr-3 py-2 min-h-[40px] w-52 rounded-xl border border-slate-300 text-xs text-slate-900 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <input
                    id="filter-date"
                    type="date"
                    aria-label="Filter tanggal"
                    value={data.dateFilter}
                    onChange={(e) => data.setDateFilter(e.target.value)}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                  />

                  <select
                    aria-label="Filter status transaksi"
                    value={data.statusFilter}
                    onChange={(e) => data.setStatusFilter(e.target.value)}
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="NORMAL">Normal</option>
                    <option value="MENUNGGU_PERSETUJUAN">Menunggu Persetujuan</option>
                    <option value="DIBATALKAN">Dibatalkan</option>
                    <option value="DIKEMBALIKAN">Dikembalikan</option>
                  </select>

                  {isAdmin && (
                    <select
                      id="filter-cashier"
                      aria-label="Filter kasir"
                      value={data.cashierFilter}
                      onChange={(e) => data.setCashierFilter(e.target.value)}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                    >
                      <option value="">Semua Kasir</option>
                      {data.cashiers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({formatRoleLabel(c.role)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Sub-fitur Riwayat Transaksi"
                className="flex flex-wrap gap-2 pt-2 border-t border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "history"}
                  onClick={() => setActiveTab("history")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "history"
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Receipt size={16} weight="bold" aria-hidden="true" />
                  <span>Riwayat Transaksi ({data.filteredSales.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "amendments"}
                  onClick={() => setActiveTab("amendments")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "amendments"
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ClockCounterClockwise size={16} weight="bold" aria-hidden="true" />
                  <span>
                    Pengajuan Pembatalan (
                    {data.amendments.filter((a) => a.status === "MENUNGGU_PERSETUJUAN").length}{" "}
                    Menunggu)
                  </span>
                </button>
              </div>
            </div>

            {activeTab === "history" && (
              <SalesHistoryTab
                loading={data.loading}
                filteredCount={data.filteredSales.length}
                paginatedSales={data.paginatedSales}
                currentPage={data.currentPage}
                totalPages={data.totalPages}
                nextCursor={data.nextCursor}
                loadingMore={data.loadingMore}
                onSelectSale={(sale) => {
                  data.setSelectedSale(sale);
                  data.setShowCancelForm(false);
                }}
                onPageChange={data.setCurrentPage}
                onLoadMore={data.loadMoreSales}
              />
            )}

            {activeTab === "amendments" && (
              <SalesAmendmentsTab
                amendments={data.amendments}
                isAdmin={isAdmin}
                currentUserId={session.user.id}
                reviewNotesMap={data.reviewNotesMap}
                onReviewNoteChange={(id, val) =>
                  data.setReviewNotesMap((prev) => ({ ...prev, [id]: val }))
                }
                confirmReview={data.confirmReview}
                onSetConfirmReview={data.setConfirmReview}
                processingReviewId={data.processingReviewId}
                onExecuteReview={data.executeReviewAmendment}
              />
            )}

            <SaleDetailDrawer
              selectedSale={data.selectedSale}
              showCancelForm={data.showCancelForm}
              amendmentType={data.amendmentType}
              amendmentReason={data.amendmentReason}
              amendmentProofName={data.amendmentProofName}
              submittingAmendment={data.submittingAmendment}
              onClose={() => {
                data.setSelectedSale(null);
                data.setShowCancelForm(false);
              }}
              onStartCancelForm={() => {
                data.setAmendmentType("PEMBATALAN");
                data.setShowCancelForm(true);
              }}
              onHideCancelForm={() => data.setShowCancelForm(false)}
              onAmendmentTypeChange={data.setAmendmentType}
              onAmendmentReasonChange={data.setAmendmentReason}
              onProofUpload={data.handleProofUpload}
              onSubmitAmendment={data.handleRequestAmendment}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
