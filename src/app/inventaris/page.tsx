"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import {
  Package,
  ArrowsLeftRight,
  ClipboardText,
  CheckCircle,
  XCircle,
  EyeSlash,
  FileArrowUp,
} from "@phosphor-icons/react";

interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  stockMethod: string;
  sellUnit: string;
  costPrice: number;
  currentStock: number;
  minStockAlert: number;
  category: { id: string; name: string; areaType: string };
}

interface BlindCountProd {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  areaType: string;
  sellUnit: string;
}

interface StockAdjustmentRow {
  id: string;
  productId: string;
  adjustmentType: string;
  quantity: number;
  reason: string;
  proofImageData: string | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
  product: { id: string; name: string; sellUnit: string; category: { name: string; areaType: string } };
  fromWarehouse?: { id: string; name: string } | null;
  toWarehouse?: { id: string; name: string } | null;
  requestedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

interface OpnameItemRow {
  id: string;
  productId: string;
  areaType: string;
  systemStock: number;
  physicalStock: number;
  differenceUnit: number;
  unitCost: number;
  lossValueRp: number;
  exceedsTolerance: boolean;
  toleranceStatus: string;
  employeeExplanation: string | null;
  proofImageData: string | null;
  ownerDecision: string;
  ownerNotes: string | null;
  product: { id: string; name: string; sku: string; sellUnit: string; category: { name: string } };
}

interface OpnameSessionRow {
  id: string;
  title: string;
  scheduleType: string;
  toleranceThreshold: number;
  status: string;
  createdAt: string;
  createdBy: { id: string; name: string; role: string };
  items: OpnameItemRow[];
}

export default function InventarisPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"current" | "adjustments" | "opname">("current");
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [blindProducts, setBlindProducts] = useState<BlindCountProd[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustmentRow[]>([]);
  const [opnameSessions, setOpnameSessions] = useState<OpnameSessionRow[]>([]);
  const [toleranceThresholdRp, setToleranceThresholdRp] = useState(50000);
  const [opnameSchedule, setOpnameSchedule] = useState("MINGGUAN");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  // Tab 2: Adjustment Form states
  const [adjProductId, setAdjProductId] = useState("");
  const [adjType, setAdjType] = useState<
    "RUSAK" | "KEDALUWARSA" | "HILANG" | "DIKEMBALIKAN" | "PINDAH_GUDANG"
  >("RUSAK");
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState("");
  const [adjProof, setAdjProof] = useState<string>("");
  const [fromWhId, setFromWhId] = useState("");
  const [toWhId, setToWhId] = useState("");
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // Tab 3: Blind Count Opname states
  const [blindModeActive, setBlindModeActive] = useState(false);
  const [opnameTitle, setOpnameTitle] = useState(
    () => `Audit Stok Fisik ${new Date().toISOString().slice(0, 10)}`
  );
  const [physicalInputs, setPhysicalInputs] = useState<Record<string, string>>({});
  const [submittingOpname, setSubmittingOpname] = useState(false);

  // Right Side Drawer: Anomaly Resolution (Penyelesaian Anomali)
  const [selectedAnomaly, setSelectedAnomaly] = useState<OpnameItemRow | null>(null);
  const [explanationText, setExplanationText] = useState("");
  const [explanationProof, setExplanationProof] = useState<string>("");
  const [ownerNotesInput, setOwnerNotesInput] = useState("");
  const [syncPhysicalStock, setSyncPhysicalStock] = useState(true);
  const [submittingAnomaly, setSubmittingAnomaly] = useState(false);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
        setBlindProducts(data.blindCountProducts || []);
        setWarehouses(data.warehouses || []);
        setAdjustments(data.adjustments || []);
        setOpnameSessions(data.opnameSessions || []);
        setToleranceThresholdRp(data.toleranceThresholdRp ?? 50000);
        setOpnameSchedule(data.opnameSchedule ?? "MINGGUAN");
        if (!adjProductId && data.products?.[0]) {
          setAdjProductId(data.products[0].id);
        }
      }
    } catch {
      showToast("Gagal memuat data inventaris.", "error");
    } finally {
      setLoading(false);
    }
  }, [adjProductId, showToast]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleFileToDataUrl = (file: File | null, cb: (url: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") cb(reader.result);
    };
    reader.readAsDataURL(file);
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
        body: JSON.stringify({
          action: "REVIEW_ADJUSTMENT",
          adjustmentId: id,
          decision,
        }),
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
    for (const bp of blindProducts) {
      init[bp.id] = "";
    }
    setPhysicalInputs(init);
    setBlindModeActive(true);
  };

  const handleSubmitBlindOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    const counts = blindProducts
      .filter((bp) => physicalInputs[bp.id] !== undefined && physicalInputs[bp.id] !== "")
      .map((bp) => ({
        productId: bp.id,
        physicalStock: Number(physicalInputs[bp.id]),
      }));

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

      showToast(`Evaluasi Pemilik (${ownerDecision.replace(/_/g, " ")}) berhasil disimpan.`, "success");
      setSelectedAnomaly(null);
      await loadInventory();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAnomaly(false);
    }
  };

  return (
    <AppShell>
      {(session) => {
        const canApprove = session.permissions.inventaris?.canApprove;
        const canCreate = session.permissions.inventaris?.canCreate;

        const filteredProducts = products.filter((p) => {
          if (areaFilter !== "ALL" && p.category.areaType !== areaFilter) return false;
          return true;
        });

        return (
          <div className="space-y-6">
            {/* Top Header & 3 Main Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Inventaris, Perubahan Stok & Stok Opname (Blind Count)
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
                    <option value="ALL">Semua Area (Terbuka & Tertutup)</option>
                    <option value="TERBUKA">Area Terbuka (Akses Pelanggan)</option>
                    <option value="TERTUTUP">Area Tertutup (Khusus Pegawai)</option>
                  </select>
                </div>
              </div>

              {/* 3 Main Tabs */}
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
                    {adjustments.filter((a) => a.status === "MENUNGGU_PERSETUJUAN").length} Menunggu)
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
                  <span>Stok Opname & Audit Fisik (Blind Count)</span>
                </button>
              </div>
            </div>

            {/* TAB 1: STOK SAAT INI */}
            {activeTab === "current" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-10 text-center text-xs text-slate-600">
                    Memuat posisi stok inventaris...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-12 text-center space-y-2">
                    <Package
                      size={32}
                      weight="duotone"
                      className="mx-auto text-slate-400"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold text-slate-900">
                      Belum ada barang yang tercatat di inventaris.
                    </p>
                    <p className="text-xs text-slate-600">
                      Stok barang otomatis masuk setelah pengajuan Pembelian disetujui Pemilik.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                          <th className="py-3.5 px-4">SKU & Nama Barang</th>
                          <th className="py-3.5 px-4">Kategori & Mode Area</th>
                          <th className="py-3.5 px-4">Metode Stok</th>
                          <th className="py-3.5 px-4 text-right">Posisi Stok</th>
                          <th className="py-3.5 px-4 text-right">Batas Minimum</th>
                          <th className="py-3.5 px-4">Indikator Stok</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {filteredProducts.map((p) => {
                          const isLow =
                            p.stockMethod !== "RESEP" && p.currentStock <= p.minStockAlert;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="py-3.5 px-4">
                                <p className="font-extrabold text-slate-900">{p.name}</p>
                                <p className="font-mono text-[11px] text-slate-600">{p.sku}</p>
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-slate-800 mb-1">
                                  {p.category.name}
                                </p>
                                <StatusBadge status={p.category.areaType} />
                              </td>
                              <td className="py-3.5 px-4">
                                <StatusBadge status={p.stockMethod} />
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                                {p.stockMethod === "RESEP"
                                  ? "Mengikuti Bahan Baku"
                                  : `${formatNumber(p.currentStock)} ${p.sellUnit}`}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                                {p.stockMethod === "RESEP"
                                  ? "-"
                                  : `${formatNumber(p.minStockAlert)} ${p.sellUnit}`}
                              </td>
                              <td className="py-3.5 px-4">
                                {p.stockMethod === "RESEP" ? (
                                  <StatusBadge status="AMAN" customLabel="Produk Resep" />
                                ) : isLow ? (
                                  <StatusBadge
                                    status="PERLU_PERBAIKAN"
                                    customLabel="Stok Menipis"
                                  />
                                ) : (
                                  <StatusBadge status="AMAN" customLabel="Stok Aman" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PENGAJUAN PERUBAHAN STOK */}
            {activeTab === "adjustments" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Form Pengajuan Perubahan Stok */}
                {canCreate && (
                  <form
                    onSubmit={handleSubmitAdjustment}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                  >
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">
                        Ajukan Perubahan Stok Non-Penjualan
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Pengurangan/pemindahan stok wajib mencantumkan alasan jelas & bukti foto, serta baru berlaku setelah disetujui Pemilik
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="adj-prod"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Pilih Barang
                      </label>
                      <select
                        id="adj-prod"
                        required
                        value={adjProductId}
                        onChange={(e) => setAdjProductId(e.target.value)}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                      >
                        <option value="">-- Pilih Barang --</option>
                        {products
                          .filter((p) => p.stockMethod !== "RESEP")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Stok: {formatNumber(p.currentStock)} {p.sellUnit})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="adj-type"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Jenis Perubahan
                        </label>
                        <select
                          id="adj-type"
                          value={adjType}
                          onChange={(e) =>
                            setAdjType(
                              e.target.value as
                                | "RUSAK"
                                | "KEDALUWARSA"
                                | "HILANG"
                                | "DIKEMBALIKAN"
                                | "PINDAH_GUDANG"
                            )
                          }
                          className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                        >
                          <option value="RUSAK">1. Barang Rusak</option>
                          <option value="KEDALUWARSA">2. Barang Kedaluwarsa</option>
                          <option value="HILANG">3. Barang Hilang</option>
                          <option value="DIKEMBALIKAN">4. Dikembalikan ke Pemasok</option>
                          <option value="PINDAH_GUDANG">5. Pindah Antar-Gudang</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="adj-qty"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Jumlah Unit
                        </label>
                        <input
                          id="adj-qty"
                          type="number"
                          min={0.01}
                          step="any"
                          required
                          value={adjQty}
                          onChange={(e) => setAdjQty(Number(e.target.value))}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    {adjType === "PINDAH_GUDANG" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Gudang Asal
                          </label>
                          <select
                            value={fromWhId}
                            onChange={(e) => setFromWhId(e.target.value)}
                            className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                          >
                            <option value="">Pilih Gudang</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Gudang Tujuan
                          </label>
                          <select
                            value={toWhId}
                            onChange={(e) => setToWhId(e.target.value)}
                            className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                          >
                            <option value="">Pilih Gudang</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="adj-reason"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Alasan & Kronologi Perubahan (Wajib)
                      </label>
                      <textarea
                        id="adj-reason"
                        required
                        rows={3}
                        value={adjReason}
                        onChange={(e) => setAdjReason(e.target.value)}
                        placeholder="Jelaskan penyebab kerusakan, kedaluwarsa, atau perpindahan stok..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-slate-700 mb-1">
                        Bukti Foto Barang (Wajib)
                      </span>
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                        <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                        <span>
                          {adjProof
                            ? "Foto Bukti Terlampir (Klik untuk ganti)"
                            : "Unggah Foto Barang Rusak / Bukti"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileToDataUrl(e.target.files?.[0] || null, setAdjProof)
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingAdj}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                    >
                      <span>
                        {submittingAdj ? "Mengirim Pengajuan..." : "Kirim Pengajuan ke Pemilik"}
                      </span>
                    </button>
                  </form>
                )}

                {/* Daftar Pengajuan Perubahan Stok */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <h2 className="text-base font-extrabold text-slate-900">
                    Daftar Pengajuan Perubahan Stok
                  </h2>

                  {adjustments.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Belum ada pengajuan perubahan stok yang tercatat.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {adjustments.map((adj) => {
                        const allowApprove =
                          canApprove &&
                          adj.status === "MENUNGGU_PERSETUJUAN" &&
                          (session.user.role === "PEMILIK" ||
                            adj.requestedBy.id !== session.user.id);

                        return (
                          <div
                            key={adj.id}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-extrabold text-slate-900">
                                  {adj.product.name}
                                </span>
                                <StatusBadge
                                  status={adj.adjustmentType}
                                  tone="amber"
                                  customLabel={adj.adjustmentType}
                                />
                                <StatusBadge status={adj.status} />
                              </div>
                              <p className="text-xs text-slate-800">
                                <strong>Jumlah:</strong>{" "}
                                <span className="font-mono font-bold">
                                  {formatNumber(adj.quantity)} {adj.product.sellUnit}
                                </span>{" "}
                                • <strong>Alasan:</strong> {adj.reason}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                Diajukan oleh {adj.requestedBy.name} ({adj.requestedBy.role}) •{" "}
                                {formatDateTimeJakarta(adj.createdAt)}
                              </p>
                            </div>

                            {allowApprove && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleReviewAdjustment(adj.id, "DISETUJUI")}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#166534] text-white text-xs font-bold cursor-pointer"
                                >
                                  <CheckCircle size={15} weight="bold" aria-hidden="true" />
                                  <span>Setujui</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewAdjustment(adj.id, "DITOLAK")}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#9F1239] text-white text-xs font-bold cursor-pointer"
                                >
                                  <XCircle size={15} weight="bold" aria-hidden="true" />
                                  <span>Tolak</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: STOK OPNAME & AUDIT FISIK (BLIND COUNT) */}
            {activeTab === "opname" && (
              <div className="space-y-6">
                {/* Active Audit Schedule Banner & Trigger */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <EyeSlash size={20} weight="duotone" className="text-[#334E6B]" aria-hidden="true" />
                      <h2 className="text-base font-extrabold text-slate-900">
                        Stok Opname & Audit Fisik Objektif (Blind Count)
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600">
                      Jadwal Aktif: <strong>{opnameSchedule}</strong> • Batas Toleransi Kerugian:{" "}
                      <strong className="font-mono text-[#334E6B]">
                        {formatRupiah(toleranceThresholdRp)}
                      </strong>
                      . Saat pegawai menghitung fisik, angka stok sistem disembunyikan agar perhitungan objektif.
                    </p>
                  </div>

                  {canCreate && !blindModeActive && (
                    <button
                      type="button"
                      onClick={handleStartBlindOpname}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer shrink-0"
                    >
                      <ClipboardText size={18} weight="bold" aria-hidden="true" />
                      <span>Mulai Sesi Hitung Fisik Baru</span>
                    </button>
                  )}
                </div>

                {/* Blind Count Input Form (System Stock Hidden) */}
                {blindModeActive && (
                  <form
                    onSubmit={handleSubmitBlindOpname}
                    className="bg-white rounded-2xl border-2 border-[#334E6B] p-5 shadow-md space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E8EEF4] text-[#334E6B] text-xs font-extrabold">
                          <EyeSlash size={14} weight="bold" aria-hidden="true" />
                          Mode Blind Count Aktif (Stok Sistem Disembunyikan)
                        </span>
                        <p className="text-xs text-slate-600 mt-1">
                          Hitung jumlah fisik nyata di rak/gudang dan masukkan angkanya di bawah ini.
                        </p>
                      </div>
                      <input
                        type="text"
                        required
                        value={opnameTitle}
                        onChange={(e) => setOpnameTitle(e.target.value)}
                        aria-label="Judul sesi stok opname"
                        className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>

                    {blindProducts.length === 0 ? (
                      <p className="text-xs text-slate-600 py-6 text-center">
                        Belum ada barang fisik di katalog untuk dihitung.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                              <th className="py-3 px-4">SKU & Nama Barang</th>
                              <th className="py-3 px-4">Kategori & Area</th>
                              <th className="py-3 px-4">Stok Sistem</th>
                              <th className="py-3 px-4 w-56">Input Jumlah Fisik Nyata</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {blindProducts.map((bp) => (
                              <tr key={bp.id}>
                                <td className="py-3 px-4">
                                  <p className="font-bold text-slate-900">{bp.name}</p>
                                  <p className="font-mono text-[11px] text-slate-500">{bp.sku}</p>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-semibold text-slate-700 mr-2">
                                    {bp.categoryName}
                                  </span>
                                  <StatusBadge status={bp.areaType} />
                                </td>
                                <td className="py-3 px-4">
                                  <span className="inline-flex items-center gap-1 text-slate-500 italic">
                                    <EyeSlash size={14} aria-hidden="true" />
                                    Disembunyikan (Blind Count)
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={physicalInputs[bp.id] ?? ""}
                                      onChange={(e) =>
                                        setPhysicalInputs((prev) => ({
                                          ...prev,
                                          [bp.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="0"
                                      aria-label={`Jumlah fisik ${bp.name}`}
                                      className="w-32 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900"
                                    />
                                    <span className="font-mono text-slate-600">{bp.sellUnit}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setBlindModeActive(false)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={submittingOpname}
                        className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                      >
                        {submittingOpname
                          ? "Memproses Perbandingan..."
                          : "Kirim Hasil Fisik & Tampilkan Perbandingan Sistem"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Submitted Opname Sessions & Comparison Results */}
                <div className="space-y-4">
                  {opnameSessions.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-600">
                      Belum ada riwayat sesi Stok Opname yang dikirim. Klik &ldquo;Mulai Sesi Hitung Fisik Baru&rdquo; untuk memulai pencocokan stok.
                    </div>
                  ) : (
                    opnameSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                      >
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-900">{sess.title}</h3>
                            <p className="text-[11px] text-slate-600">
                              Oleh: {sess.createdBy.name} ({sess.createdBy.role}) •{" "}
                              {formatDateTimeJakarta(sess.createdAt)} • Batas Toleransi:{" "}
                              <strong className="font-mono">
                                {formatRupiah(sess.toleranceThreshold)}
                              </strong>
                            </p>
                          </div>
                          <StatusBadge
                            status={
                              sess.items.some((i) => i.exceedsTolerance)
                                ? "PERLU_DIPERIKSA"
                                : "SESUAI"
                            }
                          />
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-white text-[11px] font-bold uppercase text-slate-600">
                                <th className="py-3 px-4">Barang & Area</th>
                                <th className="py-3 px-4 text-right">Stok Sistem</th>
                                <th className="py-3 px-4 text-right">Stok Fisik</th>
                                <th className="py-3 px-4 text-right">Selisih Unit</th>
                                <th className="py-3 px-4 text-right">Nilai Selisih (Rp)</th>
                                <th className="py-3 px-4">Status Toleransi</th>
                                <th className="py-3 px-4">Evaluasi Pemilik</th>
                                <th className="py-3 px-4 text-right">Penyelesaian</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {sess.items.map((item) => (
                                <tr
                                  key={item.id}
                                  className={
                                    item.exceedsTolerance
                                      ? "bg-[#FFF1F2]/40 hover:bg-[#FFF1F2]/80"
                                      : "hover:bg-slate-50"
                                  }
                                >
                                  <td className="py-3 px-4">
                                    <p className="font-bold text-slate-900">
                                      {item.product.name}
                                    </p>
                                    <div className="mt-1">
                                      <StatusBadge status={item.areaType} />
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono">
                                    {formatNumber(item.systemStock)} {item.product.sellUnit}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-bold">
                                    {formatNumber(item.physicalStock)} {item.product.sellUnit}
                                  </td>
                                  <td
                                    className={`py-3 px-4 text-right font-mono font-extrabold ${
                                      item.differenceUnit === 0
                                        ? "text-[#166534]"
                                        : "text-[#9F1239]"
                                    }`}
                                  >
                                    {item.differenceUnit > 0
                                      ? `+${formatNumber(item.differenceUnit)}`
                                      : formatNumber(item.differenceUnit)}{" "}
                                    {item.product.sellUnit}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                    {formatRupiah(item.lossValueRp)}
                                  </td>
                                  <td className="py-3 px-4">
                                    <StatusBadge status={item.toleranceStatus} />
                                  </td>
                                  <td className="py-3 px-4">
                                    <StatusBadge status={item.ownerDecision} />
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    {item.differenceUnit !== 0 && (
                                      <button
                                        type="button"
                                        onClick={() => openAnomalyDrawer(item)}
                                        className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] cursor-pointer"
                                      >
                                        {item.exceedsTolerance
                                          ? "Penyelesaian Anomali"
                                          : "Lihat / Penjelasan"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* RIGHT SIDE DRAWER: Penyelesaian Anomali Selisih Stok */}
            <SlideDrawer
              isOpen={Boolean(selectedAnomaly)}
              onClose={() => setSelectedAnomaly(null)}
              title={
                selectedAnomaly
                  ? `Evaluasi Selisih Stok: ${selectedAnomaly.product.name}`
                  : "Penyelesaian Anomali"
              }
              subtitle="Evaluasi adil berbasis Area Pengawasan, penjelasan pegawai, dan bukti pendukung"
            >
              {selectedAnomaly && (
                <div className="space-y-5 text-xs">
                  {/* Area Fairness Context Box */}
                  <div
                    className={`p-4 rounded-xl border space-y-2 ${
                      selectedAnomaly.areaType === "TERBUKA"
                        ? "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]"
                        : "bg-[#FFF1F2] border-[#FECDD3] text-[#9F1239]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm">
                        Konteks Keadilan Audit: Area {selectedAnomaly.areaType}
                      </span>
                      <StatusBadge status={selectedAnomaly.toleranceStatus} />
                    </div>
                    <p>
                      {selectedAnomaly.areaType === "TERBUKA"
                        ? "Barang berada di Area Terbuka (dapat diakses langsung oleh pelanggan). Selisih dapat dipengaruhi oleh barang jatuh/rusak, kelalaian pelanggan, atau kesalahan hitung. Ditandai sebagai bahan pemeriksaan, bukan tuduhan otomatis kepada pegawai."
                        : "Barang berada di Area Tertutup (gudang/dapur khusus akses pegawai). Pengawasan dilakukan lebih ketat berdasarkan catatan aktivitas, bukti foto, dan penjelasan pegawai yang bertugas."}
                    </p>
                  </div>

                  {/* Numeric Comparison */}
                  <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-slate-500">Stok Sistem</p>
                      <p className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                        {formatNumber(selectedAnomaly.systemStock)}{" "}
                        {selectedAnomaly.product.sellUnit}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Stok Fisik</p>
                      <p className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                        {formatNumber(selectedAnomaly.physicalStock)}{" "}
                        {selectedAnomaly.product.sellUnit}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nilai Selisih</p>
                      <p className="font-mono text-sm font-extrabold text-[#9F1239] mt-0.5">
                        {formatRupiah(selectedAnomaly.lossValueRp)}
                      </p>
                    </div>
                  </div>

                  {/* Employee Explanation & Proof Upload Form */}
                  <form
                    onSubmit={handleSaveEmployeeExplanation}
                    className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                  >
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Penjelasan Pegawai & Bukti Pendukung
                    </h3>
                    <div>
                      <label
                        htmlFor="anom-exp"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Keterangan / Penjelasan Pegawai
                      </label>
                      <textarea
                        id="anom-exp"
                        required
                        rows={3}
                        value={explanationText}
                        onChange={(e) => setExplanationText(e.target.value)}
                        placeholder="Tuliskan penjelasan mengenai penyebab selisih stok yang ditemukan..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                      />
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-slate-700 mb-1">
                        Unggah Bukti Pendukung (Foto Barang / Catatan)
                      </span>
                      <label className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
                        <FileArrowUp size={18} weight="bold" aria-hidden="true" />
                        <span>
                          {explanationProof
                            ? "Bukti Foto Terlampir (Klik untuk ganti)"
                            : "Lampirkan Foto Bukti Pendukung"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileToDataUrl(
                              e.target.files?.[0] || null,
                              setExplanationProof
                            )
                          }
                        />
                      </label>
                    </div>

                    {explanationProof && (
                      <div className="p-2 rounded-xl bg-slate-900 flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={explanationProof}
                          alt="Bukti pendukung penjelasan selisih stok"
                          width={320}
                          height={220}
                          className="max-h-44 w-auto object-contain rounded"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submittingAnomaly}
                      className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer"
                    >
                      Simpan Penjelasan & Bukti Pegawai
                    </button>
                  </form>

                  {/* Owner Evaluation Decision Panel */}
                  {canApprove && (
                    <div className="p-4 rounded-xl border-2 border-[#334E6B] bg-[#E8EEF4]/40 space-y-3">
                      <h3 className="text-sm font-extrabold text-[#334E6B]">
                        Keputusan Evaluasi Pemilik
                      </h3>

                      <div>
                        <label
                          htmlFor="owner-anom-notes"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Catatan Keputusan Pemilik
                        </label>
                        <textarea
                          id="owner-anom-notes"
                          rows={2}
                          value={ownerNotesInput}
                          onChange={(e) => setOwnerNotesInput(e.target.value)}
                          placeholder="Tuliskan hasil evaluasi atau instruksi tindak lanjut..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncPhysicalStock}
                          onChange={(e) => setSyncPhysicalStock(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        <span>
                          Sesuaikan stok sistem mengikuti jumlah stok fisik saat Terima Penjelasan
                        </span>
                      </label>

                      <div className="grid grid-cols-1 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={submittingAnomaly}
                          onClick={() => handleOwnerEvaluateAnomaly("TERIMA_PENJELASAN")}
                          className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#166534] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                        >
                          1. Terima Penjelasan
                        </button>
                        <button
                          type="button"
                          disabled={submittingAnomaly}
                          onClick={() => handleOwnerEvaluateAnomaly("MINTA_INFO_TAMBAHAN")}
                          className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#B45309] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                        >
                          2. Minta Info Tambahan
                        </button>
                        <button
                          type="button"
                          disabled={submittingAnomaly}
                          onClick={() => handleOwnerEvaluateAnomaly("TANDAI_TINDAK_LANJUT")}
                          className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#9F1239] text-white text-xs font-extrabold hover:opacity-95 cursor-pointer"
                        >
                          3. Tandai Tindak Lanjut
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SlideDrawer>
          </div>
        );
      }}
    </AppShell>
  );
}
