"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CameraCaptureModal } from "@/components/ui/CameraCaptureModal";
import { formatDateJakarta, formatNumber, formatRupiah } from "@/lib/format";
import type { AIReceiptValidationResult } from "@/lib/gemini";

const NEUTRAL_AI_DISCLAIMER =
  "Hasil pemeriksaan AI merupakan bahan evaluasi, bukan keputusan kecurangan.";
import {
  ArrowLeft,
  Camera,
  FileArrowUp,
  Plus,
  Trash,
  Sparkle,
  CheckCircle,
  WarningCircle,
  XCircle,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  Info,
  PaperPlaneRight,
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const [captureMethod, setCaptureMethod] = useState<"LIVE_CAMERA" | "DIGITAL_UPLOAD">("LIVE_CAMERA");
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
    },
  ]);

  // Existing Purchase Metadata (when viewing/editing an existing purchase)
  const [approvalStatus, setApprovalStatus] = useState<string>("MENUNGGU_PERSETUJUAN");
  const [aiValidationStatus, setAiValidationStatus] = useState<string>("PENDING");
  const [ownerNotes, setOwnerNotes] = useState<string>("");
  const [submittedByName, setSubmittedByName] = useState<string>("");
  const [submittedById, setSubmittedById] = useState<string>("");
  const [aiResult, setAiResult] = useState<AIReceiptValidationResult | null>(null);
  const [scanningAi, setScanningAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Owner Review Notes input
  const [decisionNoteInput, setDecisionNoteInput] = useState("");

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
          setCaptureMethod(p.captureMethod);
          setReceiptImageData(p.receiptImageData || "");
          setApprovalStatus(p.approvalStatus);
          setAiValidationStatus(p.aiValidationStatus);
          setOwnerNotes(p.ownerNotes || "");
          setSubmittedByName(p.submittedBy?.name || "Pegawai");
          setSubmittedById(p.submittedById || "");

          if (p.aiAnalysisJson) {
            try {
              setAiResult(JSON.parse(p.aiAnalysisJson));
            } catch {
              // ignore
            }
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

  const handleDigitalFileChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReceiptImageData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunAiPreview = async () => {
    if (!receiptImageData) {
      showToast("Unggah atau jepret foto nota terlebih dahulu untuk dipindai AI.", "error");
      return;
    }
    setScanningAi(true);
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
        showToast(data.error || "Gagal memindai nota dengan AI.", "error");
        return;
      }
      setAiResult(data.analysis);
      setAiValidationStatus(data.analysis.status);
      showToast("Pemindaian Nota AI selesai.", "info");
    } catch {
      showToast("Gagal menghubungi layanan AI.", "error");
    } finally {
      setScanningAi(false);
    }
  };

  const handleSubmitPurchase = async () => {
    if (!invoiceNumber.trim() || !supplierName.trim()) {
      showToast("Nomor nota dan nama pemasok wajib diisi.", "error");
      setStep(1);
      return;
    }
    if (items.some((i) => !i.itemName.trim() || i.quantity <= 0)) {
      showToast("Pastikan seluruh nama barang dan jumlah pembelian telah diisi benar.", "error");
      setStep(2);
      return;
    }
    if (!receiptImageData) {
      showToast("Bukti foto atau berkas nota wajib dilampirkan.", "error");
      setStep(3);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isCreateMode ? undefined : purchaseId,
          invoiceNumber,
          supplierName,
          purchaseDate,
          fundingSource,
          captureMethod,
          receiptImageData,
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
        `Pengajuan Pembelian #${data.purchase.invoiceNumber} berhasil dikirim (Validasi AI: ${data.purchase.aiValidationStatus}).`,
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
          ? "Pembelian Disetujui! Stok inventaris, produk baru, dan laporan pengeluaran otomatis diperbarui."
          : `Status pembelian diperbarui menjadi ${decision.replace("_", " ")}.`,
        "success"
      );
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
        const canApprove =
          session.permissions.pembelian?.canApprove &&
          (session.user.role === "PEMILIK" || submittedById !== session.user.id);

        return (
          <div className="space-y-6 pb-24">
            {/* TOP BAR: Breadcrumb, Title, Funding Source & Status Badges */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <Link
                    href="/pembelian"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#334E6B] hover:underline"
                  >
                    <ArrowLeft size={14} weight="bold" aria-hidden="true" />
                    <span>Kembali ke Daftar Pembelian</span>
                  </Link>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    {isCreateMode
                      ? "Form Input Pembelian & Validasi Nota AI"
                      : `Pemeriksaan Pembelian #${invoiceNumber} (${supplierName})`}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isCreateMode && (
                    <>
                      <StatusBadge status={aiValidationStatus} />
                      <StatusBadge status={approvalStatus} />
                    </>
                  )}
                  {!isCreateMode && approvalStatus !== "DISETUJUI" && (
                    <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setViewMode("INSPECT")}
                        className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold cursor-pointer ${
                          viewMode === "INSPECT"
                            ? "bg-[#334E6B] text-white"
                            : "text-slate-700"
                        }`}
                      >
                        Mode Pemeriksaan (2 Kolom)
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("INPUT")}
                        className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold cursor-pointer ${
                          viewMode === "INPUT"
                            ? "bg-[#334E6B] text-white"
                            : "text-slate-700"
                        }`}
                      >
                        Mode Input / Perbaikan
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Banner Catatan Pemilik when status === PERLU_PERBAIKAN */}
              {ownerNotes && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#B45309] space-y-1"
                >
                  <p className="font-extrabold">Catatan Pemilik (Perlu Perbaikan / Evaluasi):</p>
                  <p className="font-medium">{ownerNotes}</p>
                </div>
              )}
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-600">
                Memuat detail pembelian & hasil analisis AI...
              </div>
            ) : viewMode === "INPUT" ? (
              /* MODE INPUT PEGAWAI (3-Step Stepper) */
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-6">
                {/* Stepper Navigation */}
                <div
                  role="tablist"
                  aria-label="Langkah input pembelian"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                >
                  {(
                    [
                      { num: 1, title: "1. Info Pembelian & Sumber Dana" },
                      { num: 2, title: "2. Daftar Barang & Konversi Satuan" },
                      { num: 3, title: "3. Unggah Bukti Nota & Pindai AI" },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.num}
                      type="button"
                      role="tab"
                      aria-selected={step === s.num}
                      onClick={() => setStep(s.num)}
                      className={`p-3.5 min-h-[48px] rounded-xl text-left text-xs font-extrabold border transition-colors cursor-pointer ${
                        step === s.num
                          ? "bg-[#334E6B] text-white border-[#334E6B]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>

                {/* STEP 1: Info Pembelian */}
                {step === 1 && (
                  <div className="space-y-4 max-w-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="purch-inv"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nomor Nota / Struk Pembelian
                        </label>
                        <input
                          id="purch-inv"
                          type="text"
                          required
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="Contoh: INV-2026-089"
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm font-mono text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="purch-date"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Tanggal Transaksi Nota
                        </label>
                        <input
                          id="purch-date"
                          type="date"
                          required
                          value={purchaseDate}
                          onChange={(e) => setPurchaseDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="purch-supplier"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Nama Toko / Pemasok (Supplier)
                      </label>
                      <input
                        id="purch-supplier"
                        type="text"
                        required
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="Masukkan nama toko atau pemasok barang"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700">
                        Kondisi / Sumber Dana Pembelian
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFundingSource("DANA_TOKO")}
                          className={`p-4 rounded-xl border text-left space-y-1 transition-colors cursor-pointer ${
                            fundingSource === "DANA_TOKO"
                              ? "bg-[#E8EEF4] border-[#334E6B] text-[#334E6B]"
                              : "bg-white border-slate-200 text-slate-700"
                          }`}
                        >
                          <p className="text-xs font-extrabold">
                            1. Belanja Pegawai dengan Dana Toko
                          </p>
                          <p className="text-[11px] opacity-90">
                            Pemilik memberikan uang kepada pegawai untuk membeli barang & melampirkan nota.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFundingSource("BELANJA_PEMILIK")}
                          className={`p-4 rounded-xl border text-left space-y-1 transition-colors cursor-pointer ${
                            fundingSource === "BELANJA_PEMILIK"
                              ? "bg-[#E8EEF4] border-[#334E6B] text-[#334E6B]"
                              : "bg-white border-slate-200 text-slate-700"
                          }`}
                        >
                          <p className="text-xs font-extrabold">
                            2. Penerimaan Barang Belanja Pemilik
                          </p>
                          <p className="text-[11px] opacity-90">
                            Pemilik membeli barang langsung, pegawai mencatat penerimaan barang ke sistem.
                          </p>
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                      >
                        Lanjut ke Daftar Barang →
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: Daftar Barang */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-extrabold text-slate-900">
                          Rincian Barang yang Dibeli
                        </h2>
                        <p className="text-xs text-slate-600">
                          Pilih barang dari katalog atau klik + Tambah Produk Baru untuk mendaftarkan barang baru sekaligus
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddRow(false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                        >
                          <Plus size={14} weight="bold" aria-hidden="true" />
                          <span>Pilih Produk Katalog</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddRow(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] cursor-pointer"
                        >
                          <Plus size={14} weight="bold" aria-hidden="true" />
                          <span>+ Tambah Produk Baru</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {items.map((row, idx) => (
                        <div
                          key={row.rowKey}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-[#334E6B]">
                              Baris Barang #{idx + 1}{" "}
                              {row.isNewProduct ? "(Produk Baru Inline)" : "(Produk Terdaftar)"}
                            </span>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.rowKey)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#9F1239] hover:underline cursor-pointer"
                              >
                                <Trash size={14} weight="bold" aria-hidden="true" />
                                <span>Hapus Baris</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            {!row.isNewProduct && products.length > 0 ? (
                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                  Pilih Produk Katalog
                                </label>
                                <select
                                  value={row.productId || ""}
                                  onChange={(e) =>
                                    handleSelectExistingProduct(row.rowKey, e.target.value)
                                  }
                                  className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                                >
                                  <option value="">-- Pilih Produk --</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.purchaseUnit})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
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
                                  placeholder="Nama barang pada nota"
                                  className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                                />
                              </div>
                            )}

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
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
                                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Satuan Beli
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
                                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                              >
                                {units.map((u) => (
                                  <option key={u.id} value={u.name}>
                                    {u.name} ({u.group})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Harga Beli / Satuan (Rp)
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
                                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Subtotal Baris
                              </label>
                              <div className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono font-extrabold text-slate-900 flex items-center">
                                {formatRupiah(Math.round(row.quantity * row.unitCost))}
                              </div>
                            </div>
                          </div>

                          {/* Optional Pecah Satuan conversion for new product inline */}
                          {row.isNewProduct && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Rasio Konversi (1 {row.unit} = berapa satuan jual?)
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
                                  placeholder="1 (Contoh: 1 dus = 24 botol)"
                                  className="w-full px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-mono bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Satuan Jual / Stok Terkecil
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
                                  className="w-full px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs bg-white"
                                >
                                  {units.map((u) => (
                                    <option key={u.id} value={u.name}>
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                  Rencana Harga Jual per {row.sellUnit} (Rp)
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
                                  className="w-full px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-mono bg-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-xl bg-[#E8EEF4] border border-slate-300 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#334E6B]">
                        Total Nilai Pembelian Diinput
                      </span>
                      <span className="text-lg font-extrabold font-mono text-[#334E6B]">
                        {formatRupiah(totalCalculated)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        ← Kembali
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                      >
                        Lanjut ke Unggah Bukti Nota →
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Unggah Bukti Nota & AI Validation */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Method 1: Nota Fisik (Live Camera Capture) */}
                      <div
                        className={`p-4 rounded-2xl border space-y-3 ${
                          captureMethod === "LIVE_CAMERA"
                            ? "border-[#334E6B] bg-[#E8EEF4]/40"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900">
                            A. Foto Nota Fisik (Kamera Langsung)
                          </span>
                          <StatusBadge
                            status="AMAN"
                            customLabel="Anti-Manipulasi Galeri"
                          />
                        </div>
                        <p className="text-xs text-slate-600">
                          Wajib menggunakan kamera langsung aplikasi untuk nota kertas fisik guna mencegah manipulasi gambar galeri.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCaptureMethod("LIVE_CAMERA");
                            setCameraModalOpen(true);
                          }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] cursor-pointer"
                        >
                          <Camera size={18} weight="bold" aria-hidden="true" />
                          <span>Buka Kamera & Jepret Nota Fisik</span>
                        </button>
                      </div>

                      {/* Method 2: Nota Digital (File/Gallery for electronic receipts) */}
                      <div
                        className={`p-4 rounded-2xl border space-y-3 ${
                          captureMethod === "DIGITAL_UPLOAD"
                            ? "border-[#334E6B] bg-[#E8EEF4]/40"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900">
                            B. Unggah Nota Digital (Struk Elektronik)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          Gunakan untuk nota PDF/gambar hasil unduhan dari transfer atau e-commerce resmi pemasok.
                        </p>
                        <label className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 cursor-pointer">
                          <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                          <span>Pilih Berkas Struk Elektronik</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              setCaptureMethod("DIGITAL_UPLOAD");
                              handleDigitalFileChange(e.target.files?.[0] || null);
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Preview & AI Scan Trigger */}
                    {receiptImageData && (
                      <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-extrabold text-slate-900">
                              Pratinjau Bukti Nota Terlampir ({captureMethod})
                            </p>
                            <p className="text-[11px] text-slate-600">
                              Jalankan pemeriksaan AI untuk membandingkan isi nota dengan daftar barang sebelum dikirim
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={scanningAi}
                            onClick={handleRunAiPreview}
                            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F766E] text-white text-xs font-bold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                          >
                            <Sparkle size={16} weight="fill" aria-hidden="true" />
                            <span>
                              {scanningAi
                                ? "Memindai Nota dengan Gemini AI..."
                                : "Pindai & Validasi Nota dengan AI"}
                            </span>
                          </button>
                        </div>

                        <div className="max-h-80 overflow-auto rounded-xl border border-slate-300 bg-slate-900 p-2 flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={receiptImageData}
                            alt="Pratinjau bukti nota pembelian"
                            width={600}
                            height={450}
                            className="max-h-72 w-auto object-contain rounded"
                          />
                        </div>

                        {scanningAi && (
                          <div className="p-4 rounded-xl bg-white border border-slate-200 animate-pulse space-y-2">
                            <div className="h-4 w-48 bg-slate-200 rounded" />
                            <div className="h-3 w-full bg-slate-200 rounded" />
                            <div className="h-3 w-3/4 bg-slate-200 rounded" />
                          </div>
                        )}

                        {aiResult && !scanningAi && (
                          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-900">
                                Hasil Pra-Pemeriksaan Gemini AI
                              </span>
                              <StatusBadge status={aiResult.status} />
                            </div>
                            <p className="text-slate-700">{aiResult.neutralEvaluationSummary}</p>
                            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                              <Info size={14} weight="bold" aria-hidden="true" />
                              <span>{NEUTRAL_AI_DISCLAIMER}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* MODE PEMERIKSAAN PEMILIK (2 Kolom Sejajar) */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* LEFT COLUMN: Zoomable Receipt Preview + AI Analysis Card */}
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          Bukti Foto / Dokumen Nota
                        </h2>
                        <p className="text-xs text-slate-600">
                          Metode Unggah:{" "}
                          {captureMethod === "LIVE_CAMERA"
                            ? "Kamera Langsung Aplikasi (Live Capture)"
                            : "Unggahan Nota Digital"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                          aria-label="Perkecil gambar nota"
                          className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <MagnifyingGlassMinus size={16} weight="bold" aria-hidden="true" />
                        </button>
                        <span className="text-xs font-mono font-bold px-2">
                          {Math.round(zoomLevel * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                          aria-label="Perbesar gambar nota"
                          className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <MagnifyingGlassPlus size={16} weight="bold" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="overflow-auto max-h-96 rounded-xl bg-slate-900 border border-slate-300 p-3 flex items-center justify-center">
                      {receiptImageData ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={receiptImageData}
                          alt={`Bukti nota pembelian ${invoiceNumber}`}
                          width={640}
                          height={480}
                          style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}
                          className="max-w-full h-auto object-contain transition-transform"
                        />
                      ) : (
                        <p className="text-xs text-slate-300 py-12">
                          Tidak ada gambar nota terlampir.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Kartu Hasil Analisis AI */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkle size={20} weight="fill" className="text-[#0F766E]" aria-hidden="true" />
                        <h2 className="text-base font-extrabold text-slate-900">
                          Hasil Analisis Validasi Nota AI
                        </h2>
                      </div>
                      <StatusBadge status={aiValidationStatus} />
                    </div>

                    {/* Neutral Guardrail Disclaimer */}
                    <div className="p-3 rounded-xl bg-[#F0FDFA] border border-[#99F6E4] text-xs text-[#0F766E] flex items-start gap-2">
                      <Info size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="font-semibold">{NEUTRAL_AI_DISCLAIMER}</span>
                    </div>

                    {aiResult ? (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <div>
                            <p className="text-[11px] text-slate-500">Toko Terbaca AI</p>
                            <p className="font-bold text-slate-900 mt-0.5">
                              {aiResult.extractedSupplier || "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500">Tanggal Terbaca</p>
                            <p className="font-bold text-slate-900 mt-0.5">
                              {aiResult.extractedDate || "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-500">Total Terbaca AI</p>
                            <p className="font-mono font-extrabold text-[#334E6B] mt-0.5">
                              {aiResult.extractedTotal !== null
                                ? formatRupiah(aiResult.extractedTotal)
                                : "-"}
                            </p>
                          </div>
                        </div>

                        <p className="text-slate-800 font-medium">
                          <strong>Ringkasan Evaluasi:</strong> {aiResult.neutralEvaluationSummary}
                        </p>

                        {aiResult.editSuspicionReason && (
                          <div className="p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#9F1239]">
                            <strong>Catatan Indikasi Visual Nota:</strong> {aiResult.editSuspicionReason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        Klik tombol Pindai Ulang AI untuk memuat rincian ekstraksi nota.
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={scanningAi}
                      onClick={handleRunAiPreview}
                      className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <Sparkle size={14} weight="bold" aria-hidden="true" />
                      <span>{scanningAi ? "Memindai..." : "Jalankan Ulang Pemeriksaan AI"}</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT COLUMN: Employee Input Breakdown for Side-by-Side Comparison */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Rincian Barang yang Diinput Pegawai
                      </h2>
                      <p className="text-xs text-slate-600">
                        Pengaju: <strong>{submittedByName || session.user.name}</strong> • Tanggal:{" "}
                        {formatDateJakarta(purchaseDate)}
                      </p>
                    </div>
                    <StatusBadge status={fundingSource} />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                          <th className="py-3 px-3">Nama Barang</th>
                          <th className="py-3 px-3 text-right">Jumlah & Satuan</th>
                          <th className="py-3 px-3 text-right">Harga Satuan</th>
                          <th className="py-3 px-3 text-right">Subtotal</th>
                          <th className="py-3 px-3">Evaluasi Baris</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((it, idx) => {
                          const rowSub = Math.round(it.quantity * it.unitCost);
                          const aiRow = aiResult?.items?.[idx];
                          const hasRowIssue = aiRow && aiRow.matchesInput === false;

                          return (
                            <tr
                              key={it.rowKey}
                              className={hasRowIssue ? "bg-[#FFF1F2]/60" : ""}
                            >
                              <td className="py-3 px-3">
                                <p className="font-bold text-slate-900">{it.itemName}</p>
                                {it.conversionRatio > 1 && (
                                  <p className="text-[11px] text-slate-600">
                                    Konversi: 1 {it.unit} = {it.conversionRatio} {it.sellUnit}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-mono">
                                {formatNumber(it.quantity)} {it.unit}
                              </td>
                              <td className="py-3 px-3 text-right font-mono">
                                {formatRupiah(it.unitCost)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900">
                                {formatRupiah(rowSub)}
                              </td>
                              <td className="py-3 px-3">
                                {hasRowIssue ? (
                                  <span className="text-[11px] font-bold text-[#9F1239]">
                                    {aiRow?.discrepancyNote || "Perlu diperiksa"}
                                  </span>
                                ) : (
                                  <StatusBadge status="SESUAI" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700">
                      Total Nilai Nota Diinput Pegawai
                    </span>
                    <span className="text-lg font-extrabold font-mono text-[#334E6B]">
                      {formatRupiah(totalCalculated)}
                    </span>
                  </div>

                  {/* Owner Evaluation Notes Input */}
                  {canApprove && approvalStatus !== "DISETUJUI" && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <label
                        htmlFor="owner-decision-notes"
                        className="block text-xs font-bold text-slate-700"
                      >
                        Catatan Evaluasi Pemilik (Wajib diisi jika Minta Perbaikan atau Tolak)
                      </label>
                      <textarea
                        id="owner-decision-notes"
                        rows={2}
                        value={decisionNoteInput}
                        onChange={(e) => setDecisionNoteInput(e.target.value)}
                        placeholder="Tuliskan catatan pemeriksaan atau instruksi perbaikan untuk pegawai..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STICKY BOTTOM ACTION BAR */}
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-4 md:px-8 py-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-slate-600">Total Nilai Pengajuan: </span>
                <strong className="font-mono text-sm text-[#334E6B]">
                  {formatRupiah(totalCalculated)}
                </strong>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {viewMode === "INPUT" ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmitPurchase}
                    className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                  >
                    <PaperPlaneRight size={16} weight="bold" aria-hidden="true" />
                    <span>
                      {submitting
                        ? "Mengirim & Memvalidasi..."
                        : isCreateMode
                        ? "Kirim Pengajuan Pembelian"
                        : "Kirim Perbaikan Pembelian"}
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
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#166534] text-white text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Terima (Sesuai) & Tambah Stok</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOwnerDecision("PERLU_PERBAIKAN")}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#B45309] text-white text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <WarningCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Minta Perbaikan</span>
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOwnerDecision("DITOLAK")}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#9F1239] text-white text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle size={16} weight="bold" aria-hidden="true" />
                        <span>Tolak Pengajuan</span>
                      </button>
                    </>
                  )
                )}
              </div>
            </div>

            <CameraCaptureModal
              isOpen={cameraModalOpen}
              onClose={() => setCameraModalOpen(false)}
              onCapture={(dataUrl) => setReceiptImageData(dataUrl)}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
