"use client";

import React from "react";
import {
  ArrowClockwise,
  CheckCircle,
  FileMagnifyingGlass,
  Info,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import type { AIReceiptValidationResult } from "@/lib/gemini";
import type { ProductRequestAIResult } from "@/lib/product-request-batch";

export interface NormalizedAiItemComparison {
  submittedName: string;
  matchedReceiptName: string | null;
  submittedDisplayLine: string;
  receiptDisplayLine: string;
  matchStatus: "COCOK" | "SELISIH" | "TIDAK_DITEMUKAN" | "RESEP_NON_NOTA" | "BELUM_DICEK";
  note: string | null;
}

export interface NormalizedReceiptAiReport {
  status: "SESUAI" | "ADA_SELISIH" | "NOTA_GANDA" | "TERINDIKASI_EDIT" | "GAGAL_CEK";
  isReceiptReadable: boolean;
  detectedDocumentType: string | null;
  receiptLines: string[];
  unmatchedReceiptItems: string[];
  missingReceiptInfo: string[];
  submittedSupplier: string | null;
  submittedTotal: number | null;
  extractedSupplier: string | null;
  extractedTotal: number | null;
  summary: string;
  editSuspicionReason: string | null;
  duplicateInvoiceRef: string | null;
  items: NormalizedAiItemComparison[];
  disclaimer: string;
  aiEngineUsed: boolean;
  engineError: string | null;
  checkedAt: string | null;
}

function formatPartialReceiptLine(params: {
  qty: number | null;
  unitCost: number | null;
  subtotal: number | null;
  matchedReceiptName: string | null;
}): string {
  const { qty, unitCost, subtotal, matchedReceiptName } = params;
  const hasQty = typeof qty === "number" && qty > 0;
  const hasUnit = typeof unitCost === "number" && unitCost > 0;
  const hasSub = typeof subtotal === "number" && subtotal > 0;

  if (hasQty && hasUnit && hasSub) {
    return `${formatNumber(qty)} x ${formatRupiah(unitCost)} = ${formatRupiah(subtotal)}`;
  }
  if (hasQty && hasUnit) {
    return `${formatNumber(qty)} x ${formatRupiah(unitCost)}`;
  }
  if (hasQty && hasSub) {
    return `${formatNumber(qty)} item, total ${formatRupiah(subtotal)} (harga satuan tidak dirinci)`;
  }
  if (hasSub) {
    return `Total ${formatRupiah(subtotal)} (rincian jumlah tidak tertulis)`;
  }
  if (hasQty) {
    return `Jumlah ${formatNumber(qty)} (harga tidak dirinci per item)`;
  }
  return matchedReceiptName || "Cocok dengan total nota (tanpa rincian item)";
}

export function normalizePurchaseAiResult(
  ai: AIReceiptValidationResult,
  input: {
    supplierName: string;
    invoiceNumber: string;
    purchaseDate: string;
    totalAmount: number;
    items: {
      itemName: string;
      quantity: number;
      unit: string;
      unitCost: number;
    }[];
  }
): NormalizedReceiptAiReport {
  return {
    status: ai.status,
    isReceiptReadable: ai.isReceiptReadable !== false,
    detectedDocumentType: ai.detectedDocumentType ?? null,
    receiptLines: Array.isArray(ai.receiptLines) ? ai.receiptLines : [],
    unmatchedReceiptItems: Array.isArray(ai.unmatchedReceiptItems)
      ? ai.unmatchedReceiptItems
      : [],
    missingReceiptInfo: Array.isArray(ai.missingReceiptInfo) ? ai.missingReceiptInfo : [],
    submittedSupplier: input.supplierName || null,
    submittedTotal:
      typeof ai.submittedTotal === "number" ? ai.submittedTotal : input.totalAmount,
    extractedSupplier: ai.extractedSupplier || null,
    extractedTotal: ai.extractedTotal,
    summary: ai.neutralEvaluationSummary,
    editSuspicionReason: ai.editSuspicionReason || null,
    duplicateInvoiceRef: ai.duplicateInvoiceRef || null,
    items: ai.items.map((row, idx) => {
      const inp = input.items[idx];
      const qty = row.submittedQty ?? inp?.quantity ?? 0;
      const unit = row.submittedUnit ?? inp?.unit ?? "";
      const cost = row.submittedUnitCost ?? inp?.unitCost ?? 0;
      const sub = row.submittedSubtotal ?? Math.round(qty * cost);
      const matchStatus =
        row.matchStatus || (row.matchesInput ? "COCOK" : "SELISIH");

      const submittedDisplayLine = `${formatNumber(qty)} ${unit} x ${formatRupiah(
        cost
      )} = ${formatRupiah(sub)}`;

      let receiptDisplayLine = "Tidak tertulis di nota";
      if (matchStatus === "BELUM_DICEK") {
        receiptDisplayLine = "Belum diperiksa AI";
      } else if (matchStatus !== "TIDAK_DITEMUKAN") {
        receiptDisplayLine = formatPartialReceiptLine({
          qty: row.quantity,
          unitCost: row.unitCost,
          subtotal: row.subtotal,
          matchedReceiptName: row.matchedReceiptName ?? null,
        });
      }

      return {
        submittedName: inp?.itemName || row.itemName,
        matchedReceiptName: row.matchedReceiptName ?? null,
        submittedDisplayLine,
        receiptDisplayLine,
        matchStatus,
        note: row.discrepancyNote,
      };
    }),
    disclaimer: ai.disclaimer,
    aiEngineUsed: ai.aiEngineUsed,
    engineError: ai.engineError ?? null,
    checkedAt: ai.checkedAt ?? null,
  };
}

export function normalizeProductBatchAiResult(
  ai: ProductRequestAIResult,
  input: {
    supplierName: string | null;
    items: {
      name: string;
      stockMethod: string;
      initialStock: number;
      sellUnit: string;
      purchaseUnit?: string;
      conversionRatio?: number;
      costPrice: number;
    }[];
  }
): NormalizedReceiptAiReport {
  return {
    status: ai.status,
    isReceiptReadable: ai.isReceiptReadable !== false,
    detectedDocumentType: ai.detectedDocumentType ?? null,
    receiptLines: Array.isArray(ai.receiptLines) ? ai.receiptLines : [],
    unmatchedReceiptItems: Array.isArray(ai.unmatchedReceiptItems)
      ? ai.unmatchedReceiptItems
      : [],
    missingReceiptInfo: Array.isArray(ai.missingReceiptInfo) ? ai.missingReceiptInfo : [],
    submittedSupplier: input.supplierName || null,
    submittedTotal: ai.submittedEstimatedTotal,
    extractedSupplier: ai.extractedSupplier || null,
    extractedTotal: ai.extractedTotal,
    summary: ai.neutralSummary,
    editSuspicionReason: ai.editSuspicionReason ?? null,
    duplicateInvoiceRef: null,
    items: ai.items.map((row, idx) => {
      const inp = input.items[idx];
      const ratio = inp?.conversionRatio && inp.conversionRatio > 1 ? inp.conversionRatio : 1;
      const isPackaged = inp?.stockMethod !== "RESEP" && ratio > 1;
      const packCount =
        row.packCount ??
        (isPackaged ? Number((row.submittedQty / ratio).toFixed(2)) : row.submittedQty);
      const packUnitPrice =
        row.packUnitPrice ??
        (isPackaged ? Math.round((inp?.costPrice ?? 0) * ratio) : inp?.costPrice ?? 0);
      const unitLabel = isPackaged
        ? row.purchaseUnit || inp?.purchaseUnit || "kemasan"
        : row.submittedUnit;

      const submittedDisplayLine =
        row.matchStatus === "RESEP_NON_NOTA"
          ? "Menu racikan (pakai bahan di stok)"
          : `${formatNumber(packCount)} ${unitLabel} x ${formatRupiah(
              packUnitPrice
            )} = ${formatRupiah(row.submittedCostTotal)}`;

      let receiptDisplayLine = "Tidak tertulis di nota";
      if (row.matchStatus === "RESEP_NON_NOTA") {
        receiptDisplayLine = "Tidak dicari di nota";
      } else if (row.matchStatus === "BELUM_DICEK") {
        receiptDisplayLine = "Belum diperiksa AI";
      } else if (row.matchStatus !== "TIDAK_DITEMUKAN") {
        receiptDisplayLine = formatPartialReceiptLine({
          qty: row.receiptQty,
          unitCost: row.receiptUnitCost,
          subtotal: row.receiptSubtotal,
          matchedReceiptName: row.matchedReceiptName ?? null,
        });
      }

      return {
        submittedName: row.submittedName,
        matchedReceiptName: row.matchedReceiptName,
        submittedDisplayLine,
        receiptDisplayLine,
        matchStatus: row.matchStatus,
        note: row.note,
      };
    }),
    disclaimer: ai.disclaimer,
    aiEngineUsed: ai.aiEngineUsed,
    engineError: ai.engineError ?? null,
    checkedAt: ai.checkedAt ?? null,
  };
}

function getVerdictTitle(report: NormalizedReceiptAiReport): string {
  if (!report.isReceiptReadable) {
    return "Lampiran Bukan Nota / Tidak Terbaca";
  }
  switch (report.status) {
    case "SESUAI":
      return "Cocok dengan Nota";
    case "ADA_SELISIH":
      return "Ada yang Berbeda dengan Nota";
    case "NOTA_GANDA":
      return "Nota Ini Pernah Dipakai Sebelumnya";
    case "TERINDIKASI_EDIT":
      return "Perlu Cek Ulang Tampilan Nota";
    case "GAGAL_CEK":
      return "AI Gemini Belum Tersambung";
  }
}

function getItemBadgeMeta(matchStatus: NormalizedAiItemComparison["matchStatus"]) {
  switch (matchStatus) {
    case "COCOK":
      return {
        label: "Cocok",
        cls: "bg-[#E6FBFB] text-[#006B69] border border-[#01DAD7]",
      };
    case "RESEP_NON_NOTA":
      return {
        label: "Menu Resep",
        cls: "bg-[#EBEBEB] text-[#202531] border border-[#202531]/15",
      };
    case "TIDAK_DITEMUKAN":
      return {
        label: "Tidak di Nota",
        cls: "bg-[#FFF0F4] text-[#D41448] border border-[#FF2A63]/35",
      };
    case "BELUM_DICEK":
      return {
        label: "Belum Dicek",
        cls: "bg-[#EBEBEB] text-[#202531] border border-[#202531]/15",
      };
    case "SELISIH":
    default:
      return {
        label: "Berbeda",
        cls: "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]",
      };
  }
}

interface ReceiptAiCheckPanelProps {
  hasReceipt: boolean;
  report: NormalizedReceiptAiReport | null;
  loading: boolean;
  errorMessage?: string | null;
  onRunCheck: () => void;
}

export function ReceiptAiCheckPanel({
  hasReceipt,
  report,
  loading,
  errorMessage,
  onRunCheck,
}: ReceiptAiCheckPanelProps) {
  const totalDiff =
    report &&
    report.isReceiptReadable &&
    report.extractedTotal !== null &&
    report.submittedTotal !== null
      ? report.submittedTotal - report.extractedTotal
      : null;

  if (!hasReceipt && !loading && !report && !errorMessage) {
    return (
      <section
        aria-label="Cek Nota dengan AI"
        className="rounded-2xl bg-[#F8FAFC] border border-[#202531]/15 p-4 flex items-start gap-3"
      >
        <div className="w-9 h-9 rounded-xl bg-white border border-[#202531]/10 flex items-center justify-center shrink-0 text-[#525866]">
          <FileMagnifyingGlass size={18} weight="bold" aria-hidden="true" />
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-extrabold text-[#202531]">Cek Nota dengan AI</h3>
            <span className="px-2 py-0.5 rounded-md bg-white border border-[#202531]/15 text-[11px] font-bold text-[#525866]">
              Tanpa Nota
            </span>
          </div>
          <p className="text-xs text-[#525866] leading-relaxed">
            Belum ada foto nota yang dilampirkan. Anda tetap bisa langsung menyetujui atau menolak pengajuan ini.
          </p>
        </div>
      </section>
    );
  }

  if (hasReceipt && !loading && !report && !errorMessage) {
    return (
      <section
        aria-label="Cek Nota dengan AI"
        className="rounded-2xl bg-white border border-[#202531]/15 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#E6FBFB] border border-[#01DAD7]/50 text-[#006B69] flex items-center justify-center shrink-0">
            <FileMagnifyingGlass size={20} weight="bold" aria-hidden="true" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h3 className="text-sm font-extrabold text-[#202531]">Cek Nota dengan AI</h3>
            <p className="text-xs text-[#525866] leading-relaxed">
              Cocokkan otomatis nama barang, jumlah, dan harga di nota dengan input pegawai.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRunCheck}
          className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2a3140] shrink-0 cursor-pointer"
        >
          <FileMagnifyingGlass size={16} weight="bold" aria-hidden="true" />
          <span>Cek Nota Sekarang</span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Cek Nota dengan AI"
      className="bg-white rounded-2xl border border-[#202531]/15 p-4 sm:p-5 space-y-4"
    >
      {/* Header + Tombol Cek Ulang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileMagnifyingGlass
              size={18}
              weight="bold"
              className="text-[#006B69]"
              aria-hidden="true"
            />
            <h3 className="text-sm font-extrabold text-[#202531]">Cek Nota dengan AI</h3>
            {report && <StatusBadge status={report.status} />}
          </div>
          <p className="text-xs text-[#525866]">
            Cocokkan otomatis nama barang, jumlah, dan harga di nota dengan input pegawai.
          </p>
        </div>

        {hasReceipt && !loading && (
          <button
            type="button"
            onClick={onRunCheck}
            className="inline-flex items-center justify-center gap-2 px-3.5 min-h-[40px] rounded-xl bg-white border border-[#202531]/20 text-[#202531] text-xs font-bold hover:bg-[#EBEBEB] shrink-0 cursor-pointer"
          >
            <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
            <span>{report ? "Cek Ulang" : "Coba Cek Lagi"}</span>
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div
          aria-live="polite"
          className="p-4 rounded-xl bg-[#F8FAFC] border border-[#202531]/15 space-y-3"
        >
          <p className="text-xs font-bold text-[#202531]">
            AI Gemini sedang membaca tulisan di nota dan mencocokkannya...
          </p>
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-2/3 bg-[#202531]/10 rounded" />
            <div className="h-3 w-full bg-[#202531]/10 rounded" />
            <div className="h-12 w-full bg-[#202531]/10 rounded-lg" />
          </div>
        </div>
      )}

      {/* Error jaringan / API */}
      {errorMessage && !loading && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs text-[#D41448] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2">
            <XCircle size={18} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-extrabold">Cek AI belum berhasil</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          </div>
          {hasReceipt && (
            <button
              type="button"
              onClick={onRunCheck}
              className="px-3.5 min-h-[40px] rounded-xl bg-white border border-[#FF2A63]/35 text-xs font-bold text-[#D41448] hover:bg-[#FFE0E8] shrink-0 cursor-pointer"
            >
              Coba Cek Lagi
            </button>
          )}
        </div>
      )}

      {/* Hasil Cek AI */}
      {report && !loading && (
        <div className="space-y-4">
          {/* Kasus 1: AI belum tersambung (GAGAL_CEK) -> Jujur & mudah dicoba ulang */}
          {report.status === "GAGAL_CEK" ? (
            <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#B45309] space-y-2.5">
              <div className="flex items-start gap-2.5">
                <WarningCircle
                  size={20}
                  weight="fill"
                  className="shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-extrabold text-sm">{getVerdictTitle(report)}</p>
                  <p className="text-[#202531] leading-relaxed">{report.summary}</p>
                </div>
              </div>
              {hasReceipt && (
                <button
                  type="button"
                  onClick={onRunCheck}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-white border border-[#FDE68A] text-xs font-extrabold text-[#B45309] hover:bg-[#FEF3C7] cursor-pointer"
                >
                  <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
                  <span>Coba Cek Lagi</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Verdict Utama */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  !report.isReceiptReadable
                    ? "bg-[#FFF0F4] border-[#FF2A63]/35 text-[#202531]"
                    : report.status === "SESUAI"
                    ? "bg-[#E6FBFB] border-[#01DAD7] text-[#202531]"
                    : report.status === "ADA_SELISIH"
                    ? "bg-[#FFFBEB] border-[#FDE68A] text-[#202531]"
                    : "bg-[#FFF0F4] border-[#FF2A63]/35 text-[#202531]"
                }`}
              >
                {!report.isReceiptReadable ||
                report.status === "NOTA_GANDA" ||
                report.status === "TERINDIKASI_EDIT" ? (
                  <XCircle
                    size={20}
                    weight="fill"
                    className="text-[#D41448] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : report.status === "SESUAI" ? (
                  <CheckCircle
                    size={20}
                    weight="fill"
                    className="text-[#006B69] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <WarningCircle
                    size={20}
                    weight="fill"
                    className="text-[#B45309] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}

                <div className="space-y-1 text-xs min-w-0 flex-1">
                  <p
                    className={`font-extrabold ${
                      !report.isReceiptReadable ||
                      report.status === "NOTA_GANDA" ||
                      report.status === "TERINDIKASI_EDIT"
                        ? "text-[#D41448]"
                        : report.status === "SESUAI"
                        ? "text-[#006B69]"
                        : "text-[#B45309]"
                    }`}
                  >
                    {getVerdictTitle(report)}
                  </p>
                  {!report.isReceiptReadable && report.detectedDocumentType && (
                    <p className="font-bold text-[#202531]">
                      Gambar terlihat seperti: {report.detectedDocumentType}
                    </p>
                  )}
                  <p className="text-[#202531] leading-relaxed">{report.summary}</p>
                  {report.editSuspicionReason && (
                    <p className="pt-1 font-semibold text-[#D41448]">
                      Catatan gambar: {report.editSuspicionReason}
                    </p>
                  )}
                  {report.duplicateInvoiceRef && (
                    <p className="pt-1 font-semibold text-[#D41448]">
                      Nota yang sama: {report.duplicateInvoiceRef}
                    </p>
                  )}
                  {report.checkedAt && (
                    <p className="text-[11px] text-[#525866] pt-0.5">
                      Dicek pada {formatDateTimeJakarta(report.checkedAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Ringkasan Toko & Total (hanya jika lampiran benar-benar nota terbaca) */}
              {report.isReceiptReadable && (
                <div className="rounded-xl border border-[#202531]/15 overflow-hidden">
                  <div className="px-3.5 py-2.5 bg-[#F8FAFC] border-b border-[#202531]/10 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#202531]">
                      Ringkasan Nota vs Input
                    </span>
                    {totalDiff !== null && (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold tabular-nums ${
                          Math.abs(totalDiff) <= 500
                            ? "bg-[#E6FBFB] text-[#006B69]"
                            : "bg-[#FFFBEB] text-[#B45309]"
                        }`}
                      >
                        {Math.abs(totalDiff) <= 500
                          ? "Total Sama"
                          : `Beda ${formatRupiah(Math.abs(totalDiff))}`}
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-[#202531]/10 text-xs bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3.5 py-2.5">
                      <div>
                        <p className="text-[11px] text-[#525866]">Toko (Input Pegawai)</p>
                        <p className="font-bold text-[#202531] mt-0.5">
                          {report.submittedSupplier || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#525866]">Toko (Tertulis di Nota)</p>
                        <p
                          className={`font-bold mt-0.5 ${
                            report.extractedSupplier ? "text-[#202531]" : "text-[#525866] font-medium"
                          }`}
                        >
                          {report.extractedSupplier || "Tidak tertulis di nota"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3.5 py-2.5">
                      <div>
                        <p className="text-[11px] text-[#525866]">Total (Input Pegawai)</p>
                        <p className="font-mono font-extrabold text-sm tabular-nums text-[#202531] mt-0.5">
                          {report.submittedTotal !== null
                            ? formatRupiah(report.submittedTotal)
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#525866]">Total (Tertulis di Nota)</p>
                        <p
                          className={`mt-0.5 ${
                            report.extractedTotal !== null
                              ? "font-mono font-extrabold text-sm tabular-nums text-[#202531]"
                              : "text-xs font-medium text-[#525866]"
                          }`}
                        >
                          {report.extractedTotal !== null
                            ? formatRupiah(report.extractedTotal)
                            : "Tidak tertulis di nota"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Perbandingan Per Barang */}
              {report.isReceiptReadable && report.items.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold text-[#202531]">
                    Pencocokan Per Barang ({report.items.length} Item)
                  </p>

                  <div className="space-y-2">
                    {report.items.map((item, idx) => {
                      const badge = getItemBadgeMeta(item.matchStatus);
                      const isMismatch =
                        item.matchStatus === "SELISIH" ||
                        item.matchStatus === "TIDAK_DITEMUKAN";

                      return (
                        <div
                          key={`${item.submittedName}-${idx}`}
                          className={`p-3 rounded-xl border text-xs space-y-2 ${
                            isMismatch
                              ? "bg-[#FFFBEB]/40 border-[#FDE68A]"
                              : "bg-[#F8FAFC] border-[#202531]/10"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold text-[#202531]">
                              {item.submittedName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          {item.matchStatus !== "RESEP_NON_NOTA" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2.5 rounded-lg bg-white border border-[#202531]/10">
                                <span className="block text-[#525866] font-semibold">
                                  Diinput Pegawai
                                </span>
                                <span className="block font-mono font-bold tabular-nums text-[#202531] mt-0.5">
                                  {item.submittedDisplayLine}
                                </span>
                              </div>

                              <div className="p-2.5 rounded-lg bg-white border border-[#202531]/10">
                                <span className="block text-[#525866] font-semibold">
                                  Tertulis di Nota
                                  {item.matchedReceiptName &&
                                  item.matchedReceiptName.toLowerCase() !==
                                    item.submittedName.toLowerCase()
                                    ? ` (${item.matchedReceiptName})`
                                    : ""}
                                </span>
                                <span className="block font-mono font-bold tabular-nums text-[#202531] mt-0.5">
                                  {item.receiptDisplayLine}
                                </span>
                              </div>
                            </div>
                          )}

                          {item.note && (
                            <p className="text-[11px] font-medium text-[#525866]">
                              <strong className="text-[#202531]">Catatan:</strong> {item.note}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Catatan netral jika nota tidak selengkap input (bukan kesalahan) */}
              {report.isReceiptReadable && report.missingReceiptInfo.length > 0 && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#202531]/15 text-xs text-[#525866] space-y-1.5">
                  <p className="font-bold text-[#202531] flex items-center gap-1.5">
                    <Info size={14} weight="bold" className="text-[#525866] shrink-0" aria-hidden="true" />
                    <span>Keterangan yang tidak tertulis di nota (wajar, bukan kesalahan):</span>
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 text-[#525866]">
                    {report.missingReceiptInfo.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Barang tambahan yang ada di nota tapi belum diinput */}
              {report.isReceiptReadable && report.unmatchedReceiptItems.length > 0 && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    report.status === "SESUAI"
                      ? "bg-[#F8FAFC] border-[#202531]/15 text-[#202531]"
                      : "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]"
                  }`}
                >
                  <p className="font-extrabold">
                    {report.status === "SESUAI"
                      ? "Barang lain yang juga terlihat di nota:"
                      : "Barang di nota yang belum masuk daftar input:"}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[#202531]">
                    {report.unmatchedReceiptItems.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Daftar tulisan mentah dari nota (dilipat agar tampilan tetap bersih) */}
              {report.isReceiptReadable && report.receiptLines.length > 0 && (
                <details className="rounded-xl border border-[#202531]/15 bg-[#F8FAFC] p-3 text-xs">
                  <summary className="font-bold text-[#202531] cursor-pointer">
                    Lihat semua tulisan yang dibaca AI dari nota ({report.receiptLines.length} baris)
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-[11px] text-[#525866] list-disc pl-4">
                    {report.receiptLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          {/* Disclaimer */}
          <p className="text-[11px] font-medium text-[#525866] flex items-center gap-1.5 pt-1">
            <Info size={14} weight="bold" className="shrink-0" aria-hidden="true" />
            <span>{report.disclaimer}</span>
          </p>
        </div>
      )}
    </section>
  );
}
