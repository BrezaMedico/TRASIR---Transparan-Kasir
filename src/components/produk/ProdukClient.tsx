"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData, invalidateCache, setCachedData } from "@/lib/client-cache";
import { formatRoleLabel, isStoreAdmin } from "@/lib/rbac-shared";
import {
  groupProductRequestsIntoBatches,
  parseProductRequestEnvelope,
  type GroupedProductRequestBatch,
} from "@/lib/product-request-batch";
import {
  Plus,
  MagnifyingGlass,
  Package,
  CookingPot,
  ClockCounterClockwise,
  Eye,
  Trash,
  Warning,
  ClipboardText,
  FileMagnifyingGlass,
  Receipt,
  Info,
} from "@phosphor-icons/react";
import {
  computeProductMaxPortions,
  getUnitDisplayLabel,
  type CategoryOption,
  type InitialProdukCatalog,
  type ProductItem,
  type ProductRequestItem,
  type ProposalCartItem,
  type UnitOption,
} from "./types";
import { RawMaterialDrawer } from "./RawMaterialDrawer";
import { ProductDrawer } from "./ProductDrawer";
import { ProposalCartDrawer } from "./ProposalCartDrawer";
import { ProductBatchReviewDrawer } from "./ProductBatchReviewDrawer";

export function ProdukClient({
  initialCatalog = null,
}: {
  initialCatalog?: InitialProdukCatalog | null;
}) {
  const { showToast } = useToast();

  const resolvedInitial =
    initialCatalog ?? getCachedData<InitialProdukCatalog>("/api/products") ?? null;

  useEffect(() => {
    if (initialCatalog) {
      setCachedData("/api/products", initialCatalog);
    }
  }, [initialCatalog]);

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

  // Filters & Pagination (10 per langkah)
  const PAGE_STEP = 10;
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [reqStatusFilter, setReqStatusFilter] = useState("ALL");
  const [catalogLimit, setCatalogLimit] = useState(PAGE_STEP);
  const [materialsLimit, setMaterialsLimit] = useState(PAGE_STEP);
  const [requestsLimit, setRequestsLimit] = useState(PAGE_STEP);

  // Drawers
  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProductItem | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  // Review Batch Request Drawer
  const [reviewingBatch, setReviewingBatch] =
    useState<GroupedProductRequestBatch<ProductRequestItem> | null>(null);

  // Batch delete confirmation dialog state
  const [deletingBatch, setDeletingBatch] =
    useState<GroupedProductRequestBatch<ProductRequestItem> | null>(null);
  const [deletingBatchScope, setDeletingBatchScope] = useState<"FOR_ME" | "FOR_ALL" | null>(null);
  const deleteBatchDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogPressedOutsideRef = useRef(false);

  // Daftar Pengajuan (khusus Gudang & Kasir+Gudang sebelum dikirim ke Manajer/Pemilik)
  const [proposalCart, setProposalCart] = useState<ProposalCartItem[]>([]);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const activeCartRoomRef = useRef<string | null>(null);
  const cartHydratedRef = useRef(false);

  // Delete confirmation modal
  const [deletingTarget, setDeletingTarget] = useState<ProductItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);

  const skippedInitialFetch = useRef(Boolean(initialCatalog));
  const tabButtonRefs = useRef<Partial<Record<"catalog" | "materials" | "requests", HTMLButtonElement | null>>>({});

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    setCatalogLimit(PAGE_STEP);
  }, [search, methodFilter]);

  useEffect(() => {
    setMaterialsLimit(PAGE_STEP);
  }, [search]);

  useEffect(() => {
    setRequestsLimit(PAGE_STEP);
  }, [search, reqStatusFilter]);

  useEffect(() => {
    const dialog = deleteBatchDialogRef.current;
    if (!dialog) return;
    if (deletingBatch) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [deletingBatch]);

  useEffect(() => {
    if (!portalMounted || !activeCartRoomRef.current || cartHydratedRef.current) return;
    cartHydratedRef.current = true;
    try {
      const saved = window.sessionStorage.getItem(
        `trasir_proposal_cart:${activeCartRoomRef.current}`
      );
      if (saved) {
        const parsed = JSON.parse(saved) as ProposalCartItem[];
        if (Array.isArray(parsed)) setProposalCart(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [portalMounted]);

  useEffect(() => {
    if (!portalMounted || !activeCartRoomRef.current || !cartHydratedRef.current) return;
    try {
      window.sessionStorage.setItem(
        `trasir_proposal_cart:${activeCartRoomRef.current}`,
        JSON.stringify(proposalCart)
      );
    } catch {
      // ignore storage errors
    }
  }, [proposalCart, portalMounted]);

  const queuedMaterialsAsProducts: ProductItem[] = useMemo(
    () =>
      proposalCart
        .filter((item) => item.isRawMaterial && item.requestKind !== "UPDATE")
        .map((item) => ({
          id: item.clientTempId,
          sku: item.sku,
          barcode: item.barcode,
          name: item.name,
          categoryId: item.categoryId,
          category: categories.find((c) => c.id === item.categoryId) || {
            id: item.categoryId,
            name: item.categoryName || "Bahan Baku",
            areaType: "TERTUTUP",
          },
          stockMethod: item.stockMethod,
          isRawMaterial: true,
          purchaseUnit: item.purchaseUnit,
          sellUnit: item.sellUnit,
          conversionRatio: item.conversionRatio,
          costPrice: item.costPrice,
          sellPrice: item.sellPrice,
          currentStock: item.currentStock,
          minStockAlert: item.minStockAlert,
          variants: [],
        })),
    [proposalCart, categories]
  );

  const handleAddToCart = useCallback(
    (item: ProposalCartItem) => {
      if (item.requestKind === "UPDATE" && item.targetProductId) {
        const alreadyQueued = proposalCart.some(
          (existing) => existing.targetProductId === item.targetProductId
        );
        if (alreadyQueued) {
          setProposalCart((prev) =>
            prev.map((existing) =>
              existing.targetProductId === item.targetProductId ? item : existing
            )
          );
          showToast(
            `Usulan perubahan "${item.name}" diperbarui di Daftar Pengajuan.`,
            "success"
          );
          return;
        }
        setProposalCart((prev) => [...prev, item]);
        showToast(
          `Perubahan "${item.name}" masuk ke Daftar Pengajuan (${proposalCart.length + 1} item).`,
          "success"
        );
        return;
      }

      const normalizedNewName = item.name.trim().toLowerCase();
      const normalizedNewSku = item.sku.trim().toUpperCase();
      const dupInCart = proposalCart.find(
        (existing) =>
          existing.name.trim().toLowerCase() === normalizedNewName ||
          existing.sku.trim().toUpperCase() === normalizedNewSku
      );
      if (dupInCart) {
        showToast(
          `"${item.name}" sudah ada di Daftar Pengajuan. Hapus item lama jika ingin menggantinya.`,
          "info"
        );
        return;
      }
      setProposalCart((prev) => [...prev, item]);
      showToast(
        `"${item.name}" ditambahkan ke Daftar Pengajuan (${proposalCart.length + 1} item).`,
        "success"
      );
    },
    [proposalCart, showToast]
  );

  useEffect(() => {
    if (!deletingTarget || deletingBusy) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeletingTarget(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletingTarget, deletingBusy]);

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
      if (data.mode === "REQUEST") {
        showToast(
          data.message || `Penambahan stok "${mat.name}" diajukan ke Pemilik atau Manajer.`,
          "info"
        );
        invalidateCache("/api/dashboard");
        await loadRequests();
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

  const handleConfirmDelete = async () => {
    if (!deletingTarget) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(deletingTarget.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menghapus produk.", "error");
        return;
      }

      const label = deletingTarget.isRawMaterial
        ? "Bahan baku"
        : deletingTarget.stockMethod === "RESEP"
        ? "Menu & resep"
        : "Produk";
      showToast(
        data.mode === "ARCHIVED"
          ? `${label} "${deletingTarget.name}" dihapus dari daftar aktif (riwayat transaksi lama tetap aman).`
          : `${label} "${deletingTarget.name}" berhasil dihapus permanen.`,
        "success"
      );
      setDeletingTarget(null);
      invalidateCache("/api/dashboard");
      invalidateCache("/api/products");
      await loadCatalog();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleConfirmDeleteBatch = async (scope: "FOR_ME" | "FOR_ALL") => {
    if (!deletingBatch || deletingBatchScope) return;
    setDeletingBatchScope(scope);
    try {
      const res = await fetch("/api/product-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: deletingBatch.batchId,
          requestIds: deletingBatch.items.map((item) => item.id),
          scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menghapus pengajuan.", "error");
        return;
      }

      const closedBatchId = deletingBatch.batchId;
      setDeletingBatch(null);
      if (reviewingBatch?.batchId === closedBatchId) {
        setReviewingBatch(null);
      }
      showToast(
        data.message ||
          (scope === "FOR_ALL"
            ? "Pengajuan berhasil dihapus untuk semua pengguna."
            : "Pengajuan dihapus dari daftar tampilan Anda."),
        "success"
      );
      invalidateCache("/api/products");
      await Promise.all([loadRequests(), loadCatalog()]);
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setDeletingBatchScope(null);
    }
  };

  return (
    <AppShell>
      {(session) => {
        activeCartRoomRef.current = session.user.roomId ?? null;
        const isAdmin = isStoreAdmin(session.user.role);
        const canCreate = Boolean(session.permissions.produk?.canCreate);
        const canEdit = Boolean(session.permissions.produk?.canEdit);
        const canAccessRequests = isAdmin || canCreate;
        const effectiveTab = pageTab === "requests" && !canAccessRequests ? "catalog" : pageTab;
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
        const groupedBatches = groupProductRequestsIntoBatches(filteredRequests);
        const visibleSellable = filteredSellable.slice(0, catalogLimit);
        const visibleMaterials = filteredMaterials.slice(0, materialsLimit);
        const visibleBatches = groupedBatches.slice(0, requestsLimit);

        const renderPaginationFooter = (
          shownCount: number,
          totalCount: number,
          nounLabel: string,
          onShowMore: () => void,
          onCollapse: () => void
        ) => {
          if (totalCount === 0) return null;
          const remaining = totalCount - shownCount;
          if (remaining <= 0 && totalCount <= PAGE_STEP) return null;

          return (
            <div className="px-4 sm:px-5 py-3.5 bg-[#F8FAFC] border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <p className="text-xs font-medium text-[#525866]">
                Menampilkan <strong className="text-[#202531]">{shownCount}</strong> dari{" "}
                <strong className="text-[#202531]">{totalCount}</strong> {nounLabel}
              </p>
              <div className="flex items-center gap-2">
                {remaining > 0 ? (
                  <button
                    type="button"
                    onClick={onShowMore}
                    className="min-h-[44px] px-4 rounded-xl border border-[#202531]/20 bg-white hover:bg-[#EBEBEB] text-xs font-extrabold text-[#202531] cursor-pointer transition-colors"
                  >
                    Tampilkan {Math.min(PAGE_STEP, remaining)} Lagi
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onCollapse}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-[#525866] hover:text-[#202531] hover:bg-[#EBEBEB]/60 cursor-pointer transition-colors"
                  >
                    Ringkas ke {PAGE_STEP}
                  </button>
                )}
              </div>
            </div>
          );
        };

        const visibleTabs: Array<{
          key: "catalog" | "materials" | "requests";
          id: string;
          label: string;
          badgeCount?: number;
        }> = [
          {
            key: "catalog",
            id: "produk-tab-catalog",
            label: `Menu & Produk Jual (${sellableProducts.length})`,
          },
          {
            key: "materials",
            id: "produk-tab-materials",
            label: `Bahan Baku (${rawMaterialProducts.length})`,
          },
          ...(canAccessRequests
            ? [
                {
                  key: "requests" as const,
                  id: "produk-tab-requests",
                  label: isAdmin ? "Persetujuan" : "Pengajuan Saya",
                  badgeCount: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
                },
              ]
            : []),
        ];

        const activateTab = (tabKey: "catalog" | "materials" | "requests") => {
          setPageTab(tabKey);
          if (tabKey === "requests") {
            loadRequests();
          }
          const targetEl = tabButtonRefs.current[tabKey];
          targetEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
        };

        const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
          const currentIdx = visibleTabs.findIndex((t) => t.key === effectiveTab);
          if (currentIdx === -1) return;
          let nextIdx: number | null = null;
          if (e.key === "ArrowRight") {
            nextIdx = (currentIdx + 1) % visibleTabs.length;
          } else if (e.key === "ArrowLeft") {
            nextIdx = (currentIdx - 1 + visibleTabs.length) % visibleTabs.length;
          } else if (e.key === "Home") {
            nextIdx = 0;
          } else if (e.key === "End") {
            nextIdx = visibleTabs.length - 1;
          }
          if (nextIdx === null) return;
          e.preventDefault();
          const nextTab = visibleTabs[nextIdx];
          activateTab(nextTab.key);
          tabButtonRefs.current[nextTab.key]?.focus();
        };

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

                {canCreate || canEdit ? (
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {canCreate && (
                      <>
                        <button
                          type="button"
                          onClick={openAddMaterial}
                          className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 transition-opacity duration-150 cursor-pointer"
                        >
                          <CookingPot size={17} weight="bold" aria-hidden="true" />
                          <span>Tambah Bahan Baku</span>
                        </button>
                        <button
                          type="button"
                          onClick={openAddProduct}
                          className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2a3140] transition-colors duration-150 cursor-pointer"
                        >
                          <Plus size={17} weight="bold" aria-hidden="true" />
                          <span>{isAdmin ? "Tambah Menu / Produk" : "Ajukan Menu / Produk"}</span>
                        </button>
                      </>
                    )}
                    {!isAdmin && (
                      <button
                        type="button"
                        onClick={() => setCartDrawerOpen(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#202531]/25 bg-white text-[#202531] text-xs font-extrabold hover:bg-[#EBEBEB] transition-colors cursor-pointer"
                      >
                        <ClipboardText size={17} weight="bold" aria-hidden="true" />
                        <span>Daftar Pengajuan ({proposalCart.length})</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="px-3.5 py-2.5 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs text-[#202531] flex items-center gap-2">
                    <Info size={16} weight="bold" className="shrink-0" aria-hidden="true" />
                    <span>
                      Mode Lihat Saja: Penambahan produk dikelola oleh bagian Gudang, Manajer, atau Pemilik.
                    </span>
                  </div>
                )}
              </div>

              {/* Filter Pencarian Ringkas */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-[#202531]/10">
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
                      effectiveTab === "materials"
                        ? "Cari nama bahan baku (misal: Susu, Gula, Teh)..."
                        : effectiveTab === "requests"
                        ? "Cari nama produk atau pengaju..."
                        : "Cari nama menu atau produk..."
                    }
                    aria-label="Cari di daftar"
                    className="w-full pl-9 pr-3.5 h-10 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>

                {effectiveTab === "catalog" && (
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
                            ? "bg-[#202531] text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}

                {effectiveTab === "requests" && (
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
                            ? "bg-[#202531] text-white"
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

            {/* Segmented Tab Bar Sejajar tepat di atas List Barang + Konten Tab */}
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-[#202531]/12 p-1.5 shadow-sm">
                <div
                  role="tablist"
                  aria-label="Kategori daftar produk dan bahan baku"
                  {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
                  className={`produk-tablist ${visibleTabs.length === 3 ? "produk-tablist-cols-3" : "produk-tablist-cols-2"}`}
                  onKeyDown={handleTabKeyDown}
                >
                  {visibleTabs.map((tab) => {
                    const isActive = effectiveTab === tab.key;
                    const IconComp =
                      tab.key === "catalog"
                        ? Package
                        : tab.key === "materials"
                        ? CookingPot
                        : ClockCounterClockwise;

                    return (
                      <button
                        key={tab.key}
                        ref={(el) => {
                          tabButtonRefs.current[tab.key] = el;
                        }}
                        type="button"
                        role="tab"
                        id={tab.id}
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        {...(isActive ? ({ focusgroupstart: "" } as Record<string, string>) : {})}
                        onClick={() => activateTab(tab.key)}
                        className="produk-tab inline-flex items-center justify-center gap-2 px-4 min-h-[46px] rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer"
                      >
                        <IconComp
                          size={16}
                          weight="bold"
                          className={isActive ? "text-[#01DAD7] shrink-0" : "text-[#525866] shrink-0"}
                          aria-hidden="true"
                        />
                        <span>{tab.label}</span>
                        {tab.badgeCount !== undefined && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                              isActive
                                ? "bg-[#01DAD7] text-[#202531]"
                                : "bg-[#D41448] text-white"
                            }`}
                          >
                            {tab.badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

            {/* TAB 1: MENU & PRODUK JUAL */}
            {effectiveTab === "catalog" && (
              <div
                role="tabpanel"
                aria-labelledby="produk-tab-catalog"
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
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
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7] text-xs font-bold cursor-pointer"
                        >
                          <CookingPot size={16} weight="bold" aria-hidden="true" />
                          <span>1. Input Bahan Baku</span>
                        </button>
                        <button
                          type="button"
                          onClick={openAddProduct}
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold cursor-pointer"
                        >
                          <Plus size={16} weight="bold" aria-hidden="true" />
                          <span>2. Tambah Menu Jual</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-200">
                      {visibleSellable.map((prod) => {
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
                                    ? "bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7]"
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
                              <p className="text-sm font-extrabold font-mono text-[#202531] tabular-nums">
                                {formatRupiah(displaySellPrice)}
                              </p>
                              <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                                Modal: {formatRupiah(displayCostPrice)}
                              </p>
                            </div>

                            <div className="text-left sm:text-right min-w-[116px]">
                              <p
                                className={`text-xs font-extrabold font-mono tabular-nums ${
                                  isLow ? "text-[#D41448]" : "text-[#202531]"
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
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditProduct(prod)}
                                  className="px-3.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#202531] cursor-pointer"
                                >
                                  {!isAdmin &&
                                  proposalCart.some((c) => c.targetProductId === prod.id)
                                    ? "Edit Antrean"
                                    : "Ubah"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingTarget(prod)}
                                  aria-label={`Hapus ${prod.name}`}
                                  className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] text-xs font-bold cursor-pointer transition-colors"
                                >
                                  <Trash size={14} weight="bold" aria-hidden="true" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {renderPaginationFooter(
                      visibleSellable.length,
                      filteredSellable.length,
                      "menu & produk",
                      () => setCatalogLimit((prev) => prev + PAGE_STEP),
                      () => setCatalogLimit(PAGE_STEP)
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 2: BAHAN BAKU (RAMAH PEMULA) */}
            {effectiveTab === "materials" && (
              <div
                role="tabpanel"
                aria-labelledby="produk-tab-materials"
                className="space-y-4"
              >
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
                        className="mx-auto text-[#202531]"
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
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold cursor-pointer"
                        >
                          <Plus size={16} weight="bold" aria-hidden="true" />
                          <span>Tambah Bahan Baku Pertama</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-200">
                        {visibleMaterials.map((mat) => {
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
                                    isLow ? "text-[#D41448]" : "text-[#202531]"
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
                                    className="px-3 min-h-[44px] rounded-xl bg-[#01DAD7]/20 text-[#202531] border border-[#01DAD7] hover:bg-[#01DAD7]/30 disabled:opacity-50 text-xs font-bold cursor-pointer"
                                  >
                                    {busy ? "Menambah..." : `+1 Kemasan`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditMaterial(mat)}
                                    className="px-3.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#202531] cursor-pointer"
                                  >
                                    {!isAdmin &&
                                    proposalCart.some((c) => c.targetProductId === mat.id)
                                      ? "Edit Antrean"
                                      : "Ubah"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingTarget(mat)}
                                    aria-label={`Hapus ${mat.name}`}
                                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] text-xs font-bold cursor-pointer transition-colors"
                                  >
                                    <Trash size={14} weight="bold" aria-hidden="true" />
                                    <span>Hapus</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                      {renderPaginationFooter(
                        visibleMaterials.length,
                        filteredMaterials.length,
                        "bahan baku",
                        () => setMaterialsLimit((prev) => prev + PAGE_STEP),
                        () => setMaterialsLimit(PAGE_STEP)
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: PERSETUJUAN PRODUK BARU (TERKELOMPOK PER PAKET) */}
            {effectiveTab === "requests" && canAccessRequests && (
              <div
                role="tabpanel"
                aria-labelledby="produk-tab-requests"
                className="bg-white rounded-2xl border border-[#202531]/15 p-5 shadow-sm space-y-4"
              >
                <div>
                  <h2 className="text-base font-extrabold text-[#202531]">
                    {isAdmin
                      ? "Antrean Persetujuan Paket Barang & Bahan Baru"
                      : "Riwayat Pengajuan Anda"}
                  </h2>
                  <p className="text-xs text-[#525866] mt-0.5">
                    {isAdmin
                      ? "Tinjau paket barang, periksa lampiran nota dengan jelas, dan gunakan cek AI Gemini bila diperlukan."
                      : "Setiap paket pengajuan akan aktif setelah disetujui Pemilik/Manajer. Selama masih menunggu, Anda bisa membuka detail untuk menambah atau mengganti foto nota."}
                  </p>
                </div>

                {loadingRequests ? (
                  <div className="py-10 text-center text-xs text-[#525866]">
                    Memuat daftar pengajuan...
                  </div>
                ) : groupedBatches.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#525866] bg-[#F8FAFC] rounded-xl border border-dashed border-[#202531]/15">
                    Belum ada pengajuan pada kategori ini.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {visibleBatches.map((batch) => {
                      const leadRejectReason = batch.items.find(
                        (i) => i.status === "DITOLAK" && i.rejectionReason
                      )?.rejectionReason;

                      return (
                        <div
                          key={batch.batchId}
                          className="p-4 rounded-2xl border border-[#202531]/15 bg-[#F8FAFC] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-extrabold text-[#202531]">
                                {batch.batchTitle}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-[#202531] text-white text-[11px] font-bold">
                                {batch.items.length} Barang
                              </span>
                              <StatusBadge
                                status={
                                  batch.status === "SEBAGIAN"
                                    ? "MENUNGGU_PERSETUJUAN"
                                    : batch.status
                                }
                              />
                              {batch.receiptImageData && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#202531]/20 text-[11px] font-bold text-[#202531]">
                                  <Receipt size={12} weight="bold" aria-hidden="true" />
                                  <span>
                                    {batch.receiptSource === "FISIK" ? "Nota Fisik" : "Nota Digital"}
                                  </span>
                                </span>
                              )}
                              {isAdmin && batch.aiScanResult && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                    batch.aiScanResult.status === "SESUAI"
                                      ? "bg-[#E6FBFB] text-[#006B69] border border-[#01DAD7]"
                                      : batch.aiScanResult.status === "ADA_SELISIH" ||
                                        batch.aiScanResult.status === "GAGAL_CEK"
                                      ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                                      : "bg-[#FFF0F4] text-[#D41448] border border-[#FF2A63]/35"
                                  }`}
                                >
                                  <FileMagnifyingGlass size={12} weight="bold" aria-hidden="true" />
                                  <span>
                                    {batch.aiScanResult.status === "SESUAI"
                                      ? "AI: Cocok Nota"
                                      : batch.aiScanResult.status === "GAGAL_CEK"
                                      ? "AI Belum Tersambung"
                                      : batch.aiScanResult.status === "ADA_SELISIH"
                                      ? "AI: Ada yang Berbeda"
                                      : "AI: Perlu Cek Visual"}
                                  </span>
                                </span>
                              )}
                              {isAdmin && batch.receiptImageData && !batch.aiScanResult && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                                  Belum Dicek AI
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {batch.items.slice(0, 5).map((item) => {
                                const env = parseProductRequestEnvelope(item.variantsJson);
                                const initStock =
                                  item.stockMethod !== "RESEP" ? env.initialStock ?? 0 : 0;
                                const ratio =
                                  item.conversionRatio > 1 ? item.conversionRatio : 1;
                                const displayQty =
                                  ratio > 1
                                    ? `${formatNumber(Number((initStock / ratio).toFixed(2)))} ${item.purchaseUnit || "kemasan"}`
                                    : `${formatNumber(initStock)} ${getUnitDisplayLabel(item.sellUnit)}`;
                                return (
                                  <span
                                    key={item.id}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-[#202531]/10 text-[11px] font-semibold text-[#202531]"
                                  >
                                    {env.requestKind === "UPDATE" ? "[Ubah] " : ""}
                                    {item.name}
                                    {env.requestKind === "UPDATE"
                                      ? ""
                                      : initStock > 0
                                      ? ` (${displayQty})`
                                      : item.stockMethod === "RESEP"
                                      ? " (Resep)"
                                      : ""}
                                  </span>
                                );
                              })}
                              {batch.items.length > 5 && (
                                <span className="px-2.5 py-1 rounded-lg bg-[#EBEBEB] text-[11px] font-bold text-[#202531]">
                                  +{batch.items.length - 5} lainnya
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-[#525866]">
                              Diajukan <strong>{batch.requestedBy.name}</strong> (
                              {formatRoleLabel(batch.requestedBy.role)}) pada{" "}
                              {formatDateTimeJakarta(batch.createdAt)}
                              {batch.totalEstimatedCost > 0 && (
                                <>
                                  {" "}
                                  • Estimasi modal:{" "}
                                  <strong className="font-mono text-[#202531]">
                                    {formatRupiah(batch.totalEstimatedCost)}
                                  </strong>
                                </>
                              )}
                            </p>

                            {leadRejectReason && (
                              <p className="text-xs font-semibold text-[#D41448] bg-[#FFF0F4] border border-[#FF2A63]/35 rounded-lg px-3 py-1.5">
                                Alasan Penolakan: {leadRejectReason}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setReviewingBatch(batch)}
                              className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-bold cursor-pointer ${
                                isAdmin && batch.pendingCount > 0
                                  ? "bg-[#01DAD7] text-[#202531] hover:opacity-90 font-extrabold"
                                  : "bg-[#202531] text-white hover:bg-[#2a3140]"
                              }`}
                            >
                              <Eye size={16} weight="bold" aria-hidden="true" />
                              <span>
                                {isAdmin && batch.pendingCount > 0
                                  ? "Tinjau Paket & Putuskan"
                                  : batch.pendingCount > 0
                                  ? "Lihat & Ganti Nota"
                                  : "Lihat Detail Paket"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingBatch(batch)}
                              aria-label={`Hapus pengajuan ${batch.batchTitle}`}
                              className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[#D41448] hover:bg-[#FFE0E8] text-xs font-bold cursor-pointer transition-colors"
                            >
                              <Trash size={14} weight="bold" aria-hidden="true" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {groupedBatches.length > PAGE_STEP && (
                      <div className="rounded-xl overflow-hidden border border-slate-200">
                        {renderPaginationFooter(
                          visibleBatches.length,
                          groupedBatches.length,
                          "paket pengajuan",
                          () => setRequestsLimit((prev) => prev + PAGE_STEP),
                          () => setRequestsLimit(PAGE_STEP)
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            </div>

            {/* DRAWER TINJAUAN PAKET + CEK AI OPSIONAL */}
            <ProductBatchReviewDrawer
              batch={reviewingBatch}
              isOpen={Boolean(reviewingBatch)}
              onClose={() => setReviewingBatch(null)}
              isAdmin={isAdmin}
              currentUserId={session.user.id}
              onCompleted={async () => {
                invalidateCache("/api/dashboard");
                const [, updatedReqs] = await Promise.all([
                  loadCatalog(),
                  fetch("/api/product-requests", { cache: "no-store" })
                    .then((r) => (r.ok ? r.json() : null))
                    .catch(() => null),
                ]);
                if (updatedReqs?.requests) {
                  setRequests(updatedReqs.requests);
                  setPendingRequestsCount(updatedReqs.pendingCount ?? 0);
                  if (reviewingBatch) {
                    const refreshedBatches = groupProductRequestsIntoBatches(
                      updatedReqs.requests as ProductRequestItem[]
                    );
                    const nextMatch = refreshedBatches.find(
                      (b) => b.batchId === reviewingBatch.batchId
                    );
                    if (nextMatch) {
                      setReviewingBatch(nextMatch);
                    }
                  }
                } else {
                  await loadRequests();
                }
              }}
            />

            {/* DRAWER KHUSUS BAHAN BAKU */}
            <RawMaterialDrawer
              isOpen={materialDrawerOpen}
              onClose={() => setMaterialDrawerOpen(false)}
              editingProduct={editingMaterial}
              categories={categories}
              units={units}
              isAdmin={isAdmin}
              canSave={editingMaterial ? canEdit : canCreate}
              onRequestDelete={(mat) => setDeletingTarget(mat)}
              onAddToCart={!isAdmin ? handleAddToCart : undefined}
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
              queuedMaterials={!isAdmin ? queuedMaterialsAsProducts : []}
              categories={categories}
              units={units}
              isAdmin={isAdmin}
              canSave={editingProduct ? canEdit : canCreate}
              onRequestDelete={(prod) => setDeletingTarget(prod)}
              onAddToCart={!isAdmin ? handleAddToCart : undefined}
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

            {/* DRAWER DAFTAR PENGAJUAN GUDANG / KASIR+GUDANG */}
            {!isAdmin && (canCreate || canEdit) && (
              <ProposalCartDrawer
                isOpen={cartDrawerOpen}
                onClose={() => setCartDrawerOpen(false)}
                items={proposalCart}
                onRemoveItem={(tempId) =>
                  setProposalCart((prev) => prev.filter((item) => item.clientTempId !== tempId))
                }
                onClearCart={() => setProposalCart([])}
                onOpenAddMaterial={openAddMaterial}
                onOpenAddProduct={openAddProduct}
                onSubmitted={async () => {
                  invalidateCache("/api/dashboard");
                  setPageTab("requests");
                  await loadRequests();
                }}
              />
            )}

            {/* STICKY DAFTAR PENGAJUAN BAR */}
            {portalMounted &&
              !isAdmin &&
              (canCreate || canEdit) &&
              proposalCart.length > 0 &&
              createPortal(
                <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 z-40 !m-0 flex justify-end pointer-events-none">
                  <div className="pointer-events-auto w-full md:w-auto max-w-xl rounded-2xl bg-[#202531] text-white px-4 py-3 shadow-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#01DAD7] text-[#202531] flex items-center justify-center font-extrabold shrink-0">
                        <ClipboardText size={20} weight="bold" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-white">
                          Daftar Pengajuan: {proposalCart.length} Item Siap Kirim
                        </p>
                        <p className="text-[11px] text-[#EBEBEB]/80 truncate max-w-[260px]">
                          {proposalCart.map((c) => c.name).join(", ")}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCartDrawerOpen(true)}
                      className="px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 shrink-0 cursor-pointer"
                    >
                      Lihat Daftar &amp; Kirim
                    </button>
                  </div>
                </div>,
                document.body
              )}

            {/* MODAL KONFIRMASI HAPUS PRODUK / RESEP / BAHAN BAKU */}
            {portalMounted &&
              deletingTarget &&
              (() => {
                const dependentMenus = deletingTarget.isRawMaterial
                  ? products.filter(
                      (p) =>
                        !p.isRawMaterial &&
                        p.variants.some((v) =>
                          v.ingredients.some((ing) => ing.materialId === deletingTarget.id)
                        )
                    )
                  : [];
                const targetKindLabel = deletingTarget.isRawMaterial
                  ? "bahan baku"
                  : deletingTarget.stockMethod === "RESEP"
                  ? "produk dan resep"
                  : "produk";

                return createPortal(
                  <div className="fixed inset-0 z-[70] !m-0 flex items-center justify-center p-4">
                    <div
                      className="fixed inset-0 bg-[#202531]/55 backdrop-blur-[1px]"
                      onClick={() => {
                        if (!deletingBusy) setDeletingTarget(null);
                      }}
                    />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="delete-product-title"
                      className="relative z-10 w-full max-w-md rounded-2xl bg-white border border-[#EBEBEB] shadow-2xl p-6 space-y-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                          <Warning size={22} weight="bold" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h2
                            id="delete-product-title"
                            className="text-base font-bold text-[#202531] leading-snug"
                          >
                            Apakah Anda yakin ingin menghapus {targetKindLabel} &quot;{deletingTarget.name}&quot;?
                          </h2>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {deletingTarget.stockMethod === "RESEP"
                              ? "Menu ini beserta daftar takaran resepnya akan dihapus dari kasir. Stok bahan baku yang tersisa tidak ikut terhapus."
                              : deletingTarget.isRawMaterial
                              ? "Bahan baku ini akan dihapus dari daftar stok dapur/gudang."
                              : "Produk ini akan dihapus dari daftar kasir dan katalog."}
                          </p>
                        </div>
                      </div>

                      {dependentMenus.length > 0 && (
                        <div className="rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] p-3 text-xs text-[#D41448] space-y-1">
                          <p className="font-bold">
                            Bahan baku ini masih dipakai di {dependentMenus.length} resep aktif:
                          </p>
                          <p className="font-semibold">
                            {dependentMenus
                              .slice(0, 4)
                              .map((m) => m.name)
                              .join(", ")}
                            {dependentMenus.length > 4
                              ? `, dan ${dependentMenus.length - 4} lainnya`
                              : ""}
                          </p>
                          <p>
                            Hapus atau ubah resep menu tersebut terlebih dahulu sebelum menghapus bahan baku ini.
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          disabled={deletingBusy}
                          onClick={() => setDeletingTarget(null)}
                          className="px-4 min-h-[44px] rounded-xl border border-[#EBEBEB] bg-white hover:bg-[#F7F8FA] text-sm font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          Batal
                        </button>
                        {dependentMenus.length === 0 && (
                          <button
                            type="button"
                            disabled={deletingBusy}
                            aria-busy={deletingBusy}
                            onClick={handleConfirmDelete}
                            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-sm font-bold disabled:opacity-50 cursor-pointer transition-colors"
                          >
                            <Trash size={16} weight="bold" aria-hidden="true" />
                            <span>{deletingBusy ? "Menghapus..." : "Ya, Hapus"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                );
              })()}

            {/* MODAL KONFIRMASI HAPUS PENGAJUAN PRODUK (NATIVE TOP-LAYER DIALOG) */}
            <dialog
              ref={deleteBatchDialogRef}
              aria-labelledby="delete-batch-title"
              {...({ closedby: deletingBatchScope ? "none" : "any" } as Record<string, string>)}
              onCancel={(e) => {
                if (deletingBatchScope) {
                  e.preventDefault();
                }
              }}
              onClose={() => {
                if (deleteBatchDialogRef.current) {
                  deleteBatchDialogRef.current.returnValue = "";
                }
                if (!deletingBatchScope) {
                  setDeletingBatch(null);
                }
              }}
              onPointerDown={(e) => {
                const dialog = deleteBatchDialogRef.current;
                if (!dialog) return;
                const r = dialog.getBoundingClientRect();
                deleteDialogPressedOutsideRef.current =
                  e.clientX < r.left ||
                  e.clientX > r.right ||
                  e.clientY < r.top ||
                  e.clientY > r.bottom;
              }}
              onPointerUp={(e) => {
                const dialog = deleteBatchDialogRef.current;
                if (!dialog || deletingBatchScope) return;
                const r = dialog.getBoundingClientRect();
                const releasedOutside =
                  e.clientX < r.left ||
                  e.clientX > r.right ||
                  e.clientY < r.top ||
                  e.clientY > r.bottom;
                if (deleteDialogPressedOutsideRef.current && releasedOutside) {
                  setDeletingBatch(null);
                }
                deleteDialogPressedOutsideRef.current = false;
              }}
              className="trasir-modal w-full max-w-md rounded-2xl bg-white border border-[#EBEBEB] shadow-2xl p-6 m-auto"
            >
              {deletingBatch && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                      <Trash size={22} weight="bold" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h1
                        id="delete-batch-title"
                        className="text-base font-bold text-[#202531] leading-snug"
                      >
                        {isAdmin
                          ? `Hapus pengajuan "${deletingBatch.batchTitle}"?`
                          : `Hapus pengajuan "${deletingBatch.batchTitle}" untuk saya?`}
                      </h1>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                        {isAdmin
                          ? 'Pilih "Hapus untuk Saya" untuk menyembunyikan dari tampilan Anda saja, atau "Hapus untuk Semua" untuk menghapus permanen bagi seluruh tim. Produk yang sudah disetujui tetap aman di katalog.'
                          : "Pengajuan ini hanya akan dihapus dari daftar tampilan Anda agar tidak menumpuk. Data untuk Pemilik/Manajer tetap aman."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      autoFocus
                      disabled={Boolean(deletingBatchScope)}
                      onClick={() => setDeletingBatch(null)}
                      className="px-4 min-h-[44px] rounded-xl border border-[#EBEBEB] bg-white hover:bg-[#F7F8FA] text-xs font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      Batal
                    </button>
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(deletingBatchScope)}
                          aria-busy={deletingBatchScope === "FOR_ME"}
                          onClick={() => handleConfirmDeleteBatch("FOR_ME")}
                          className="px-4 min-h-[44px] rounded-xl bg-[#EBEBEB] hover:bg-[#DFDFE2] text-xs font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {deletingBatchScope === "FOR_ME" ? "Memproses..." : "Hapus untuk Saya"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(deletingBatchScope)}
                          aria-busy={deletingBatchScope === "FOR_ALL"}
                          onClick={() => handleConfirmDeleteBatch("FOR_ALL")}
                          className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          <Trash size={15} weight="bold" aria-hidden="true" />
                          <span>
                            {deletingBatchScope === "FOR_ALL"
                              ? "Menghapus..."
                              : "Hapus untuk Semua"}
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(deletingBatchScope)}
                        aria-busy={deletingBatchScope === "FOR_ME"}
                        onClick={() => handleConfirmDeleteBatch("FOR_ME")}
                        className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <Trash size={15} weight="bold" aria-hidden="true" />
                        <span>
                          {deletingBatchScope === "FOR_ME"
                            ? "Menghapus..."
                            : "Ya, Hapus untuk Saya"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </dialog>
          </div>
        );
      }}
    </AppShell>
  );
}
