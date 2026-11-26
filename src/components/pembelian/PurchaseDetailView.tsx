"use client";

import React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { normalizePurchaseAiResult } from "@/components/ui/ReceiptAiCheckPanel";
import { isStoreAdmin } from "@/lib/rbac-shared";
import { ArrowLeft, Receipt } from "@phosphor-icons/react";
import { usePurchaseDetail } from "./usePurchaseDetail";
import { PurchaseInputForm } from "./PurchaseInputForm";
import { PurchaseInspectView } from "./PurchaseInspectView";
import { PurchaseActionBarAndModal } from "./PurchaseActionBarAndModal";

export function PurchaseDetailView({ purchaseId }: { purchaseId?: string }) {
  const detail = usePurchaseDetail(purchaseId);

  return (
    <AppShell defaultCollapsed={true}>
      {(session) => {
        const isAdmin = isStoreAdmin(session.user.role);
        const canApprove = Boolean(
          session.permissions.pembelian?.canApprove &&
            (session.user.role === "PEMILIK" ||
              session.user.role === "MANAJER" ||
              detail.submittedById !== session.user.id)
        );
        const hasReceipt = Boolean(
          detail.receiptImageData && detail.receiptImageData.trim().length > 10
        );
        const canEditReceipt =
          (detail.approvalStatus === "MENUNGGU_PERSETUJUAN" ||
            detail.approvalStatus === "PERLU_PERBAIKAN") &&
          (isAdmin || detail.submittedById === session.user.id);
        const receiptSourceLabel = !hasReceipt
          ? null
          : detail.captureMethod === "LIVE_CAMERA"
          ? "Nota Fisik"
          : "Nota Digital";

        const normalizedAiReport =
          isAdmin && detail.aiResult
            ? normalizePurchaseAiResult(detail.aiResult, {
                supplierName: detail.supplierName,
                invoiceNumber: detail.invoiceNumber,
                purchaseDate: detail.purchaseDate,
                totalAmount: detail.totalCalculated,
                items: detail.items.map((it) => ({
                  itemName: it.itemName,
                  quantity: Number(it.quantity),
                  unit: it.unit,
                  unitCost: Number(it.unitCost),
                })),
              })
            : null;

        return (
          <div className="space-y-6 pb-28">
            <div className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <Link
                    href="/pembelian"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#202531] hover:underline"
                  >
                    <ArrowLeft size={14} weight="bold" aria-hidden="true" />
                    <span>Kembali ke Daftar Pembelian</span>
                  </Link>
                  <h1 className="text-xl font-extrabold text-[#202531]">
                    {detail.isCreateMode
                      ? "Catat Pembelian Barang"
                      : detail.viewMode === "INPUT"
                      ? `Perbaiki Pengajuan #${detail.invoiceNumber}`
                      : `Tinjauan Pembelian #${detail.invoiceNumber} (${detail.supplierName})`}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!detail.isCreateMode && (
                    <>
                      {isAdmin ? (
                        <StatusBadge status={detail.aiValidationStatus} />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                          <Receipt size={12} weight="bold" aria-hidden="true" />
                          <span>{receiptSourceLabel || "Tanpa Nota"}</span>
                        </span>
                      )}
                      <StatusBadge status={detail.approvalStatus} />
                    </>
                  )}
                  {!detail.isCreateMode &&
                    (detail.approvalStatus === "MENUNGGU_PERSETUJUAN" ||
                      detail.approvalStatus === "PERLU_PERBAIKAN") && (
                      <div className="inline-flex p-1 rounded-xl bg-[#F8FAFC] border border-[#202531]/15">
                        <button
                          type="button"
                          onClick={() => detail.setViewMode("INSPECT")}
                          className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                            detail.viewMode === "INSPECT"
                              ? "bg-[#202531] text-white"
                              : "text-[#525866] hover:text-[#202531]"
                          }`}
                        >
                          Tinjau Nota
                        </button>
                        <button
                          type="button"
                          onClick={() => detail.setViewMode("INPUT")}
                          className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                            detail.viewMode === "INPUT"
                              ? "bg-[#202531] text-white"
                              : "text-[#525866] hover:text-[#202531]"
                          }`}
                        >
                          Ubah Data
                        </button>
                      </div>
                    )}
                </div>
              </div>

              {detail.ownerNotes && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#B45309] space-y-1"
                >
                  <p className="font-extrabold">Catatan Pemilik / Manajer:</p>
                  <p className="font-medium">{detail.ownerNotes}</p>
                </div>
              )}
            </div>

            {detail.loading ? (
              <div className="bg-white rounded-2xl border border-[#202531]/15 p-10 text-center text-xs text-[#525866]">
                Memuat detail pembelian...
              </div>
            ) : detail.viewMode === "INPUT" ? (
              <PurchaseInputForm
                supplierName={detail.supplierName}
                onSupplierNameChange={detail.setSupplierName}
                purchaseDate={detail.purchaseDate}
                onPurchaseDateChange={detail.setPurchaseDate}
                invoiceNumber={detail.invoiceNumber}
                onInvoiceNumberChange={detail.setInvoiceNumber}
                fundingSource={detail.fundingSource}
                onFundingSourceChange={detail.setFundingSource}
                items={detail.items}
                products={detail.products}
                units={detail.units}
                totalCalculated={detail.totalCalculated}
                hasReceipt={hasReceipt}
                receiptImageData={detail.receiptImageData}
                captureMethod={detail.captureMethod}
                onAddRow={detail.handleAddRow}
                onRemoveRow={detail.handleRemoveRow}
                onSelectExistingProduct={detail.handleSelectExistingProduct}
                onUpdateRow={(rowKey, patch) =>
                  detail.setItems((prev) =>
                    prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r))
                  )
                }
                onOpenCamera={() => detail.setCameraModalOpen(true)}
                onUploadFile={(file) => detail.handleDigitalFileChange(file, false)}
                onRemoveReceipt={() => {
                  detail.setReceiptImageData("");
                  detail.setCaptureMethod("TANPA_NOTA");
                }}
              />
            ) : (
              <PurchaseInspectView
                invoiceNumber={detail.invoiceNumber}
                purchaseDate={detail.purchaseDate}
                fundingSource={detail.fundingSource}
                submittedByName={detail.submittedByName || session.user.name}
                items={detail.items}
                totalCalculated={detail.totalCalculated}
                hasReceipt={hasReceipt}
                receiptImageData={detail.receiptImageData}
                receiptSourceLabel={receiptSourceLabel}
                canEditReceipt={canEditReceipt}
                savingReceipt={detail.savingReceipt}
                isAdmin={isAdmin}
                normalizedAiReport={normalizedAiReport}
                scanningAi={detail.scanningAi}
                aiError={detail.aiError}
                onOpenCamera={() => detail.setCameraModalOpen(true)}
                onUploadFile={(file) => detail.handleDigitalFileChange(file, true)}
                onRemoveReceipt={() => {
                  void detail.persistInspectReceiptUpdate(null, "TANPA_NOTA");
                }}
                onRunAiCheck={detail.handleRunAiCheck}
              />
            )}

            <PurchaseActionBarAndModal
              totalCalculated={detail.totalCalculated}
              viewMode={detail.viewMode}
              isCreateMode={detail.isCreateMode}
              canApprove={canApprove}
              approvalStatus={detail.approvalStatus}
              submitting={detail.submitting}
              mounted={detail.mounted}
              cameraModalOpen={detail.cameraModalOpen}
              pendingNoteAction={detail.pendingNoteAction}
              decisionNoteInput={detail.decisionNoteInput}
              onSubmitPurchase={detail.handleSubmitPurchase}
              onApprove={() => detail.handleOwnerDecision("DISETUJUI")}
              onStartNoteAction={(action) => {
                detail.setDecisionNoteInput("");
                detail.setPendingNoteAction(action);
              }}
              onCloseNoteModal={() => {
                detail.setPendingNoteAction(null);
                detail.setDecisionNoteInput("");
              }}
              onDecisionNoteChange={detail.setDecisionNoteInput}
              onConfirmNoteDecision={detail.handleOwnerDecision}
              onCloseCamera={() => detail.setCameraModalOpen(false)}
              onCameraCapture={detail.handleCameraCapture}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
