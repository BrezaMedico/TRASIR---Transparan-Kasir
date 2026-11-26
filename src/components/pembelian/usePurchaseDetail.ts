"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/layout/AppShell";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import type { AIReceiptValidationResult } from "@/lib/gemini";
import {
  createEmptyPurchaseRow,
  type PurchaseCatalogProd,
  type PurchaseInputRow,
  type PurchaseUnitOption,
} from "./types";

export function usePurchaseDetail(purchaseId?: string) {
  const router = useRouter();
  const { showToast } = useToast();
  const isCreateMode = !purchaseId || purchaseId === "input";

  const [viewMode, setViewMode] = useState<"INPUT" | "INSPECT">(isCreateMode ? "INPUT" : "INSPECT");
  const [loading, setLoading] = useState(!isCreateMode);
  const [products, setProducts] = useState<PurchaseCatalogProd[]>([]);
  const [units, setUnits] = useState<PurchaseUnitOption[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => getJakartaDateKey());
  const [fundingSource, setFundingSource] = useState<"DANA_TOKO" | "BELANJA_PEMILIK">("DANA_TOKO");
  const [captureMethod, setCaptureMethod] = useState<
    "LIVE_CAMERA" | "DIGITAL_UPLOAD" | "TANPA_NOTA"
  >("TANPA_NOTA");
  const [receiptImageData, setReceiptImageData] = useState<string>("");
  const [items, setItems] = useState<PurchaseInputRow[]>(() => [createEmptyPurchaseRow("row-1")]);

  const [approvalStatus, setApprovalStatus] = useState<string>("MENUNGGU_PERSETUJUAN");
  const [aiValidationStatus, setAiValidationStatus] = useState<string>("TANPA_NOTA");
  const [ownerNotes, setOwnerNotes] = useState<string>("");
  const [submittedByName, setSubmittedByName] = useState<string>("");
  const [submittedById, setSubmittedById] = useState<string>("");
  const [aiResult, setAiResult] = useState<AIReceiptValidationResult | null>(null);
  const [scanningAi, setScanningAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [decisionNoteInput, setDecisionNoteInput] = useState("");
  const [pendingNoteAction, setPendingNoteAction] = useState<
    "PERLU_PERBAIKAN" | "DITOLAK" | null
  >(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pendingNoteAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) setPendingNoteAction(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingNoteAction, submitting]);

  const loadData = useCallback(async () => {
    try {
      const prodRes = await fetch("/api/products", { cache: "no-store" });
      const prodJson = await prodRes.json();
      if (prodRes.ok) {
        setProducts(prodJson.products || []);
        setUnits(prodJson.units || []);
      }

      if (!isCreateMode && purchaseId) {
        setLoading(true);
        const [pRes, rRes] = await Promise.all([
          fetch(`/api/purchases?id=${purchaseId}`, { cache: "no-store" }),
          fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/receipt`, { cache: "no-store" }),
        ]);
        const pJson = await pRes.json();
        const rJson = rRes.ok ? await rRes.json().catch(() => null) : null;
        if (pRes.ok && pJson.purchase) {
          const p = pJson.purchase;
          const resolvedReceipt =
            rJson?.receiptImageData || rJson?.receiptUrl || p.receiptUrl || "";
          setInvoiceNumber(p.invoiceNumber);
          setSupplierName(p.supplierName);
          setPurchaseDate(getJakartaDateKey(p.purchaseDate));
          setFundingSource(p.fundingSource);
          setCaptureMethod(p.captureMethod || (resolvedReceipt ? "DIGITAL_UPLOAD" : "TANPA_NOTA"));
          setReceiptImageData(resolvedReceipt);
          setApprovalStatus(p.approvalStatus);
          setAiValidationStatus(
            p.aiValidationStatus || (resolvedReceipt ? "BELUM_DICEK" : "TANPA_NOTA")
          );
          setOwnerNotes(p.ownerNotes || "");
          setSubmittedByName(p.submittedBy?.name || "Pegawai");
          setSubmittedById(p.submittedById || "");

          if (p.aiAnalysisJson) {
            try {
              setAiResult(JSON.parse(p.aiAnalysisJson));
            } catch {
              setAiResult(null);
            }
          } else {
            setAiResult(null);
          }

          if (Array.isArray(p.items) && p.items.length > 0) {
            setItems(
              p.items.map(
                (
                  it: {
                    id: string;
                    productId: string | null;
                    isNewProduct: boolean;
                    itemName: string;
                    quantity: number;
                    unit: string;
                    conversionRatio: number;
                    sellUnit: string;
                    unitCost: number;
                    sellPrice: number;
                  },
                  idx: number
                ) => ({
                  rowKey: it.id || `row-${idx}`,
                  productId: it.productId,
                  isNewProduct: it.isNewProduct,
                  itemName: it.itemName,
                  quantity: it.quantity,
                  unit: it.unit,
                  conversionRatio: it.conversionRatio || 1,
                  sellUnit: it.sellUnit || it.unit,
                  unitCost: it.unitCost,
                  sellPrice: it.sellPrice || 0,
                  showSplitOption: (it.conversionRatio || 1) > 1,
                })
              )
            );
          }
          setViewMode(p.approvalStatus === "PERLU_PERBAIKAN" ? "INPUT" : "INSPECT");
        }
      }
    } catch {
      showToast("Gagal memuat data pembelian.", "error");
    } finally {
      setLoading(false);
    }
  }, [isCreateMode, purchaseId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalCalculated = items.reduce(
    (sum, it) => sum + Math.round((Number(it.quantity) || 0) * (Number(it.unitCost) || 0)),
    0
  );

  const handleAddRow = (asNewProduct: boolean) => {
    setItems((prev) => [
      ...prev,
      { ...createEmptyPurchaseRow(`row-${Date.now()}-${Math.random()}`), isNewProduct: asNewProduct },
    ]);
  };

  const handleRemoveRow = (rowKey: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  const handleSelectExistingProduct = (rowKey: string, prodId: string) => {
    const found = products.find((p) => p.id === prodId);
    setItems((prev) =>
      prev.map((row) => {
        if (row.rowKey !== rowKey) return row;
        if (!found) return { ...row, productId: null, isNewProduct: true };
        return {
          ...row,
          productId: found.id,
          isNewProduct: false,
          itemName: found.name,
          unit: found.purchaseUnit,
          conversionRatio: found.conversionRatio,
          sellUnit: found.sellUnit,
          unitCost: Math.round(found.costPrice * found.conversionRatio),
          sellPrice: found.sellPrice,
        };
      })
    );
  };

  const persistInspectReceiptUpdate = async (
    nextDataUrl: string | null,
    nextCapture: "LIVE_CAMERA" | "DIGITAL_UPLOAD" | "TANPA_NOTA"
  ) => {
    if (isCreateMode || !purchaseId) return;
    setSavingReceipt(true);
    try {
      const res = await fetch("/api/purchases/receipt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId,
          receiptImageData: nextDataUrl,
          captureMethod: nextCapture,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memperbarui lampiran nota.", "error");
        return;
      }
      setReceiptImageData(nextDataUrl || "");
      setCaptureMethod(nextCapture);
      setAiResult(null);
      setAiError(null);
      setAiValidationStatus(nextDataUrl ? "BELUM_DICEK" : "TANPA_NOTA");
      showToast(
        nextDataUrl ? "Lampiran nota berhasil diperbarui." : "Lampiran nota berhasil dihapus.",
        "success"
      );
    } catch {
      showToast("Gagal menghubungi server saat memperbarui nota.", "error");
    } finally {
      setSavingReceipt(false);
    }
  };

  const handleDigitalFileChange = async (file: File | null, isFromInspect = false) => {
    if (!file) return;
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        showToast(result.error || "Gagal memproses berkas nota.", "error");
        return;
      }
      if (isFromInspect && !isCreateMode && purchaseId) {
        await persistInspectReceiptUpdate(result.dataUrl, "DIGITAL_UPLOAD");
        return;
      }
      setReceiptImageData(result.dataUrl);
      setCaptureMethod("DIGITAL_UPLOAD");
      showToast(`Nota digital "${file.name}" dilampirkan.`, "success");
    } catch {
      showToast("Gagal memproses berkas nota.", "error");
    }
  };

  const handleRunAiCheck = async () => {
    if (!receiptImageData) {
      showToast("Lampirkan foto nota fisik atau file nota digital terlebih dahulu.", "error");
      return;
    }
    setScanningAi(true);
    setAiError(null);
    try {
      const res = await fetch("/api/purchases/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: isCreateMode ? undefined : purchaseId,
          invoiceNumber: invoiceNumber || "NOTA-BARU",
          supplierName: supplierName || "Pemasok",
          purchaseDate,
          totalAmount: totalCalculated,
          receiptImageData,
          captureMethod: captureMethod === "TANPA_NOTA" ? "DIGITAL_UPLOAD" : captureMethod,
          items: items.map((it) => ({
            itemName: it.itemName,
            quantity: Number(it.quantity),
            unit: it.unit,
            unitCost: Number(it.unitCost),
            subtotal: Math.round(Number(it.quantity) * Number(it.unitCost)),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "Gagal memeriksa nota dengan AI.";
        setAiError(msg);
        showToast(msg, "error");
        return;
      }
      setAiResult(data.analysis);
      setAiValidationStatus(data.analysis.status);
      if (data.analysis?.status === "GAGAL_CEK") {
        showToast("AI Gemini belum tersambung saat ini. Coba cek ulang.", "info");
      } else if (data.analysis?.status === "SESUAI") {
        showToast("Hasil cek AI: cocok dengan nota.", "success");
      } else {
        showToast("Hasil cek AI: ada yang berbeda atau perlu dicek.", "info");
      }
    } catch {
      const msg = "Gagal menghubungi layanan AI Gemini. Coba beberapa saat lagi.";
      setAiError(msg);
      showToast(msg, "error");
    } finally {
      setScanningAi(false);
    }
  };

  const handleSubmitPurchase = async () => {
    if (!supplierName.trim()) {
      showToast("Nama toko atau pemasok wajib diisi.", "error");
      return;
    }
    const resolvedInvoice =
      invoiceNumber.trim() ||
      `NOTA-${purchaseDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

    if (items.some((i) => !i.itemName.trim() || i.quantity <= 0)) {
      showToast("Pastikan nama barang dan jumlah beli sudah diisi benar.", "error");
      return;
    }

    const hasReceipt = Boolean(receiptImageData && receiptImageData.trim().length > 10);
    const resolvedCapture = hasReceipt
      ? captureMethod === "TANPA_NOTA"
        ? "DIGITAL_UPLOAD"
        : captureMethod
      : "TANPA_NOTA";

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isCreateMode ? undefined : purchaseId,
          invoiceNumber: resolvedInvoice,
          supplierName,
          purchaseDate,
          fundingSource,
          captureMethod: resolvedCapture,
          receiptImageData: hasReceipt ? receiptImageData : null,
          totalAmount: totalCalculated,
          items: items.map((it) => ({
            productId: it.productId,
            isNewProduct: it.isNewProduct,
            itemName: it.itemName,
            quantity: Number(it.quantity),
            unit: it.unit,
            conversionRatio: Number(it.conversionRatio) || 1,
            sellUnit: it.sellUnit || it.unit,
            unitCost: Math.round(Number(it.unitCost)),
            sellPrice: Math.round(Number(it.sellPrice)),
            subtotal: Math.round(Number(it.quantity) * Number(it.unitCost)),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan pengajuan pembelian.", "error");
        return;
      }
      showToast(`Pengajuan pembelian #${data.purchase.invoiceNumber} berhasil dikirim.`, "success");
      router.push(`/pembelian/${data.purchase.id}`);
      if (!isCreateMode) await loadData();
    } catch {
      showToast("Terjadi kesalahan jaringan saat mengirim pengajuan.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerDecision = async (decision: "DISETUJUI" | "PERLU_PERBAIKAN" | "DITOLAK") => {
    if (!purchaseId) return;
    if ((decision === "PERLU_PERBAIKAN" || decision === "DITOLAK") && !decisionNoteInput.trim()) {
      showToast("Harap isi catatan perbaikan atau alasan penolakan di kolom catatan.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, decision, ownerNotes: decisionNoteInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan Pemilik.", "error");
        return;
      }
      showToast(
        decision === "DISETUJUI"
          ? "Pembelian disetujui! Stok barang dan laporan langsung diperbarui."
          : `Status pembelian diperbarui menjadi ${decision.replace("_", " ")}.`,
        "success"
      );
      setPendingNoteAction(null);
      setDecisionNoteInput("");
      await loadData();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraCapture = (dataUrl: string) => {
    if (viewMode === "INSPECT" && !isCreateMode && purchaseId) {
      void persistInspectReceiptUpdate(dataUrl, "LIVE_CAMERA");
      return;
    }
    setReceiptImageData(dataUrl);
    setCaptureMethod("LIVE_CAMERA");
    setAiResult(null);
    setAiError(null);
    showToast("Foto nota fisik dilampirkan.", "success");
  };

  return {
    isCreateMode,
    viewMode,
    setViewMode,
    loading,
    products,
    units,
    invoiceNumber,
    setInvoiceNumber,
    supplierName,
    setSupplierName,
    purchaseDate,
    setPurchaseDate,
    fundingSource,
    setFundingSource,
    captureMethod,
    setCaptureMethod,
    receiptImageData,
    setReceiptImageData,
    items,
    setItems,
    approvalStatus,
    aiValidationStatus,
    ownerNotes,
    submittedByName,
    submittedById,
    aiResult,
    scanningAi,
    aiError,
    submitting,
    savingReceipt,
    cameraModalOpen,
    setCameraModalOpen,
    decisionNoteInput,
    setDecisionNoteInput,
    pendingNoteAction,
    setPendingNoteAction,
    mounted,
    totalCalculated,
    handleAddRow,
    handleRemoveRow,
    handleSelectExistingProduct,
    persistInspectReceiptUpdate,
    handleDigitalFileChange,
    handleRunAiCheck,
    handleSubmitPurchase,
    handleOwnerDecision,
    handleCameraCapture,
  };
}

