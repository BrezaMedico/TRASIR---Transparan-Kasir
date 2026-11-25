"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import {
  ReceiptAiCheckPanel,
  normalizePurchaseAiResult,
} from "@/components/ui/ReceiptAiCheckPanel";
import { formatDateJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import { isStoreAdmin } from "@/lib/rbac-shared";
import type { AIReceiptValidationResult } from "@/lib/gemini";
import {
  ArrowLeft,
  Camera,
  CaretDown,
  CaretUp,
  CheckCircle,
  PaperPlaneRight,
  Plus,
  Receipt,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";

interface InputRow {
  rowKey: string;
  productId: string | null;
  isNewProduct: boolean;
  itemName: string;
  quantity: number;
  unit: string;
  conversionRatio: number;
  sellUnit: string;
  unitCost: number;
  sellPrice: number;
  showSplitOption?: boolean;
}

interface CatalogProd {
  id: string;
  name: string;
  purchaseUnit: string;
  sellUnit: string;
  conversionRatio: number;
  costPrice: number;
  sellPrice: number;
}

export function PurchaseDetailView({ purchaseId }: { purchaseId?: string }) {
  const router = useRouter();
  const { showToast } = useToast();

  const isCreateMode = !purchaseId || purchaseId === "input";

  const [viewMode, setViewMode] = useState<"INPUT" | "INSPECT">(isCreateMode ? "INPUT" : "INSPECT");
  const [loading, setLoading] = useState(!isCreateMode);

  // Master data
  const [products, setProducts] = useState<CatalogProd[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; label: string; group: string }[]>([]);

  // Form fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fundingSource, setFundingSource] = useState<"DANA_TOKO" | "BELANJA_PEMILIK">("DANA_TOKO");
  const [captureMethod, setCaptureMethod] = useState<"LIVE_CAMERA" | "DIGITAL_UPLOAD" | "TANPA_NOTA">("TANPA_NOTA");
  const [receiptImageData, setReceiptImageData] = useState<string>("");
  const [items, setItems] = useState<InputRow[]>([
    {
      rowKey: "row-1",
      productId: null,
      isNewProduct: true,
      itemName: "",
      quantity: 1,
      unit: "pcs",
      conversionRatio: 1,
      sellUnit: "pcs",
      unitCost: 0,
      sellPrice: 0,
      showSplitOption: false,
    },
  ]);

  // Existing Purchase Metadata
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

  // Owner Review Notes input
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
      if (e.key === "Escape" && !submitting) {
        setPendingNoteAction(null);
      }
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
        const pRes = await fetch(`/api/purchases?id=${purchaseId}`, { cache: "no-store" });
        const pJson = await pRes.json();
        if (pRes.ok && pJson.purchase) {
          const p = pJson.purchase;
          setInvoiceNumber(p.invoiceNumber);
          setSupplierName(p.supplierName);
          setPurchaseDate(new Date(p.purchaseDate).toISOString().slice(0, 10));
          setFundingSource(p.fundingSource);
          setCaptureMethod(p.captureMethod || (p.receiptImageData ? "DIGITAL_UPLOAD" : "TANPA_NOTA"));
          setReceiptImageData(p.receiptImageData || "");
          setApprovalStatus(p.approvalStatus);
          setAiValidationStatus(
            p.aiValidationStatus || (p.receiptImageData ? "BELUM_DICEK" : "TANPA_NOTA")
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

          if (p.approvalStatus === "PERLU_PERBAIKAN") {
            setViewMode("INPUT");
          } else {
            setViewMode("INSPECT");
          }
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
      {
        rowKey: `row-${Date.now()}-${Math.random()}`,
        productId: null,
        isNewProduct: asNewProduct,
        itemName: "",
        quantity: 1,
        unit: "pcs",
        conversionRatio: 1,
        sellUnit: "pcs",
        unitCost: 0,
        sellPrice: 0,
        showSplitOption: false,
      },
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
        if (!found) {
          return { ...row, productId: null, isNewProduct: true };
        }
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
        nextDataUrl
          ? "Lampiran nota berhasil diperbarui."
          : "Lampiran nota berhasil dihapus.",
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
      invoiceNumber.trim() || `NOTA-${purchaseDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

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

      showToast(
        `Pengajuan pembelian #${data.purchase.invoiceNumber} berhasil dikirim.`,
        "success"
      );
      router.push(`/pembelian/${data.purchase.id}`);
      if (!isCreateMode) {
        await loadData();
      }
    } catch {
      showToast("Terjadi kesalahan jaringan saat mengirim pengajuan.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerDecision = async (
    decision: "DISETUJUI" | "PERLU_PERBAIKAN" | "DITOLAK"
  ) => {
    if (!purchaseId) return;
    if (
      (decision === "PERLU_PERBAIKAN" || decision === "DITOLAK") &&
      !decisionNoteInput.trim()
    ) {
      showToast("Harap isi catatan perbaikan atau alasan penolakan di kolom catatan.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId,
          decision,
          ownerNotes: decisionNoteInput,
        }),
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

  return (
    <AppShell defaultCollapsed={true}>
      {(session) => {
        const isAdmin = isStoreAdmin(session.user.role);
        const canApprove =
          session.permissions.pembelian?.canApprove &&
          (session.user.role === "PEMILIK" ||
            session.user.role === "MANAJER" ||
            submittedById !== session.user.id);
        const hasReceipt = Boolean(receiptImageData && receiptImageData.trim().length > 10);
        const canEditReceipt =
          (approvalStatus === "MENUNGGU_PERSETUJUAN" || approvalStatus === "PERLU_PERBAIKAN") &&
          (isAdmin || submittedById === session.user.id);
        const receiptSourceLabel = !hasReceipt
          ? null
          : captureMethod === "LIVE_CAMERA"
          ? "Nota Fisik"
          : "Nota Digital";

        const normalizedAiReport =
          isAdmin && aiResult
            ? normalizePurchaseAiResult(aiResult, {
                supplierName,
                invoiceNumber,
                purchaseDate,
                totalAmount: totalCalculated,
                items: items.map((it) => ({
                  itemName: it.itemName,
                  quantity: Number(it.quantity),
                  unit: it.unit,
                  unitCost: Number(it.unitCost),
                })),
              })
            : null;

        return (
          <div className="space-y-6 pb-28">
            {/* TOP BAR */}
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
                    {isCreateMode
                      ? "Catat Pembelian Barang"
                      : viewMode === "INPUT"
                      ? `Perbaiki Pengajuan #${invoiceNumber}`
                      : `Tinjauan Pembelian #${invoiceNumber} (${supplierName})`}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isCreateMode && (
                    <>
                      {isAdmin ? (
                        <StatusBadge status={aiValidationStatus} />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                          <Receipt size={12} weight="bold" aria-hidden="true" />
                          <span>{receiptSourceLabel || "Tanpa Nota"}</span>
                        </span>
                      )}
                      <StatusBadge status={approvalStatus} />
                    </>
                  )}
                  {!isCreateMode &&
                    (approvalStatus === "MENUNGGU_PERSETUJUAN" ||
                      approvalStatus === "PERLU_PERBAIKAN") && (
                      <div className="inline-flex p-1 rounded-xl bg-[#F8FAFC] border border-[#202531]/15">
                      <button
                        type="button"
                        onClick={() => setViewMode("INSPECT")}
                        className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                          viewMode === "INSPECT"
                            ? "bg-[#202531] text-white"
                            : "text-[#525866] hover:text-[#202531]"
                        }`}
                      >
                        Tinjau Nota
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("INPUT")}
                        className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                          viewMode === "INPUT"
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

              {ownerNotes && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#B45309] space-y-1"
                >
                  <p className="font-extrabold">Catatan Pemilik / Manajer:</p>
                  <p className="font-medium">{ownerNotes}</p>
                </div>
              )}
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-[#202531]/15 p-10 text-center text-xs text-[#525866]">
                Memuat detail pembelian...
              </div>
            ) : viewMode === "INPUT" ? (
              /* MODE INPUT PEGAWAI (1 Halaman Sederhana & Jelas, Tanpa AI) */
              <div className="space-y-6">
                {/* Bagian 1: Info Belanja */}
                <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
                  <div>
                    <h2 className="text-base font-extrabold text-[#202531]">
                      1. Info Belanja
                    </h2>
                    <p className="text-xs text-[#525866]">
                      Isi nama toko tempat membeli barang, tanggal nota, dan asal uang belanjanya.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="purch-supplier"
                        className="block text-xs font-bold text-[#202531] mb-1"
                      >
                        Nama Toko / Pemasok
                      </label>
                      <input
                        id="purch-supplier"
                        type="text"
                        required
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="Contoh: Toko Sembako Maju"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm text-[#202531]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="purch-date"
                        className="block text-xs font-bold text-[#202531] mb-1"
                      >
                        Tanggal Belanja
                      </label>
                      <input
                        id="purch-date"
                        type="date"
                        required
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm text-[#202531]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="purch-inv"
                          className="block text-xs font-bold text-[#202531]"
                        >
                          Nomor Nota (jika ada)
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setInvoiceNumber(
                              `NOTA-${purchaseDate.replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`
                            )
                          }
                          className="text-[11px] font-bold text-[#006B69] hover:underline cursor-pointer"
                        >
                          Buat Otomatis
                        </button>
                      </div>
                      <input
                        id="purch-inv"
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="Contoh: INV-001 (boleh otomatis)"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-sm font-mono text-[#202531]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-[#202531]">Uang yang Dipakai</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                      <button
                        type="button"
                        onClick={() => setFundingSource("DANA_TOKO")}
                        className={`p-3.5 rounded-xl border text-left space-y-0.5 transition-colors cursor-pointer ${
                          fundingSource === "DANA_TOKO"
                            ? "bg-[#E6FBFB] border-[#01DAD7] text-[#202531]"
                            : "bg-[#F8FAFC] border-[#202531]/15 text-[#202531]"
                        }`}
                      >
                        <p className="text-xs font-extrabold">Uang Kas Toko</p>
                        <p className="text-[11px] text-[#525866]">
                          Belanja pakai uang toko atau kasir.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFundingSource("BELANJA_PEMILIK")}
                        className={`p-3.5 rounded-xl border text-left space-y-0.5 transition-colors cursor-pointer ${
                          fundingSource === "BELANJA_PEMILIK"
                            ? "bg-[#E6FBFB] border-[#01DAD7] text-[#202531]"
                            : "bg-[#F8FAFC] border-[#202531]/15 text-[#202531]"
                        }`}
                      >
                        <p className="text-xs font-extrabold">Uang Pemilik</p>
                        <p className="text-[11px] text-[#525866]">
                          Barang dibeli pemilik, pegawai mencatat barang masuk.
                        </p>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Bagian 2: Daftar Barang yang Dibeli */}
                <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-extrabold text-[#202531]">
                        2. Barang yang Dibeli
                      </h2>
                      <p className="text-xs text-[#525866]">
                        Masukkan nama barang, jumlah, dan harga beli per satuan sesuai struk.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {products.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAddRow(false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                        >
                          <Plus size={14} weight="bold" aria-hidden="true" />
                          <span>Pilih Barang Lama</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddRow(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
                      >
                        <Plus size={14} weight="bold" aria-hidden="true" />
                        <span>Tambah Barang Baru</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {items.map((row, idx) => (
                      <div
                        key={row.rowKey}
                        className="p-4 rounded-xl border border-[#202531]/15 bg-[#F8FAFC] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-[#202531]">
                            Barang #{idx + 1}{" "}
                            {row.isNewProduct ? "(Barang Baru)" : "(Dari Katalog)"}
                          </span>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.rowKey)}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-xs font-bold text-[#D41448] hover:bg-[#FFF0F4] cursor-pointer"
                            >
                              <Trash size={14} weight="bold" aria-hidden="true" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                          {!row.isNewProduct && products.length > 0 ? (
                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-bold text-[#202531] mb-1">
                                Pilih Barang
                              </label>
                              <select
                                value={row.productId || ""}
                                onChange={(e) =>
                                  handleSelectExistingProduct(row.rowKey, e.target.value)
                                }
                                className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-semibold bg-white text-[#202531]"
                              >
                                <option value="">-- Pilih Barang --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.purchaseUnit})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-bold text-[#202531] mb-1">
                                Nama Barang
                              </label>
                              <input
                                type="text"
                                value={row.itemName}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((r) =>
                                      r.rowKey === row.rowKey
                                        ? { ...r, itemName: e.target.value }
                                        : r
                                    )
                                  )
                                }
                                placeholder="Contoh: Gula Pasir 1kg"
                                className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs bg-white text-[#202531]"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-bold text-[#202531] mb-1">
                              Jumlah Beli
                            </label>
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={row.quantity}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((r) =>
                                    r.rowKey === row.rowKey
                                      ? { ...r, quantity: Number(e.target.value) }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#202531] mb-1">
                              Satuan
                            </label>
                            <select
                              value={row.unit}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((r) =>
                                    r.rowKey === row.rowKey
                                      ? { ...r, unit: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-semibold bg-white text-[#202531]"
                            >
                              {units.map((u) => (
                                <option key={u.id} value={u.name}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#202531] mb-1">
                              Harga Beli / {row.unit} (Rp)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={row.unitCost}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((r) =>
                                    r.rowKey === row.rowKey
                                      ? { ...r, unitCost: Number(e.target.value) }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#202531] mb-1">
                              Subtotal
                            </label>
                            <div className="px-3 py-2 min-h-[44px] rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs font-mono font-extrabold tabular-nums text-[#202531] flex items-center">
                              {formatRupiah(Math.round(row.quantity * row.unitCost))}
                            </div>
                          </div>
                        </div>

                        {row.isNewProduct && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.map((r) =>
                                    r.rowKey === row.rowKey
                                      ? { ...r, showSplitOption: !r.showSplitOption }
                                      : r
                                  )
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#525866] hover:text-[#202531] cursor-pointer"
                            >
                              {row.showSplitOption ? (
                                <CaretUp size={13} weight="bold" aria-hidden="true" />
                              ) : (
                                <CaretDown size={13} weight="bold" aria-hidden="true" />
                              )}
                              <span>
                                Opsional: Atur harga jual atau isi dus/kemasan (contoh: 1 dus = 24 botol)
                              </span>
                            </button>

                            {row.showSplitOption && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2.5 mt-2 border-t border-[#202531]/10">
                                <div>
                                  <label className="block text-[11px] font-bold text-[#525866] mb-1">
                                    Isi per 1 {row.unit} (berapa satuan jual?)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={row.conversionRatio}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((r) =>
                                          r.rowKey === row.rowKey
                                            ? { ...r, conversionRatio: Number(e.target.value) || 1 }
                                            : r
                                        )
                                      )
                                    }
                                    className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-[#525866] mb-1">
                                    Satuan Jual Terkecil
                                  </label>
                                  <select
                                    value={row.sellUnit}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((r) =>
                                          r.rowKey === row.rowKey
                                            ? { ...r, sellUnit: e.target.value }
                                            : r
                                        )
                                      )
                                    }
                                    className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs bg-white text-[#202531]"
                                  >
                                    {units.map((u) => (
                                      <option key={u.id} value={u.name}>
                                        {u.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-[#525866] mb-1">
                                    Harga Jual per {row.sellUnit} (Rp)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.sellPrice}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((r) =>
                                          r.rowKey === row.rowKey
                                            ? { ...r, sellPrice: Number(e.target.value) }
                                            : r
                                        )
                                      )
                                    }
                                    className="w-full px-3 py-1.5 min-h-[40px] rounded-lg border border-[#202531]/20 text-xs font-mono bg-white text-[#202531]"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#202531]">
                      Total Nilai Belanja
                    </span>
                    <span className="text-lg font-extrabold font-mono tabular-nums text-[#202531]">
                      {formatRupiah(totalCalculated)}
                    </span>
                  </div>
                </section>

                {/* Bagian 3: Lampiran Nota (Opsional, Tanpa AI) */}
                <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-extrabold text-[#202531]">
                      3. Lampiran Nota (Opsional)
                    </h2>
                    <p className="text-xs text-[#525866]">
                      Tambahkan foto nota fisik atau file nota digital jika tersedia. Anda tetap dapat mengirim pengajuan tanpa nota.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] cursor-pointer"
                    >
                      <Camera size={18} weight="bold" aria-hidden="true" />
                      <span>Foto Nota Fisik</span>
                    </button>

                    <label className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-[#202531] text-xs font-bold hover:bg-[#EBEBEB] cursor-pointer">
                      <UploadSimple size={18} weight="bold" aria-hidden="true" />
                      <span>Unggah Nota Digital</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          handleDigitalFileChange(e.target.files?.[0] || null, false);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <p className="text-[11px] text-[#525866]">
                    Format JPG, PNG, WEBP, atau PDF (maks. 2 MB).
                  </p>

                  {hasReceipt && (
                    <ReceiptViewer
                      receiptImageData={receiptImageData}
                      sourceLabel={
                        captureMethod === "LIVE_CAMERA" ? "Nota Fisik" : "Nota Digital"
                      }
                      altText={`Pratinjau lampiran nota ${invoiceNumber || "pembelian"}`}
                      compact
                      canReplace
                      onOpenCamera={() => setCameraModalOpen(true)}
                      onUploadFile={(file) => handleDigitalFileChange(file, false)}
                      onRemove={() => {
                        setReceiptImageData("");
                        setCaptureMethod("TANPA_NOTA");
                      }}
                    />
                  )}
                </section>
              </div>
            ) : (
              /* MODE TINJAUAN (2 Kolom Sejajar di Desktop) */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* KIRI: Pembaca Nota Berkejelasan Tinggi */}
                <div className="lg:col-span-6 lg:sticky lg:top-6 space-y-4">
                  <ReceiptViewer
                    receiptImageData={receiptImageData}
                    sourceLabel={receiptSourceLabel}
                    altText={`Lampiran nota pembelian ${invoiceNumber}`}
                    canAttachManual={canEditReceipt}
                    canReplace={canEditReceipt}
                    replacing={savingReceipt}
                    onOpenCamera={canEditReceipt ? () => setCameraModalOpen(true) : undefined}
                    onUploadFile={
                      canEditReceipt ? (file) => handleDigitalFileChange(file, true) : undefined
                    }
                    onRemove={
                      canEditReceipt
                        ? () => {
                            void persistInspectReceiptUpdate(null, "TANPA_NOTA");
                          }
                        : undefined
                    }
                  />
                </div>

                {/* KANAN: Panel Cek AI (Paling atas untuk Admin) + Daftar Barang + Keputusan */}
                <div className="lg:col-span-6 space-y-5">
                  {isAdmin && (
                    <ReceiptAiCheckPanel
                      hasReceipt={hasReceipt}
                      report={normalizedAiReport}
                      loading={scanningAi}
                      errorMessage={aiError}
                      onRunCheck={handleRunAiCheck}
                    />
                  )}

                  <div className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#202531]/10 pb-3">
                      <div>
                        <h2 className="text-base font-extrabold text-[#202531]">
                          Daftar Barang yang Diinput Pegawai
                        </h2>
                        <p className="text-xs text-[#525866]">
                          Oleh <strong className="text-[#202531]">{submittedByName || session.user.name}</strong> •{" "}
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
                      <span className="text-xs font-extrabold text-[#202531]">
                        Total Belanja Diinput
                      </span>
                      <span className="text-lg font-extrabold font-mono tabular-nums text-[#202531]">
                        {formatRupiah(totalCalculated)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STICKY BOTTOM ACTION BAR */}
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-white border-t border-[#202531]/15 px-4 md:px-8 py-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-[#525866]">Total Belanja: </span>
                <strong className="font-mono text-sm tabular-nums text-[#202531]">
                  {formatRupiah(totalCalculated)}
                </strong>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {viewMode === "INPUT" ? (
                  <button
                    type="button"
                    disabled={submitting}
                    aria-busy={submitting}
                    onClick={handleSubmitPurchase}
                    className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    <PaperPlaneRight size={16} weight="bold" aria-hidden="true" />
                    <span>
                      {submitting
                        ? "Mengirim..."
                        : isCreateMode
                        ? "Kirim Pengajuan Pembelian"
                        : "Kirim Perbaikan"}
                    </span>
                  </button>
                ) : (
                  canApprove &&
                  approvalStatus !== "DISETUJUI" && (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOwnerDecision("DISETUJUI")}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Setujui &amp; Tambah Stok</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setDecisionNoteInput("");
                          setPendingNoteAction("PERLU_PERBAIKAN");
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        <WarningCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Minta Perbaikan</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setDecisionNoteInput("");
                          setPendingNoteAction("DITOLAK");
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-[#D41448] text-xs font-extrabold hover:bg-[#FFE0E8] disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Tolak</span>
                      </button>
                    </>
                  )
                )}
              </div>
            </div>

            <CameraCaptureModal
              isOpen={cameraModalOpen}
              onClose={() => setCameraModalOpen(false)}
              onCapture={(dataUrl) => {
                if (viewMode === "INSPECT" && !isCreateMode && purchaseId) {
                  void persistInspectReceiptUpdate(dataUrl, "LIVE_CAMERA");
                  return;
                }
                setReceiptImageData(dataUrl);
                setCaptureMethod("LIVE_CAMERA");
                setAiResult(null);
                setAiError(null);
                showToast("Foto nota fisik dilampirkan.", "success");
              }}
            />

            {mounted &&
              pendingNoteAction &&
              createPortal(
                <div
                  className="fixed inset-0 z-[85] !m-0 bg-[#202531]/60 flex items-center justify-center p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="purchase-note-modal-title"
                >
                  <div className="w-full max-w-md rounded-2xl bg-white border border-[#202531]/15 shadow-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3
                          id="purchase-note-modal-title"
                          className="text-base font-extrabold text-[#202531]"
                        >
                          {pendingNoteAction === "DITOLAK"
                            ? "Alasan Penolakan Pembelian"
                            : "Catatan Perbaikan untuk Pegawai"}
                        </h3>
                        <p className="text-xs text-[#525866] mt-0.5">
                          {pendingNoteAction === "DITOLAK"
                            ? "Jelaskan singkat alasan penolakan agar pegawai tahu penyebabnya."
                            : "Tuliskan bagian nota atau harga yang perlu diperbaiki pegawai."}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setPendingNoteAction(null)}
                        aria-label="Tutup dialog catatan"
                        className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-[#525866] hover:bg-[#EBEBEB] cursor-pointer"
                      >
                        <X size={18} weight="bold" aria-hidden="true" />
                      </button>
                    </div>

                    <textarea
                      id="owner-decision-notes"
                      autoFocus
                      rows={3}
                      value={decisionNoteInput}
                      onChange={(e) => setDecisionNoteInput(e.target.value)}
                      placeholder="Contoh: Harga di nota Rp 18.000, mohon diperbaiki..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#202531]/20 bg-white text-xs text-[#202531]"
                    />

                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setPendingNoteAction(null);
                          setDecisionNoteInput("");
                        }}
                        className="px-4 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={submitting || !decisionNoteInput.trim()}
                        aria-busy={submitting}
                        onClick={() => handleOwnerDecision(pendingNoteAction)}
                        className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-extrabold text-white hover:opacity-95 disabled:opacity-50 cursor-pointer ${
                          pendingNoteAction === "DITOLAK" ? "bg-[#D41448]" : "bg-[#202531]"
                        }`}
                      >
                        <span>
                          {submitting
                            ? "Menyimpan..."
                            : pendingNoteAction === "DITOLAK"
                            ? "Konfirmasi Tolak"
                            : "Kirim Permintaan Perbaikan"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
          </div>
        );
      }}
    </AppShell>
  );
}
