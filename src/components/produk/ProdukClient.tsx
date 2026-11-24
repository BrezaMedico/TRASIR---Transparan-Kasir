"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData, invalidateCache, setCachedData } from "@/lib/client-cache";
import { formatRoleLabel, isStoreAdmin } from "@/lib/rbac-shared";
import {
  Plus,
  MagnifyingGlass,
  Package,
  CookingPot,
  ClockCounterClockwise,
  CheckCircle,
  XCircle,
  Eye,
} from "@phosphor-icons/react";
import {
  computeProductMaxPortions,
  getUnitDisplayLabel,
  parseRequestInitialStock,
  type CategoryOption,
  type InitialProdukCatalog,
  type ProductItem,
  type ProductRequestItem,
  type UnitOption,
} from "./types";
import { RawMaterialDrawer } from "./RawMaterialDrawer";
import { ProductDrawer } from "./ProductDrawer";

export function ProdukClient({
  initialCatalog = null,
}: {
  initialCatalog?: InitialProdukCatalog | null;
}) {
  const { showToast } = useToast();

  const resolvedInitial =
    initialCatalog ?? getCachedData<InitialProdukCatalog>("/api/products") ?? null;
  if (initialCatalog) {
    setCachedData("/api/products", initialCatalog);
  }

  const [pageTab, setPageTab] = useState<"catalog" | "materials" | "requests">("catalog");
  const [products, setProducts] = useState<ProductItem[]>(resolvedInitial?.products || []);
  const [categories, setCategories] = useState<CategoryOption[]>(
    resolvedInitial?.categories || []
  );
  const [units, setUnits] = useState<UnitOption[]>(resolvedInitial?.units || []);
  const [requests, setRequests] = useState<ProductRequestItem[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(
    resolvedInitial?.pendingRequestsCount ?? 0
  );
  const [loading, setLoading] = useState(!resolvedInitial);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [reqStatusFilter, setReqStatusFilter] = useState("ALL");

  // Drawers
  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProductItem | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  // Review Request Drawer
  const [reviewingRequest, setReviewingRequest] = useState<ProductRequestItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewingBusy, setReviewingBusy] = useState(false);

  const skippedInitialFetch = useRef(Boolean(initialCatalog));

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tab") === "requests") {
        setPageTab("requests");
      } else if (sp.get("tab") === "materials") {
        setPageTab("materials");
      }
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch("/api/product-requests", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
        setPendingRequestsCount(data.pendingCount ?? 0);
      }
    } catch {
      // silent fallback
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const cached = getCachedData<InitialProdukCatalog>("/api/products");
    if (!cached && products.length === 0) {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<InitialProdukCatalog>("/api/products", {
        force: true,
      });
      if (ok) {
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setUnits(data.units || []);
        if (typeof data.pendingRequestsCount === "number") {
          setPendingRequestsCount(data.pendingRequestsCount);
        }
      }
    } catch {
      if (!cached && products.length === 0) {
        showToast("Gagal memuat katalog produk.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast, products.length]);

  useEffect(() => {
    loadRequests();
    if (skippedInitialFetch.current) {
      skippedInitialFetch.current = false;
      return;
    }
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialDrawerOpen(true);
  };

  const openEditMaterial = (mat: ProductItem) => {
    setEditingMaterial(mat);
    setMaterialDrawerOpen(true);
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductDrawerOpen(true);
  };

  const openEditProduct = (prod: ProductItem) => {
    setEditingProduct(prod);
    setProductDrawerOpen(true);
  };

  const handleQuickRestockPack = async (mat: ProductItem) => {
    const addAmount = mat.conversionRatio > 0 ? mat.conversionRatio : 1;
    const nextStock = Number((mat.currentStock + addAmount).toFixed(2));
    setRestockingId(mat.id);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mat.id,
          sku: mat.sku,
          barcode: mat.barcode,
          name: mat.name,
          categoryId: mat.categoryId,
          stockMethod: mat.stockMethod,
          isRawMaterial: true,
          purchaseUnit: mat.purchaseUnit,
          sellUnit: mat.sellUnit,
          conversionRatio: mat.conversionRatio || 1,
          costPrice: mat.costPrice,
          sellPrice: mat.sellPrice,
          currentStock: nextStock,
          minStockAlert: mat.minStockAlert,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menambah stok bahan baku.", "error");
        return;
      }
      showToast(
        `Stok "${mat.name}" bertambah +${formatNumber(addAmount)} ${getUnitDisplayLabel(mat.sellUnit)} (total ${formatNumber(nextStock)} ${getUnitDisplayLabel(mat.sellUnit)}).`,
        "success"
      );
      invalidateCache("/api/dashboard");
      await loadCatalog();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setRestockingId(null);
    }
  };

  const handleReviewRequest = async (decision: "DISETUJUI" | "DITOLAK") => {
    if (!reviewingRequest) return;
    setReviewingBusy(true);
    try {
      const res = await fetch(`/api/product-requests/${reviewingRequest.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          rejectionReason: decision === "DITOLAK" ? rejectionReason.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan.", "error");
        return;
      }

      showToast(
        decision === "DISETUJUI"
          ? `"${reviewingRequest.name}" disetujui dan langsung aktif.`
          : `Pengajuan "${reviewingRequest.name}" ditolak.`,
        decision === "DISETUJUI" ? "success" : "info"
      );
      setReviewingRequest(null);
      setRejectionReason("");
      invalidateCache("/api/dashboard");
      await Promise.all([loadCatalog(), loadRequests()]);
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setReviewingBusy(false);
    }
  };

  return (
    <AppShell>
      {(session) => {
        const isAdmin = isStoreAdmin(session.user.role);
        const canCreate = Boolean(session.permissions.produk?.canCreate);
        const canEdit = Boolean(session.permissions.produk?.canEdit);
        const q = search.trim().toLowerCase();

        const sellableProducts = products.filter((p) => !p.isRawMaterial);
        const rawMaterialProducts = products.filter((p) => p.isRawMaterial);

        const filteredSellable = sellableProducts.filter((p) => {
          if (methodFilter === "RESEP" && p.stockMethod !== "RESEP") return false;
          if (methodFilter === "READY" && p.stockMethod === "RESEP") return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        });

        const filteredMaterials = rawMaterialProducts.filter((p) => {
          if (!q) return true;
          return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
        });

        const filteredRequests = requests.filter((r) => {
          if (reqStatusFilter !== "ALL" && r.status !== reqStatusFilter) return false;
          if (!q) return true;
          return (
            r.name.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.requestedBy.name.toLowerCase().includes(q)
          );
        });

        return (
          <div className="space-y-5">
            {/* Header Utama & Aksi Cepat */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Produk &amp; Bahan Baku
                  </h1>
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                    Masukkan bahan baku terlebih dahulu (misalnya Susu Ultra Milk 1000 ml dan harga aslinya), lalu pecah takarannya dengan mudah saat membuat menu resep.
                  </p>
                </div>

                {canCreate && (
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={openAddMaterial}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] text-xs font-extrabold hover:bg-[#CCFBF1] transition-colors duration-150 cursor-pointer"
                    >
                      <CookingPot size={17} weight="bold" aria-hidden="true" />
                      <span>+ Tambah Bahan Baku</span>
                    </button>
                    <button
                      type="button"
                      onClick={openAddProduct}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] transition-colors duration-150 cursor-pointer"
                    >
                      <Plus size={17} weight="bold" aria-hidden="true" />
                      <span>{isAdmin ? "+ Tambah Menu / Produk" : "+ Ajukan Menu Baru"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3 Tab Bersih */}
              <div
                role="tablist"
                aria-label="Tab Produk dan Bahan Baku"
                className="flex flex-wrap gap-2 pt-3 border-t border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={pageTab === "catalog"}
                  onClick={() => setPageTab("catalog")}
                  className={`inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer ${
                    pageTab === "catalog"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Package size={16} weight="bold" aria-hidden="true" />
                  <span>Menu &amp; Produk Jual ({sellableProducts.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={pageTab === "materials"}
                  onClick={() => setPageTab("materials")}
                  className={`inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer ${
                    pageTab === "materials"
                      ? "bg-[#0F766E] text-white"
                      : "bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] hover:bg-[#CCFBF1]"
                  }`}
                >
                  <CookingPot size={16} weight="bold" aria-hidden="true" />
                  <span>Bahan Baku ({rawMaterialProducts.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={pageTab === "requests"}
                  onClick={() => {
                    setPageTab("requests");
                    loadRequests();
                  }}
                  className={`inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer ${
                    pageTab === "requests"
                      ? "bg-[#334E6B] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ClockCounterClockwise size={16} weight="bold" aria-hidden="true" />
                  <span>{isAdmin ? "Persetujuan" : "Pengajuan Saya"}</span>
                  {pendingRequestsCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                        pageTab === "requests"
                          ? "bg-[#3DC2CA] text-slate-950"
                          : "bg-[#FC5086] text-white"
                      }`}
                    >
                      {pendingRequestsCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filter Pencarian Ringkas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="relative flex-1 max-w-md">
                  <MagnifyingGlass
                    size={16}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      pageTab === "materials"
                        ? "Cari nama bahan baku (misal: Susu, Gula, Teh)..."
                        : pageTab === "requests"
                        ? "Cari nama produk atau pengaju..."
                        : "Cari nama menu atau produk..."
                    }
                    aria-label="Cari di daftar"
                    className="w-full pl-9 pr-3.5 h-10 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>

                {pageTab === "catalog" && (
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "ALL", label: "Semua" },
                        { id: "RESEP", label: "Menu Resep" },
                        { id: "READY", label: "Langsung Jual" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setMethodFilter(f.id)}
                        className={`px-3 min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                          methodFilter === f.id
                            ? "bg-[#334E6B] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}

                {pageTab === "requests" && (
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "ALL", label: "Semua" },
                        { id: "MENUNGGU_PERSETUJUAN", label: "Menunggu" },
                        { id: "DISETUJUI", label: "Disetujui" },
                        { id: "DITOLAK", label: "Ditolak" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setReqStatusFilter(st.id)}
                        className={`px-3 min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                          reqStatusFilter === st.id
                            ? "bg-[#334E6B] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* TAB 1: MENU & PRODUK JUAL */}
            {pageTab === "catalog" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-10 text-center text-xs text-slate-600">
                    Memuat daftar menu dan produk...
                  </div>
                ) : filteredSellable.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <Package
                      size={36}
                      weight="duotone"
                      className="mx-auto text-slate-400"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-extrabold text-slate-900">
                        Belum ada menu atau produk jual.
                      </p>
                      <p className="text-xs text-slate-600 max-w-md mx-auto">
                        Jika Anda menjual minuman atau makanan racikan, masukkan bahan bakunya dulu di tab Bahan Baku, lalu buat menunya di sini.
                      </p>
                    </div>
                    {canCreate && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={openAddMaterial}
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] text-xs font-bold cursor-pointer"
                        >
                          <CookingPot size={16} weight="bold" aria-hidden="true" />
                          <span>1. Input Bahan Baku</span>
                        </button>
                        <button
                          type="button"
                          onClick={openAddProduct}
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                        >
                          <Plus size={16} weight="bold" aria-hidden="true" />
                          <span>2. Tambah Menu Jual</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredSellable.map((prod) => {
                      const isRecipe = prod.stockMethod === "RESEP";
                      const maxPortions = computeProductMaxPortions(prod, products);
                      const displaySellPrice =
                        isRecipe && prod.variants.length > 0
                          ? prod.variants[0].sellPrice
                          : prod.sellPrice;
                      const displayCostPrice =
                        isRecipe && prod.variants.length > 0 && prod.variants[0].costPrice > 0
                          ? prod.variants[0].costPrice
                          : prod.costPrice;
                      const isLow = isRecipe
                        ? maxPortions <= 0
                        : prod.currentStock <= prod.minStockAlert;

                      return (
                        <div
                          key={prod.id}
                          className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-extrabold text-slate-900">{prod.name}</p>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                  isRecipe
                                    ? "bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4]"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {isRecipe ? "Menu Resep" : "Langsung Jual"}
                              </span>
                            </div>

                            {isRecipe && prod.variants[0]?.ingredients.length ? (
                              <p className="text-xs text-slate-600">
                                Bahan:{" "}
                                {prod.variants[0].ingredients
                                  .map(
                                    (ing) =>
                                      `${ing.material.name} (${formatNumber(ing.quantity)} ${getUnitDisplayLabel(ing.unit)})`
                                  )
                                  .join(", ")}
                                {prod.variants.length > 1
                                  ? ` • ${prod.variants.length} ukuran`
                                  : ""}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-600">
                                Satuan: {getUnitDisplayLabel(prod.sellUnit)} • SKU: {prod.sku}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0">
                            <div className="text-left sm:text-right">
                              <p className="text-sm font-extrabold font-mono text-[#334E6B] tabular-nums">
                                {formatRupiah(displaySellPrice)}
                              </p>
                              <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                                Modal: {formatRupiah(displayCostPrice)}
                              </p>
                            </div>

                            <div className="text-left sm:text-right min-w-[116px]">
                              <p
                                className={`text-xs font-extrabold font-mono tabular-nums ${
                                  isLow ? "text-[#9F1239]" : "text-[#0F766E]"
                                }`}
                              >
                                {isRecipe
                                  ? `Siap: ${formatNumber(maxPortions)} porsi`
                                  : `${formatNumber(prod.currentStock)} ${getUnitDisplayLabel(prod.sellUnit)}`}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {isRecipe ? "Dari stok bahan" : "Stok tersedia"}
                              </p>
                            </div>

                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditProduct(prod)}
                                className="px-3.5 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#334E6B] cursor-pointer"
                              >
                                Ubah
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BAHAN BAKU (RAMAH PEMULA) */}
            {pageTab === "materials" && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {loading ? (
                    <div className="p-10 text-center text-xs text-slate-600">
                      Memuat daftar bahan baku...
                    </div>
                  ) : filteredMaterials.length === 0 ? (
                    <div className="p-10 text-center space-y-3">
                      <CookingPot
                        size={36}
                        weight="duotone"
                        className="mx-auto text-[#0F766E]"
                        aria-hidden="true"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-extrabold text-slate-900">
                          Belum ada bahan baku yang dimasukkan.
                        </p>
                        <p className="text-xs text-slate-600 max-w-md mx-auto">
                          Contoh: tambah <strong>Susu Ultra Milk</strong> dengan isi <strong>1000 ml</strong> dan harga beli <strong>Rp 20.000</strong>. Nanti pemecahannya langsung diatur di bagian resep.
                        </p>
                      </div>
                      {canCreate && (
                        <button
                          type="button"
                          onClick={openAddMaterial}
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#0F766E] text-white text-xs font-extrabold cursor-pointer"
                        >
                          <Plus size={16} weight="bold" aria-hidden="true" />
                          <span>Tambah Bahan Baku Pertama</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {filteredMaterials.map((mat) => {
                        const uLabel = getUnitDisplayLabel(mat.sellUnit);
                        const packSize = mat.conversionRatio > 0 ? mat.conversionRatio : 1;
                        const packPrice = Math.round(mat.costPrice * packSize);
                        const isLow = mat.currentStock <= mat.minStockAlert;
                        const busy = restockingId === mat.id;

                        return (
                          <div
                            key={mat.id}
                            className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                          >
                            <div className="space-y-1 min-w-0">
                              <p className="text-sm font-extrabold text-slate-900">{mat.name}</p>
                              <p className="text-xs text-slate-600">
                                1 kemasan:{" "}
                                <strong className="font-mono text-slate-800">
                                  {formatNumber(packSize)} {uLabel}
                                </strong>{" "}
                                • Harga asli:{" "}
                                <strong className="font-mono text-slate-800">
                                  {formatRupiah(packPrice)}
                                </strong>{" "}
                                <span className="text-slate-500">
                                  ({formatRupiah(mat.costPrice)}/{uLabel})
                                </span>
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                              <div className="text-left sm:text-right min-w-[110px]">
                                <p
                                  className={`text-sm font-extrabold font-mono tabular-nums ${
                                    isLow ? "text-[#9F1239]" : "text-[#0F766E]"
                                  }`}
                                >
                                  {formatNumber(mat.currentStock)} {uLabel}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {isLow ? "Stok mulai menipis" : "Sisa stok siap resep"}
                                </p>
                              </div>

                              {canEdit && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    aria-busy={busy}
                                    onClick={() => handleQuickRestockPack(mat)}
                                    className="px-3 min-h-[40px] rounded-xl bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4] hover:bg-[#CCFBF1] disabled:opacity-50 text-xs font-bold cursor-pointer"
                                  >
                                    {busy ? "Menambah..." : `+1 Kemasan`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditMaterial(mat)}
                                    className="px-3.5 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#334E6B] cursor-pointer"
                                  >
                                    Ubah
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: PERSETUJUAN PRODUK BARU */}
            {pageTab === "requests" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    {isAdmin
                      ? "Antrean Persetujuan Produk & Bahan Baru"
                      : "Riwayat Pengajuan Anda"}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {isAdmin
                      ? "Periksa detail yang diajukan pegawai sebelum mengaktifkannya."
                      : "Pengajuan Anda akan langsung aktif setelah disetujui Pemilik atau Manajer."}
                  </p>
                </div>

                {loadingRequests ? (
                  <div className="py-10 text-center text-xs text-slate-600">
                    Memuat daftar pengajuan...
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada pengajuan pada kategori ini.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRequests.map((req) => {
                      const reqInitStock = parseRequestInitialStock(req.variantsJson);
                      return (
                        <div
                          key={req.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-extrabold text-slate-900">
                                {req.name}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-200 text-[11px] font-bold text-slate-700">
                                {req.isRawMaterial ? "Bahan Baku" : "Menu / Produk"}
                              </span>
                              <StatusBadge status={req.status} />
                            </div>
                            <p className="text-xs text-slate-700">
                              Modal:{" "}
                              <strong className="font-mono">{formatRupiah(req.costPrice)}</strong>
                              {!req.isRawMaterial && (
                                <>
                                  {" "}• Harga Jual:{" "}
                                  <strong className="font-mono text-[#334E6B]">
                                    {formatRupiah(req.sellPrice)}
                                  </strong>
                                </>
                              )}
                              {reqInitStock !== null && reqInitStock > 0 && (
                                <>
                                  {" "}• Stok Awal:{" "}
                                  <strong className="font-mono text-[#0F766E]">
                                    {formatNumber(reqInitStock)} {getUnitDisplayLabel(req.sellUnit)}
                                  </strong>
                                </>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              Diajukan oleh <strong>{req.requestedBy.name}</strong> (
                              {formatRoleLabel(req.requestedBy.role)}) pada{" "}
                              {formatDateTimeJakarta(req.createdAt)}
                            </p>
                            {req.status === "DITOLAK" && req.rejectionReason && (
                              <p className="text-xs font-semibold text-[#9F1239] bg-[#FFF1F2] border border-[#FECDD3] rounded-lg px-3 py-1.5 mt-1">
                                Alasan Penolakan: {req.rejectionReason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAdmin && req.status === "MENUNGGU_PERSETUJUAN" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewingRequest(req);
                                  setRejectionReason("");
                                }}
                                className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] cursor-pointer"
                              >
                                <Eye size={16} weight="bold" aria-hidden="true" />
                                <span>Tinjau &amp; Putuskan</span>
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-slate-600">
                                {req.status === "MENUNGGU_PERSETUJUAN"
                                  ? "Menunggu tinjauan"
                                  : req.status === "DISETUJUI"
                                  ? "Sudah aktif"
                                  : "Ditolak"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* DRAWER TINJAUAN PERSETUJUAN */}
            <SlideDrawer
              isOpen={Boolean(reviewingRequest)}
              onClose={() => setReviewingRequest(null)}
              title={
                reviewingRequest
                  ? `Tinjau Pengajuan: ${reviewingRequest.name}`
                  : "Tinjau Pengajuan"
              }
              subtitle="Periksa rincian harga dan stok sebelum mengaktifkan"
            >
              {reviewingRequest && (
                <div className="space-y-5 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Status</span>
                      <StatusBadge status={reviewingRequest.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Pengaju</span>
                      <span className="font-bold text-slate-900">
                        {reviewingRequest.requestedBy.name} (
                        {formatRoleLabel(reviewingRequest.requestedBy.role)})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Waktu Pengajuan</span>
                      <span className="font-semibold text-slate-800">
                        {formatDateTimeJakarta(reviewingRequest.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-slate-500">Nama</p>
                      <p className="font-bold text-slate-900 mt-0.5">{reviewingRequest.name}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Jenis</p>
                      <p className="font-bold text-slate-900 mt-0.5">
                        {reviewingRequest.isRawMaterial ? "Bahan Baku" : "Menu / Produk Jual"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Modal (HPP)</p>
                      <p className="font-mono font-bold text-[#B45309] mt-0.5">
                        {formatRupiah(reviewingRequest.costPrice)} /{" "}
                        {getUnitDisplayLabel(reviewingRequest.sellUnit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Harga Jual</p>
                      <p className="font-mono font-extrabold text-[#334E6B] mt-0.5">
                        {reviewingRequest.isRawMaterial
                          ? "Tidak dijual langsung"
                          : formatRupiah(reviewingRequest.sellPrice)}
                      </p>
                    </div>
                    {(() => {
                      const initStock = parseRequestInitialStock(reviewingRequest.variantsJson);
                      if (initStock === null) return null;
                      return (
                        <div>
                          <p className="text-slate-500">Stok Awal Diajukan</p>
                          <p className="font-mono font-extrabold text-[#0F766E] mt-0.5">
                            {formatNumber(initStock)}{" "}
                            {getUnitDisplayLabel(reviewingRequest.sellUnit)}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label
                      htmlFor="prod-reject-reason"
                      className="block font-bold text-slate-700 mb-1"
                    >
                      Alasan Penolakan (isi jika menolak)
                    </label>
                    <textarea
                      id="prod-reject-reason"
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Contoh: Harga modal perlu diperiksa ulang..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      disabled={reviewingBusy}
                      aria-busy={reviewingBusy}
                      onClick={() => handleReviewRequest("DISETUJUI")}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-xl bg-[#0F766E] text-white text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle size={18} weight="bold" aria-hidden="true" />
                      <span>{reviewingBusy ? "Memproses..." : "Setujui & Aktifkan"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewingBusy}
                      aria-busy={reviewingBusy}
                      onClick={() => handleReviewRequest("DITOLAK")}
                      className="inline-flex items-center justify-center gap-2 px-4 min-h-[48px] rounded-xl bg-[#9F1239] text-white text-xs font-extrabold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle size={18} weight="bold" aria-hidden="true" />
                      <span>Tolak Pengajuan</span>
                    </button>
                  </div>
                </div>
              )}
            </SlideDrawer>

            {/* DRAWER KHUSUS BAHAN BAKU */}
            <RawMaterialDrawer
              isOpen={materialDrawerOpen}
              onClose={() => setMaterialDrawerOpen(false)}
              editingProduct={editingMaterial}
              categories={categories}
              units={units}
              isAdmin={isAdmin}
              canSave={editingMaterial ? canEdit : canCreate}
              onSaved={async (mode) => {
                invalidateCache("/api/dashboard");
                if (mode === "REQUEST") {
                  setPageTab("requests");
                  await loadRequests();
                } else {
                  setPageTab("materials");
                  await loadCatalog();
                }
              }}
            />

            {/* DRAWER KHUSUS MENU & PRODUK JUAL */}
            <ProductDrawer
              isOpen={productDrawerOpen}
              onClose={() => setProductDrawerOpen(false)}
              editingProduct={editingProduct}
              products={products}
              categories={categories}
              units={units}
              isAdmin={isAdmin}
              canSave={editingProduct ? canEdit : canCreate}
              onSwitchToAddMaterial={() => {
                setProductDrawerOpen(false);
                openAddMaterial();
              }}
              onSaved={async (mode) => {
                invalidateCache("/api/dashboard");
                if (mode === "REQUEST") {
                  setPageTab("requests");
                  await loadRequests();
                } else {
                  setPageTab("catalog");
                  await loadCatalog();
                }
              }}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
