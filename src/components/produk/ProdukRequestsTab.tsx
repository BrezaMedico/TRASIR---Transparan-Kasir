"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { formatRoleLabel } from "@/lib/rbac-shared";
import {
  parseProductRequestEnvelope,
  type GroupedProductRequestBatch,
} from "@/lib/product-request-batch";
import { Eye, FileMagnifyingGlass, Receipt, Trash } from "@phosphor-icons/react";
import { getUnitDisplayLabel, type ProductRequestItem } from "./types";
import { ProdukPaginationFooter } from "./ProdukPaginationFooter";
import { PRODUK_PAGE_STEP } from "./useProdukCatalog";

interface ProdukRequestsTabProps {
  loadingRequests: boolean;
  isAdmin: boolean;
  groupedBatches: GroupedProductRequestBatch<ProductRequestItem>[];
  visibleBatches: GroupedProductRequestBatch<ProductRequestItem>[];
  onReviewBatch: (batch: GroupedProductRequestBatch<ProductRequestItem>) => void;
  onDeleteBatch: (batch: GroupedProductRequestBatch<ProductRequestItem>) => void;
  onShowMore: () => void;
  onCollapse: () => void;
}

export function ProdukRequestsTab({
  loadingRequests,
  isAdmin,
  groupedBatches,
  visibleBatches,
  onReviewBatch,
  onDeleteBatch,
  onShowMore,
  onCollapse,
}: ProdukRequestsTabProps) {
  return (
    <div
      role="tabpanel"
      aria-labelledby="produk-tab-requests"
      className="bg-white rounded-2xl border border-[#202531]/15 p-5 shadow-sm space-y-4"
    >
      <div>
        <h2 className="text-base font-extrabold text-[#202531]">
          {isAdmin ? "Antrean Persetujuan Paket Barang & Bahan Baru" : "Riwayat Pengajuan Anda"}
        </h2>
        <p className="text-xs text-[#525866] mt-0.5">
          {isAdmin
            ? "Tinjau paket barang, periksa lampiran nota dengan jelas, dan gunakan cek AI Gemini bila diperlukan."
            : "Setiap paket pengajuan akan aktif setelah disetujui Pemilik/Manajer. Selama masih menunggu, Anda bisa membuka detail untuk menambah atau mengganti foto nota."}
        </p>
      </div>

      {loadingRequests ? (
        <div className="py-10 text-center text-xs text-[#525866]">Memuat daftar pengajuan...</div>
      ) : groupedBatches.length === 0 ? (
        <div className="py-10 text-center text-xs text-[#525866] bg-[#F8FAFC] rounded-xl border border-dashed border-[#202531]/15">
          Belum ada pengajuan pada kategori ini.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visibleBatches.map((batch) => {
              const leadRejectReason = batch.items.find(
                (i) => i.status === "DITOLAK" && i.rejectionReason
              )?.rejectionReason;

              return (
                <div
                  key={batch.batchId}
                  className="p-4 rounded-2xl border border-[#202531]/15 bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-[#202531]">
                        {batch.batchTitle}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#202531] text-white text-[11px] font-bold">
                        {batch.items.length} Barang
                      </span>
                      <StatusBadge
                        status={batch.status === "SEBAGIAN" ? "MENUNGGU_PERSETUJUAN" : batch.status}
                      />
                      {batch.receiptImageData && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#202531]/20 text-[11px] font-bold text-[#202531]">
                          <Receipt size={12} weight="bold" aria-hidden="true" />
                          <span>
                            {batch.receiptSource === "FISIK" ? "Nota Fisik" : "Nota Digital"}
                          </span>
                        </span>
                      )}
                      {isAdmin && batch.aiScanResult && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            batch.aiScanResult.status === "SESUAI"
                              ? "bg-[#E6FBFB] text-[#006B69] border border-[#01DAD7]"
                              : batch.aiScanResult.status === "ADA_SELISIH" ||
                                batch.aiScanResult.status === "GAGAL_CEK"
                              ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                              : "bg-[#FFF0F4] text-[#D41448] border border-[#FF2A63]/35"
                          }`}
                        >
                          <FileMagnifyingGlass size={12} weight="bold" aria-hidden="true" />
                          <span>
                            {batch.aiScanResult.status === "SESUAI"
                              ? "AI: Cocok Nota"
                              : batch.aiScanResult.status === "GAGAL_CEK"
                              ? "AI Belum Tersambung"
                              : batch.aiScanResult.status === "ADA_SELISIH"
                              ? "AI: Ada yang Berbeda"
                              : "AI: Perlu Cek Visual"}
                          </span>
                        </span>
                      )}
                      {isAdmin && batch.receiptImageData && !batch.aiScanResult && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                          Belum Dicek AI
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {batch.items.slice(0, 5).map((item) => {
                        const env = parseProductRequestEnvelope(item.variantsJson);
                        const initStock = item.stockMethod !== "RESEP" ? env.initialStock ?? 0 : 0;
                        const ratio = item.conversionRatio > 1 ? item.conversionRatio : 1;
                        const displayQty =
                          ratio > 1
                            ? `${formatNumber(Number((initStock / ratio).toFixed(2)))} ${item.purchaseUnit || "kemasan"}`
                            : `${formatNumber(initStock)} ${getUnitDisplayLabel(item.sellUnit)}`;
                        return (
                          <span
                            key={item.id}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#202531]/10 text-[11px] font-semibold text-[#202531]"
                          >
                            {env.requestKind === "UPDATE" ? "[Ubah] " : ""}
                            {item.name}
                            {env.requestKind === "UPDATE"
                              ? ""
                              : initStock > 0
                              ? ` (${displayQty})`
                              : item.stockMethod === "RESEP"
                              ? " (Resep)"
                              : ""}
                          </span>
                        );
                      })}
                      {batch.items.length > 5 && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#EBEBEB] text-[11px] font-bold text-[#202531]">
                          +{batch.items.length - 5} lainnya
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#525866]">
                      Diajukan <strong>{batch.requestedBy.name}</strong> (
                      {formatRoleLabel(batch.requestedBy.role)}) pada{" "}
                      {formatDateTimeJakarta(batch.createdAt)}
                      {batch.totalEstimatedCost > 0 && (
                        <>
                          {" "}
                          • Estimasi modal:{" "}
                          <strong className="font-mono text-[#202531]">
                            {formatRupiah(batch.totalEstimatedCost)}
                          </strong>
                        </>
                      )}
                    </p>

                    {leadRejectReason && (
                      <p className="text-xs font-semibold text-[#D41448] bg-[#FFF0F4] border border-[#FF2A63]/35 rounded-lg px-3 py-1.5">
                        Alasan Penolakan: {leadRejectReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onReviewBatch(batch)}
                      className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-bold cursor-pointer ${
                        isAdmin && batch.pendingCount > 0
                          ? "bg-[#01DAD7] text-[#202531] hover:opacity-90 font-extrabold"
                          : "bg-[#202531] text-white hover:bg-[#2a3140]"
                      }`}
                    >
                      <Eye size={16} weight="bold" aria-hidden="true" />
                      <span>
                        {isAdmin && batch.pendingCount > 0
                          ? "Tinjau Paket & Putuskan"
                          : batch.pendingCount > 0
                          ? "Lihat & Ganti Nota"
                          : "Lihat Detail Paket"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBatch(batch)}
                      aria-label={`Hapus pengajuan ${batch.batchTitle}`}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Trash size={14} weight="bold" aria-hidden="true" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {groupedBatches.length > PRODUK_PAGE_STEP && (
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <ProdukPaginationFooter
                shownCount={visibleBatches.length}
                totalCount={groupedBatches.length}
                nounLabel="paket pengajuan"
                onShowMore={onShowMore}
                onCollapse={onCollapse}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

