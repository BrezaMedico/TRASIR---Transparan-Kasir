"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import {
  ReceiptAiCheckPanel,
  type NormalizedReceiptAiReport,
} from "@/components/ui/ReceiptAiCheckPanel";
import { formatDateJakarta, formatNumber, formatRupiah } from "@/lib/format";
import type { PurchaseInputRow } from "./types";

interface PurchaseInspectViewProps {
  invoiceNumber: string;
  purchaseDate: string;
  fundingSource: "DANA_TOKO" | "BELANJA_PEMILIK";
  submittedByName: string;
  items: PurchaseInputRow[];
  totalCalculated: number;
  hasReceipt: boolean;
  receiptImageData: string;
  receiptSourceLabel: "Nota Fisik" | "Nota Digital" | null;
  canEditReceipt: boolean;
  savingReceipt: boolean;
  isAdmin: boolean;
  normalizedAiReport: NormalizedReceiptAiReport | null;
  scanningAi: boolean;
  aiError: string | null;
  onOpenCamera: () => void;
  onUploadFile: (file: File | null) => void;
  onRemoveReceipt: () => void;
  onRunAiCheck: () => void;
}

export function PurchaseInspectView({
  invoiceNumber,
  purchaseDate,
  fundingSource,
  submittedByName,
  items,
  totalCalculated,
  hasReceipt,
  receiptImageData,
  receiptSourceLabel,
  canEditReceipt,
  savingReceipt,
  isAdmin,
  normalizedAiReport,
  scanningAi,
  aiError,
  onOpenCamera,
  onUploadFile,
  onRemoveReceipt,
  onRunAiCheck,
}: PurchaseInspectViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-6 lg:sticky lg:top-6 space-y-4">
        <ReceiptViewer
          receiptImageData={receiptImageData}
          sourceLabel={receiptSourceLabel}
          altText={`Lampiran nota pembelian ${invoiceNumber}`}
          canAttachManual={canEditReceipt}
          canReplace={canEditReceipt}
          replacing={savingReceipt}
          onOpenCamera={canEditReceipt ? onOpenCamera : undefined}
          onUploadFile={canEditReceipt ? onUploadFile : undefined}
          onRemove={canEditReceipt ? onRemoveReceipt : undefined}
        />
      </div>

      <div className="lg:col-span-6 space-y-5">
        {isAdmin && (
          <ReceiptAiCheckPanel
            hasReceipt={hasReceipt}
            report={normalizedAiReport}
            loading={scanningAi}
            errorMessage={aiError}
            onRunCheck={onRunAiCheck}
          />
        )}

        <div className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202531]/10 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-[#202531]">
                Daftar Barang yang Diinput Pegawai
              </h2>
              <p className="text-xs text-[#525866]">
                Oleh <strong className="text-[#202531]">{submittedByName}</strong> •{" "}
                {formatDateJakarta(purchaseDate)}
              </p>
            </div>
            <StatusBadge status={fundingSource} />
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#202531]/10 bg-[#F8FAFC] text-[11px] font-bold uppercase text-[#525866]">
                  <th className="py-3 px-3">Nama Barang</th>
                  <th className="py-3 px-3 text-right">Jumlah</th>
                  <th className="py-3 px-3 text-right">Harga Beli</th>
                  <th className="py-3 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202531]/10">
                {items.map((it) => {
                  const rowSub = Math.round(it.quantity * it.unitCost);
                  return (
                    <tr key={it.rowKey}>
                      <td className="py-3 px-3">
                        <p className="font-bold text-[#202531]">{it.itemName}</p>
                        {it.conversionRatio > 1 && (
                          <p className="text-[11px] text-[#525866]">
                            1 {it.unit} isi {it.conversionRatio} {it.sellUnit}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#202531]">
                        {formatNumber(it.quantity)} {it.unit}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#202531]">
                        {formatRupiah(it.unitCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold tabular-nums text-[#202531]">
                        {formatRupiah(rowSub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-2">
            {items.map((it) => {
              const rowSub = Math.round(it.quantity * it.unitCost);
              return (
                <div
                  key={it.rowKey}
                  className="p-3 rounded-xl bg-[#F8FAFC] border border-[#202531]/10 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#202531]">{it.itemName}</span>
                    <span className="font-mono font-extrabold tabular-nums text-[#202531]">
                      {formatRupiah(rowSub)}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-[#525866]">
                    {formatNumber(it.quantity)} {it.unit} x {formatRupiah(it.unitCost)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#202531]">Total Belanja Diinput</span>
            <span className="text-lg font-extrabold font-mono tabular-nums text-[#202531]">
              {formatRupiah(totalCalculated)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
