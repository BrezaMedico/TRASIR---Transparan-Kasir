"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ArrowsLeftRight, ClipboardText, Package } from "@phosphor-icons/react";
import { useInventarisData } from "@/components/inventaris/useInventarisData";
import { InventoryCurrentTab } from "@/components/inventaris/InventoryCurrentTab";
import { InventoryAdjustmentsTab } from "@/components/inventaris/InventoryAdjustmentsTab";
import { InventoryOpnameTab } from "@/components/inventaris/InventoryOpnameTab";
import { InventoryAnomalyDrawer } from "@/components/inventaris/InventoryAnomalyDrawer";

export default function InventarisPage() {
  const inv = useInventarisData();
  const [activeTab, setActiveTab] = useState<"current" | "adjustments" | "opname">("current");
  const [areaFilter, setAreaFilter] = useState("ALL");

  return (
    <AppShell>
      {(session) => {
        const canApprove = Boolean(session.permissions.inventaris?.canApprove);
        const canCreate = Boolean(session.permissions.inventaris?.canCreate);

        const filteredProducts = inv.products.filter((p) => {
          if (areaFilter !== "ALL" && p.category.areaType !== areaFilter) return false;
          return true;
        });

        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Inventaris, Perubahan Stok &amp; Stok Opname (Blind Count)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Posisi stok real-time, gerbang persetujuan perubahan stok non-penjualan, serta audit fisik objektif berbasis Area Terbuka vs Area Tertutup
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="inv-area-filter" className="sr-only">
                    Filter Area Pengawasan
                  </label>
                  <select
                    id="inv-area-filter"
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                  >
                    <option value="ALL">Semua Area (Terbuka &amp; Tertutup)</option>
                    <option value="TERBUKA">Area Terbuka (Akses Pelanggan)</option>
                    <option value="TERTUTUP">Area Tertutup (Khusus Pegawai)</option>
                  </select>
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Menu Inventaris & Audit Stok"
                className="flex flex-wrap gap-2 pt-2 border-t border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "current"}
                  onClick={() => setActiveTab("current")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "current"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Package size={16} weight="bold" aria-hidden="true" />
                  <span>Stok Saat Ini ({filteredProducts.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "adjustments"}
                  onClick={() => setActiveTab("adjustments")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "adjustments"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ArrowsLeftRight size={16} weight="bold" aria-hidden="true" />
                  <span>
                    Pengajuan Perubahan Stok (
                    {inv.adjustments.filter((a) => a.status === "MENUNGGU_PERSETUJUAN").length}{" "}
                    Menunggu)
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "opname"}
                  onClick={() => setActiveTab("opname")}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "opname"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ClipboardText size={16} weight="bold" aria-hidden="true" />
                  <span>Stok Opname &amp; Audit Fisik (Blind Count)</span>
                </button>
              </div>
            </div>

            {activeTab === "current" && (
              <InventoryCurrentTab loading={inv.loading} filteredProducts={filteredProducts} />
            )}

            {activeTab === "adjustments" && (
              <InventoryAdjustmentsTab
                canCreate={canCreate}
                canApprove={canApprove}
                currentUserId={session.user.id}
                currentUserRole={session.user.role}
                products={inv.products}
                warehouses={inv.warehouses}
                adjustments={inv.adjustments}
                adjProductId={inv.adjProductId}
                onAdjProductIdChange={inv.setAdjProductId}
                adjType={inv.adjType}
                onAdjTypeChange={inv.setAdjType}
                adjQty={inv.adjQty}
                onAdjQtyChange={inv.setAdjQty}
                adjReason={inv.adjReason}
                onAdjReasonChange={inv.setAdjReason}
                adjProof={inv.adjProof}
                onAdjProofUpload={(file) => inv.handleFileToDataUrl(file, inv.setAdjProof)}
                fromWhId={inv.fromWhId}
                onFromWhIdChange={inv.setFromWhId}
                toWhId={inv.toWhId}
                onToWhIdChange={inv.setToWhId}
                submittingAdj={inv.submittingAdj}
                onSubmitAdjustment={inv.handleSubmitAdjustment}
                onReviewAdjustment={inv.handleReviewAdjustment}
              />
            )}

            {activeTab === "opname" && (
              <InventoryOpnameTab
                canCreate={canCreate}
                opnameSchedule={inv.opnameSchedule}
                toleranceThresholdRp={inv.toleranceThresholdRp}
                blindModeActive={inv.blindModeActive}
                opnameTitle={inv.opnameTitle}
                blindProducts={inv.blindProducts}
                physicalInputs={inv.physicalInputs}
                submittingOpname={inv.submittingOpname}
                opnameSessions={inv.opnameSessions}
                onStartBlindOpname={inv.handleStartBlindOpname}
                onCancelBlindOpname={() => inv.setBlindModeActive(false)}
                onOpnameTitleChange={inv.setOpnameTitle}
                onPhysicalInputChange={(productId, val) =>
                  inv.setPhysicalInputs((prev) => ({ ...prev, [productId]: val }))
                }
                onSubmitBlindOpname={inv.handleSubmitBlindOpname}
                onOpenAnomaly={inv.openAnomalyDrawer}
              />
            )}

            <InventoryAnomalyDrawer
              selectedAnomaly={inv.selectedAnomaly}
              canApprove={canApprove}
              explanationText={inv.explanationText}
              explanationProof={inv.explanationProof}
              ownerNotesInput={inv.ownerNotesInput}
              syncPhysicalStock={inv.syncPhysicalStock}
              submittingAnomaly={inv.submittingAnomaly}
              onClose={() => inv.setSelectedAnomaly(null)}
              onExplanationTextChange={inv.setExplanationText}
              onExplanationProofUpload={(file) =>
                inv.handleFileToDataUrl(file, inv.setExplanationProof)
              }
              onOwnerNotesChange={inv.setOwnerNotesInput}
              onSyncPhysicalChange={inv.setSyncPhysicalStock}
              onSaveExplanation={inv.handleSaveEmployeeExplanation}
              onOwnerEvaluate={inv.handleOwnerEvaluateAnomaly}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
