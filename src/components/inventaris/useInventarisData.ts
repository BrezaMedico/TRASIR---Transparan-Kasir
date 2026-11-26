"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import type {
  AdjustmentType,
  BlindCountProd,
  InventoryProduct,
  OpnameItemRow,
  OpnameSessionRow,
  StockAdjustmentRow,
} from "./types";

interface InventoryApiPayload {
  products?: InventoryProduct[];
  blindCountProducts?: BlindCountProd[];
  warehouses?: { id: string; name: string }[];
  adjustments?: StockAdjustmentRow[];
  opnameSessions?: OpnameSessionRow[];
  toleranceThresholdRp?: number;
  opnameSchedule?: string;
}

export function useInventarisData() {
  const { showToast } = useToast();
  const cachedInv = getCachedData<InventoryApiPayload>("/api/inventory");

  const [products, setProducts] = useState<InventoryProduct[]>(cachedInv?.products || []);
  const [blindProducts, setBlindProducts] = useState<BlindCountProd[]>(
    cachedInv?.blindCountProducts || []
  );
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>(
    cachedInv?.warehouses || []
  );
  const [adjustments, setAdjustments] = useState<StockAdjustmentRow[]>(
    cachedInv?.adjustments || []
  );
  const [opnameSessions, setOpnameSessions] = useState<OpnameSessionRow[]>(
    cachedInv?.opnameSessions || []
  );
  const [toleranceThresholdRp, setToleranceThresholdRp] = useState(
    cachedInv?.toleranceThresholdRp ?? 50000
  );
  const [opnameSchedule, setOpnameSchedule] = useState(cachedInv?.opnameSchedule ?? "MINGGUAN");
  const [loading, setLoading] = useState(!cachedInv);

  const [adjProductId, setAdjProductId] = useState("");
  const [adjType, setAdjType] = useState<AdjustmentType>("RUSAK");
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState("");
  const [adjProof, setAdjProof] = useState<string>("");
  const [fromWhId, setFromWhId] = useState("");
  const [toWhId, setToWhId] = useState("");
  const [submittingAdj, setSubmittingAdj] = useState(false);

  const [blindModeActive, setBlindModeActive] = useState(false);
  const [opnameTitle, setOpnameTitle] = useState(() => `Audit Stok Fisik ${getJakartaDateKey()}`);
  const [physicalInputs, setPhysicalInputs] = useState<Record<string, string>>({});
  const [submittingOpname, setSubmittingOpname] = useState(false);

  const [selectedAnomaly, setSelectedAnomaly] = useState<OpnameItemRow | null>(null);
  const [explanationText, setExplanationText] = useState("");
  const [explanationProof, setExplanationProof] = useState<string>("");
  const [ownerNotesInput, setOwnerNotesInput] = useState("");
  const [syncPhysicalStock, setSyncPhysicalStock] = useState(true);
  const [submittingAnomaly, setSubmittingAnomaly] = useState(false);

  const loadInventory = useCallback(async () => {
    const hasCached = Boolean(getCachedData("/api/inventory"));
    if (!hasCached) setLoading(true);
    try {
      const { ok, data } = await fetchJsonCached<InventoryApiPayload>("/api/inventory", {
        force: true,
      });
      if (ok) {
        setProducts(data.products || []);
        setBlindProducts(data.blindCountProducts || []);
        setWarehouses(data.warehouses || []);
        setAdjustments(data.adjustments || []);
        setOpnameSessions(data.opnameSessions || []);
        setToleranceThresholdRp(data.toleranceThresholdRp ?? 50000);
        setOpnameSchedule(data.opnameSchedule ?? "MINGGUAN");
        if (data.products?.[0]) {
          const fallbackId = data.products[0].id;
          setAdjProductId((prev) => prev || fallbackId);
        }
      }
    } catch {
      if (!hasCached) showToast("Gagal memuat data inventaris.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleFileToDataUrl = async (file: File | null, cb: (url: string) => void) => {
    if (!file) return;
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        showToast(result.error || "Gagal memproses foto bukti.", "error");
        return;
      }
      cb(result.dataUrl);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memproses foto bukti.", "error");
    }
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || !adjReason.trim()) {
      showToast("Pilih produk dan isi alasan perubahan stok.", "error");
      return;
    }
    if (!adjProof) {
      showToast("Bukti foto pendukung wajib dilampirkan untuk pengajuan perubahan stok.", "error");
      return;
    }
    setSubmittingAdj(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REQUEST_ADJUSTMENT",
          productId: adjProductId,
          adjustmentType: adjType,
          quantity: Number(adjQty),
          reason: adjReason,
          proofImageData: adjProof,
          fromWarehouseId: fromWhId || null,
          toWarehouseId: toWhId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengajukan perubahan stok.", "error");
        return;
      }
      showToast("Pengajuan perubahan stok berhasil dikirim untuk persetujuan Pemilik.", "success");
      setAdjReason("");
      setAdjProof("");
      setAdjQty(1);
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAdj(false);
    }
  };

  const handleReviewAdjustment = async (id: string, decision: "DISETUJUI" | "DITOLAK") => {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REVIEW_ADJUSTMENT", adjustmentId: id, decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan.", "error");
        return;
      }
      showToast(
        decision === "DISETUJUI"
          ? "Perubahan stok disetujui dan catatan inventaris telah diperbarui."
          : "Pengajuan perubahan stok ditolak.",
        "success"
      );
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    }
  };

  const handleStartBlindOpname = () => {
    const init: Record<string, string> = {};
    for (const bp of blindProducts) init[bp.id] = "";
    setPhysicalInputs(init);
    setBlindModeActive(true);
  };

  const handleSubmitBlindOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    const counts = blindProducts
      .filter((bp) => physicalInputs[bp.id] !== undefined && physicalInputs[bp.id] !== "")
      .map((bp) => ({ productId: bp.id, physicalStock: Number(physicalInputs[bp.id]) }));
    if (counts.length === 0) {
      showToast("Masukkan hasil hitung fisik minimal untuk 1 barang.", "error");
      return;
    }
    setSubmittingOpname(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_OPNAME",
          title: opnameTitle,
          scheduleType: opnameSchedule,
          counts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan hasil stok opname.", "error");
        return;
      }
      showToast(
        "Stok Opname Fisik (Blind Count) berhasil dikirim! Perbandingan fisik vs sistem kini ditampilkan.",
        "success"
      );
      setBlindModeActive(false);
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingOpname(false);
    }
  };

  const openAnomalyDrawer = (item: OpnameItemRow) => {
    setSelectedAnomaly(item);
    setExplanationText(item.employeeExplanation || "");
    setExplanationProof(item.proofImageData || "");
    setOwnerNotesInput(item.ownerNotes || "");
    setSyncPhysicalStock(true);
  };

  const handleSaveEmployeeExplanation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnomaly) return;
    setSubmittingAnomaly(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EXPLAIN_OPNAME_ITEM",
          opnameItemId: selectedAnomaly.id,
          employeeExplanation: explanationText,
          proofImageData: explanationProof || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan penjelasan pegawai.", "error");
        return;
      }
      showToast("Penjelasan & bukti pendukung selisih stok berhasil disimpan.", "success");
      setSelectedAnomaly(null);
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAnomaly(false);
    }
  };

  const handleOwnerEvaluateAnomaly = async (
    ownerDecision: "TERIMA_PENJELASAN" | "MINTA_INFO_TAMBAHAN" | "TANDAI_TINDAK_LANJUT"
  ) => {
    if (!selectedAnomaly) return;
    setSubmittingAnomaly(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EVALUATE_OPNAME_ITEM",
          opnameItemId: selectedAnomaly.id,
          ownerDecision,
          ownerNotes: ownerNotesInput,
          syncPhysicalToSystem: syncPhysicalStock,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan keputusan evaluasi.", "error");
        return;
      }
      showToast(
        `Evaluasi Pemilik (${ownerDecision.replace(/_/g, " ")}) berhasil disimpan.`,
        "success"
      );
      setSelectedAnomaly(null);
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAnomaly(false);
    }
  };

  return {
    products,
    blindProducts,
    warehouses,
    adjustments,
    opnameSessions,
    toleranceThresholdRp,
    opnameSchedule,
    loading,
    adjProductId,
    setAdjProductId,
    adjType,
    setAdjType,
    adjQty,
    setAdjQty,
    adjReason,
    setAdjReason,
    adjProof,
    setAdjProof,
    fromWhId,
    setFromWhId,
    toWhId,
    setToWhId,
    submittingAdj,
    blindModeActive,
    setBlindModeActive,
    opnameTitle,
    setOpnameTitle,
    physicalInputs,
    setPhysicalInputs,
    submittingOpname,
    selectedAnomaly,
    setSelectedAnomaly,
    explanationText,
    setExplanationText,
    explanationProof,
    setExplanationProof,
    ownerNotesInput,
    setOwnerNotesInput,
    syncPhysicalStock,
    setSyncPhysicalStock,
    submittingAnomaly,
    handleFileToDataUrl,
    handleSubmitAdjustment,
    handleReviewAdjustment,
    handleStartBlindOpname,
    handleSubmitBlindOpname,
    openAnomalyDrawer,
    handleSaveEmployeeExplanation,
    handleOwnerEvaluateAnomaly,
  };
}

