"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/layout/AppShell";
import { formatNumber } from "@/lib/format";
import {
  fetchJsonCached,
  getCachedData,
  invalidateCache,
  setCachedData,
} from "@/lib/client-cache";
import {
  groupProductRequestsIntoBatches,
  type GroupedProductRequestBatch,
} from "@/lib/product-request-batch";
import {
  getUnitDisplayLabel,
  type CategoryOption,
  type InitialProdukCatalog,
  type ProductItem,
  type ProductRequestItem,
  type ProposalCartItem,
  type UnitOption,
} from "./types";

export const PRODUK_PAGE_STEP = 10;

export function useProdukCatalog(initialCatalog: InitialProdukCatalog | null) {
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

  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [reviewingBatch, setReviewingBatch] =
    useState<GroupedProductRequestBatch<ProductRequestItem> | null>(null);
  const [deletingBatch, setDeletingBatch] =
    useState<GroupedProductRequestBatch<ProductRequestItem> | null>(null);
  const [deletingBatchScope, setDeletingBatchScope] = useState<"FOR_ME" | "FOR_ALL" | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<ProductItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [proposalCart, setProposalCart] = useState<ProposalCartItem[]>([]);
  const [portalMounted, setPortalMounted] = useState(false);
  const activeCartRoomRef = useRef<string | null>(null);
  const cartHydratedRef = useRef(false);
  const skippedInitialFetch = useRef(Boolean(initialCatalog));

  useEffect(() => {
    setPortalMounted(true);
  }, []);

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

  const handleBatchReviewCompleted = async () => {
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
        const nextMatch = refreshedBatches.find((b) => b.batchId === reviewingBatch.batchId);
        if (nextMatch) {
          setReviewingBatch(nextMatch);
        }
      }
    } else {
      await loadRequests();
    }
  };

  return {
    pageTab,
    setPageTab,
    products,
    categories,
    units,
    requests,
    pendingRequestsCount,
    loading,
    loadingRequests,
    restockingId,
    reviewingBatch,
    setReviewingBatch,
    deletingBatch,
    setDeletingBatch,
    deletingBatchScope,
    deletingTarget,
    setDeletingTarget,
    deletingBusy,
    proposalCart,
    setProposalCart,
    portalMounted,
    activeCartRoomRef,
    queuedMaterialsAsProducts,
    handleAddToCart,
    loadRequests,
    loadCatalog,
    handleQuickRestockPack,
    handleConfirmDelete,
    handleConfirmDeleteBatch,
    handleBatchReviewCompleted,
  };
}

