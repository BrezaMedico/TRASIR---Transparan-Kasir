"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BarcodeScannerModal } from "@/components/ui/BarcodeScannerModal";
import {
  ShiftWorkflowPanel,
  type ClosedShiftReceipt,
} from "@/components/kasir/ShiftWorkflowPanel";
import type { ActiveShiftSummary } from "@/lib/shift-session";
import type { CounterLiveStatus } from "@/lib/counters";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData, invalidateCache, setCachedData } from "@/lib/client-cache";
import {
  MagnifyingGlass,
  Barcode,
  ShoppingCart,
  Plus,
  Minus,
  Trash,
  CheckCircle,
  Package,
  CreditCard,
  QrCode,
  Money,
  Bank,
  CaretUp,
  CaretDown,
  LockKey,
  ClockCounterClockwise,
} from "@phosphor-icons/react";

interface ProductVariantData {
  id: string;
  name: string;
  sellPrice: number;
  costPrice: number;
  ingredients: {
    id: string;
    materialId: string;
    quantity: number;
    unit: string;
    material: {
      id: string;
      name: string;
      currentStock: number;
      sellUnit: string;
    };
  }[];
}

interface CatalogProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  category: { id: string; name: string; areaType: string };
  stockMethod: "TETAP" | "PECAH" | "RESEP";
  isRawMaterial: boolean;
  purchaseUnit: string;
  sellUnit: string;
  conversionRatio: number;
  costPrice: number;
  sellPrice: number;
  currentStock: number;
  variants: ProductVariantData[];
}

interface CartItem {
  key: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  sellUnit: string;
  maxAvailable: number;
}

interface InitialCatalogData {
  products: CatalogProduct[];
  categories: { id: string; name: string }[];
}

export function KasirClient({
  initialCatalog = null,
  initialActiveShift,
  initialCounters = [],
}: {
  initialCatalog?: InitialCatalogData | null;
  initialActiveShift?: ActiveShiftSummary | null;
  initialCounters?: CounterLiveStatus[];
}) {
  const { showToast } = useToast();

  const resolvedInitial = initialCatalog ?? getCachedData<InitialCatalogData>("/api/products") ?? null;

  useEffect(() => {
    if (initialCatalog) {
      setCachedData("/api/products", initialCatalog);
    }
  }, [initialCatalog]);

  const initialSellable = (resolvedInitial?.products || []).filter((p) => !p.isRawMaterial);
  const initialVariantMap: Record<string, string> = {};
  for (const p of initialSellable) {
    if (p.stockMethod === "RESEP" && p.variants.length > 0) {
      initialVariantMap[p.id] = p.variants[0].id;
    }
  }

  const [activeShift, setActiveShift] = useState<ActiveShiftSummary | null>(
    initialActiveShift ?? null
  );
  const [counters, setCounters] = useState<CounterLiveStatus[]>(initialCounters);
  const [shiftPhase, setShiftPhase] = useState<"OPEN" | "POS" | "CLOSE" | "CLOSED_RECEIPT">(
    initialActiveShift ? "POS" : "OPEN"
  );
  const [closedReceipt, setClosedReceipt] = useState<ClosedShiftReceipt | null>(null);
  const [shiftChecked, setShiftChecked] = useState(initialActiveShift !== undefined);

  const [products, setProducts] = useState<CatalogProduct[]>(initialSellable);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    resolvedInitial?.categories || []
  );
  const [loading, setLoading] = useState(!resolvedInitial);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedVariantByProd, setSelectedVariantByProd] =
    useState<Record<string, string>>(initialVariantMap);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"TUNAI" | "QRIS" | "TRANSFER" | "KARTU">("TUNAI");
  const [cashReceivedInput, setCashReceivedInput] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [mobileCartExpanded, setMobileCartExpanded] = useState(false);
  const skippedInitialFetch = useRef(Boolean(initialCatalog));

  const refreshShiftAndCounters = useCallback(async () => {
    try {
      const res = await fetch("/api/shifts", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.counters)) {
        setCounters(json.counters);
      }
      if (json.activeShift) {
        setActiveShift(json.activeShift);
        setShiftPhase((prev) => (prev === "CLOSE" ? "CLOSE" : "POS"));
      } else {
        setActiveShift(null);
      }
    } catch {
      // Abaikan gangguan sementara
    } finally {
      setShiftChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!shiftChecked || counters.length === 0) {
      refreshShiftAndCounters();
    }
  }, [shiftChecked, counters.length, refreshShiftAndCounters]);

  const loadProducts = useCallback(async (force = false) => {
    const cached = !force ? getCachedData<InitialCatalogData>("/api/products") : undefined;
    if (!cached && products.length === 0) {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<InitialCatalogData>("/api/products", {
        force: true,
      });
      if (ok) {
        const sellable = (data.products || []).filter((p: CatalogProduct) => !p.isRawMaterial);
        setProducts(sellable);
        setCategories(data.categories || []);

        const initVariants: Record<string, string> = {};
        for (const p of sellable) {
          if (p.stockMethod === "RESEP" && p.variants.length > 0) {
            initVariants[p.id] = p.variants[0].id;
          }
        }
        setSelectedVariantByProd((prev) => ({ ...initVariants, ...prev }));
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
    if (skippedInitialFetch.current) {
      skippedInitialFetch.current = false;
      return;
    }
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeAvailableForProduct = (product: CatalogProduct, variantId?: string | null): number => {
    if (product.stockMethod !== "RESEP") {
      return Math.max(0, Math.floor(product.currentStock));
    }
    const variant = variantId
      ? product.variants.find((v) => v.id === variantId)
      : product.variants[0];
    if (!variant || variant.ingredients.length === 0) return 0;

    let maxPortions = Infinity;
    for (const ing of variant.ingredients) {
      if (ing.quantity <= 0) continue;
      const possible = Math.floor(ing.material.currentStock / ing.quantity);
      if (possible < maxPortions) maxPortions = possible;
    }
    return Number.isFinite(maxPortions) ? Math.max(0, maxPortions) : 0;
  };

  const addToCart = (product: CatalogProduct, explicitVariantId?: string | null) => {
    let variantId: string | null = null;
    let variantName: string | null = null;
    let unitPrice = product.sellPrice;

    if (product.stockMethod === "RESEP") {
      const chosenId = explicitVariantId || selectedVariantByProd[product.id] || product.variants[0]?.id;
      const variant = product.variants.find((v) => v.id === chosenId);
      if (!variant) {
        showToast(`Produk "${product.name}" belum memiliki varian resep.`, "error");
        return;
      }
      variantId = variant.id;
      variantName = variant.name;
      unitPrice = variant.sellPrice;
    }

    const maxAvailable = computeAvailableForProduct(product, variantId);
    if (maxAvailable <= 0) {
      showToast(`Stok "${product.name}" tidak mencukupi untuk dijual.`, "error");
      return;
    }

    const key = `${product.id}::${variantId || "default"}`;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        if (existing.quantity + 1 > maxAvailable) {
          showToast(`Sisa stok tersedia hanya ${maxAvailable} ${product.sellUnit}.`, "error");
          return prev;
        }
        return prev.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId,
          productName: product.name,
          variantName,
          unitPrice,
          quantity: 1,
          sellUnit: product.sellUnit,
          maxAvailable,
        },
      ];
    });
  };

  const handleBarcodeDetected = (code: string) => {
    const clean = code.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        p.sku.toLowerCase() === clean ||
        (p.barcode && p.barcode.toLowerCase() === clean) ||
        p.name.toLowerCase() === clean
    );
    if (matched) {
      addToCart(matched);
      showToast(`Ditambahkan: ${matched.name}`, "info");
    } else {
      setSearch(code.trim());
      showToast(`Kode "${code}" diterapkan pada pencarian produk.`, "info");
    }
  };

  const updateCartQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;
          const next = item.quantity + delta;
          if (next <= 0) return null;
          if (next > item.maxAvailable) {
            showToast(`Maksimal stok tersedia: ${item.maxAvailable} ${item.sellUnit}`, "error");
            return item;
          }
          return { ...item, quantity: next };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const subtotal = cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const cashReceivedNum =
    paymentMethod === "TUNAI"
      ? Number(cashReceivedInput.replace(/[^0-9]/g, "")) || 0
      : subtotal;
  const changeAmount = paymentMethod === "TUNAI" ? Math.max(0, cashReceivedNum - subtotal) : 0;

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showToast("Keranjang belanja masih kosong.", "error");
      return;
    }

    if (paymentMethod === "TUNAI" && cashReceivedNum < subtotal) {
      showToast("Nominal uang tunai diterima kurang dari total pembayaran.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          cashReceived: paymentMethod === "TUNAI" ? cashReceivedNum : subtotal,
          notes,
          items: cart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan transaksi penjualan.", "error");
        return;
      }

      showToast(
        `Transaksi #${data.sale.receiptNumber} berhasil disimpan (${formatRupiah(data.sale.totalAmount)}).`,
        "success"
      );
      setCart([]);
      setCashReceivedInput("");
      setNotes("");
      setMobileCartExpanded(false);
      invalidateCache("/api/dashboard");
      invalidateCache("/api/sales");
      invalidateCache("/api/reports");
      invalidateCache("/api/inventory");
      await loadProducts(true);
    } catch {
      showToast("Terjadi kesalahan koneksi saat menyimpan transaksi.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell defaultCollapsed={true}>
      {(session) => {
        if (!session.permissions.kasir?.canView) {
          return (
            <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border border-[#202531]/15 p-6 text-center space-y-3">
              <h1 className="text-lg font-extrabold text-[#202531]">
                Akses Kasir Tidak Tersedia
              </h1>
              <p className="text-xs text-[#525866] leading-relaxed">
                Halaman Kasir tidak tersedia untuk peran Gudang. Gunakan akun Kasir atau Kasir + Gudang untuk mencatat penjualan.
              </p>
              <Link
                href="/produk"
                className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90"
              >
                Kembali ke Produk &amp; Bahan Baku
              </Link>
            </div>
          );
        }

        if (shiftPhase === "OPEN" || (!activeShift && shiftPhase !== "CLOSED_RECEIPT")) {
          return (
            <ShiftWorkflowPanel
              mode="OPEN"
              sessionUser={{
                id: session.user.id,
                name: session.user.name,
                username: session.user.username,
                role: session.user.role,
                roomName: session.storeName,
              }}
              counters={counters}
              onRefreshCounters={refreshShiftAndCounters}
              activeShift={null}
              closedReceipt={null}
              onShiftOpened={(shift) => {
                setActiveShift(shift);
                setClosedReceipt(null);
                setShiftPhase("POS");
                refreshShiftAndCounters();
              }}
              onShiftClosed={() => {}}
              onError={(msg) => showToast(msg, "error")}
              onSuccess={(msg) => showToast(msg, "success")}
            />
          );
        }

        if (shiftPhase === "CLOSE" && activeShift) {
          return (
            <ShiftWorkflowPanel
              mode="CLOSE"
              sessionUser={{
                id: session.user.id,
                name: session.user.name,
                username: session.user.username,
                role: session.user.role,
                roomName: session.storeName,
              }}
              activeShift={activeShift}
              closedReceipt={null}
              onShiftOpened={() => {}}
              onShiftClosed={(receipt) => {
                setActiveShift(null);
                setCart([]);
                setCashReceivedInput("");
                setNotes("");
                setClosedReceipt(receipt);
                setShiftPhase("CLOSED_RECEIPT");
                invalidateCache("/api/reports");
                refreshShiftAndCounters();
              }}
              onCancelClose={() => setShiftPhase("POS")}
              onError={(msg) => showToast(msg, "error")}
              onSuccess={(msg) => showToast(msg, "success")}
            />
          );
        }

        if (shiftPhase === "CLOSED_RECEIPT" && closedReceipt) {
          return (
            <ShiftWorkflowPanel
              mode="CLOSED_RECEIPT"
              sessionUser={{
                id: session.user.id,
                name: session.user.name,
                username: session.user.username,
                role: session.user.role,
                roomName: session.storeName,
              }}
              activeShift={null}
              closedReceipt={closedReceipt}
              onShiftOpened={() => {}}
              onShiftClosed={() => {}}
              onStartNewShift={() => {
                setClosedReceipt(null);
                setShiftPhase("OPEN");
              }}
              onError={(msg) => showToast(msg, "error")}
              onSuccess={(msg) => showToast(msg, "success")}
            />
          );
        }

        const q = search.trim().toLowerCase();
        const filteredProducts = products.filter((p) => {
          if (selectedCategory !== "ALL" && p.categoryId !== selectedCategory) return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        });

        return (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* CENTER COLUMN: Search, Barcode Scanner, Category Filter Pills & Product Grid */}
            <div className="flex-1 w-full space-y-4">
              {/* Bar Status Shift Aktif */}
              {activeShift && (
                <div className="bg-white rounded-2xl border border-[#006B69]/25 px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6FBFB] border border-[#006B69]/25 px-2.5 py-1 text-[11px] font-extrabold text-[#006B69] shrink-0">
                      <span className="w-2 h-2 rounded-full bg-[#006B69]" aria-hidden="true" />
                      {activeShift.counterName} · Terkunci
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#202531] truncate">
                        {activeShift.cashierName} · Dibuka {formatDateTimeJakarta(activeShift.openedAt)}
                      </p>
                      <p className="text-[11px] font-semibold text-[#525866] tabular-nums">
                        Modal Awal Loker: {formatRupiah(activeShift.openingCashTotal)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShiftPhase("CLOSE")}
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2c3344] cursor-pointer shrink-0 transition-colors duration-150"
                  >
                    <LockKey size={15} weight="bold" className="text-[#01DAD7]" aria-hidden="true" />
                    <span>Tutup Shift</span>
                  </button>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-extrabold text-slate-900">
                      Kasir (Point of Sale / POS)
                    </h1>
                    <p className="text-xs text-slate-600">
                      Pencatatan penjualan real-time dengan pemotongan stok satuan &amp; bahan baku resep otomatis
                    </p>
                  </div>
                  <Link
                    href="/penjualan"
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB]"
                  >
                    <ClockCounterClockwise size={15} weight="bold" aria-hidden="true" />
                    <span>Riwayat Transaksi</span>
                  </Link>
                </div>

                {/* Search + Barcode Camera Button */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MagnifyingGlass
                      size={18}
                      weight="bold"
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Cari nama produk, kode SKU, atau barcode..."
                      aria-label="Cari produk di kasir"
                      className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900 bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] shrink-0 cursor-pointer"
                  >
                    <Barcode size={20} weight="bold" aria-hidden="true" />
                    <span>Scan Barcode</span>
                  </button>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("ALL")}
                    className={`px-3.5 py-1.5 min-h-[36px] rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === "ALL"
                        ? "bg-[#202531] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Semua Kategori ({products.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3.5 py-1.5 min-h-[36px] rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        selectedCategory === cat.id
                          ? "bg-[#202531] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Cards Grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="h-44 rounded-2xl bg-white border border-slate-200 p-4 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
                  <Package
                    size={36}
                    weight="duotone"
                    className="mx-auto text-slate-400"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      Belum ada produk siap jual di katalog.
                    </p>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      Tambahkan produk baru di Katalog Produk atau ajukan Pembelian & setujui sebagai Pemilik agar stok masuk ke sistem.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    {session.permissions.produk?.canCreate && (
                      <Link
                        href="/produk"
                        className="px-4 py-2.5 min-h-[44px] inline-flex items-center rounded-xl bg-[#202531] text-white text-xs font-bold"
                      >
                        Buka Katalog Produk & Resep
                      </Link>
                    )}
                    {session.permissions.pembelian?.canCreate && (
                      <Link
                        href="/pembelian/input"
                        className="px-4 py-2.5 min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 text-slate-800 text-xs font-bold"
                      >
                        Catat Pembelian Barang
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => {
                    const activeVarId =
                      selectedVariantByProd[product.id] || product.variants[0]?.id || null;
                    const activeVariant =
                      product.stockMethod === "RESEP"
                        ? product.variants.find((v) => v.id === activeVarId)
                        : null;
                    const displayPrice = activeVariant ? activeVariant.sellPrice : product.sellPrice;
                    const availableStock = computeAvailableForProduct(product, activeVarId);

                    return (
                      <div
                        key={product.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between gap-3 hover:border-[#202531] transition-colors"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {product.sku}
                            </span>
                            <StatusBadge status={product.stockMethod} />
                          </div>

                          <div>
                            <h3 className="text-sm font-extrabold text-slate-900">
                              {product.name}
                            </h3>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {product.category.name} ({product.category.areaType})
                            </p>
                          </div>

                          {/* Variant Selector for RESEP products (e.g. Regular vs Large) */}
                          {product.stockMethod === "RESEP" && product.variants.length > 0 && (
                            <div className="pt-1">
                              <p className="text-[11px] font-bold text-slate-600 mb-1">
                                Pilih Varian Ukuran:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {product.variants.map((v) => {
                                  const isSelected = v.id === activeVarId;
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedVariantByProd((prev) => ({
                                          ...prev,
                                          [product.id]: v.id,
                                        }))
                                      }
                                      className={`px-2.5 py-1 min-h-[32px] rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                        isSelected
                                          ? "bg-[#202531] text-white border-[#202531]"
                                          : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                                      }`}
                                    >
                                      {v.name} ({formatRupiah(v.sellPrice)})
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-base font-extrabold font-mono text-[#202531] tabular-nums">
                              {formatRupiah(displayPrice)}
                            </p>
                            <p
                              className={`text-[11px] font-bold ${
                                availableStock > 0 ? "text-[#202531]" : "text-[#D41448]"
                              }`}
                            >
                              {product.stockMethod === "RESEP"
                                ? `Tersedia ~${formatNumber(availableStock)} porsi bahan`
                                : `Sisa Stok: ${formatNumber(availableStock)} ${product.sellUnit}`}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={availableStock <= 0}
                            onClick={() => addToCart(product, activeVarId)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            <Plus size={16} weight="bold" aria-hidden="true" />
                            <span>Tambah</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN (Desktop) / BOTTOM SHEET (Mobile): Active Shopping Cart & Payment Calculator */}
            <aside
              aria-label="Keranjang Belanja Aktif"
              className="w-full lg:w-96 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-20"
            >
              {/* Mobile Bottom Sheet Toggle Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#202531] text-white flex items-center justify-center">
                    <ShoppingCart size={18} weight="fill" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">
                      Keranjang Belanja ({cart.reduce((s, i) => s + i.quantity, 0)})
                    </h2>
                    <p className="text-xs font-mono font-bold text-[#202531]">
                      {formatRupiah(subtotal)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileCartExpanded((v) => !v)}
                  aria-label="Buka atau tutup rincian keranjang"
                  className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 cursor-pointer"
                >
                  {mobileCartExpanded ? (
                    <CaretDown size={18} weight="bold" aria-hidden="true" />
                  ) : (
                    <CaretUp size={18} weight="bold" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className={`${mobileCartExpanded ? "block" : "hidden lg:block"} p-4 space-y-4`}>
                {/* Cart Items List */}
                {cart.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-600 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Pilih produk di katalog kiri atau pindai barcode untuk memulai transaksi.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-slate-900 truncate">
                            {item.productName}{" "}
                            {item.variantName && (
                              <span className="text-[#202531]">({item.variantName})</span>
                            )}
                          </p>
                          <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                            {formatRupiah(item.unitPrice)} x {item.quantity} ={" "}
                            <strong className="text-slate-900">
                              {formatRupiah(item.unitPrice * item.quantity)}
                            </strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.key, -1)}
                            aria-label={`Kurangi jumlah ${item.productName}`}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            {item.quantity === 1 ? (
                              <Trash size={14} weight="bold" className="text-[#D41448]" aria-hidden="true" />
                            ) : (
                              <Minus size={14} weight="bold" aria-hidden="true" />
                            )}
                          </button>
                          <span className="w-7 text-center font-mono text-xs font-extrabold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.key, 1)}
                            aria-label={`Tambah jumlah ${item.productName}`}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus size={14} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment Method Selector */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-700">Metode Pembayaran</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "TUNAI", label: "Tunai", icon: Money },
                        { id: "QRIS", label: "QRIS", icon: QrCode },
                        { id: "TRANSFER", label: "Transfer", icon: Bank },
                        { id: "KARTU", label: "Kartu Debit/Kredit", icon: CreditCard },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon;
                      const active = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            active
                              ? "bg-[#202531] text-white border-[#202531]"
                              : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          <Icon size={16} weight="bold" aria-hidden="true" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cash Received Input & Automatic Change Calculator */}
                {paymentMethod === "TUNAI" && (
                  <div className="space-y-2">
                    <label
                      htmlFor="pos-cash-received"
                      className="block text-xs font-bold text-slate-700"
                    >
                      Nominal Uang Tunai Diterima (Rp)
                    </label>
                    <input
                      id="pos-cash-received"
                      type="number"
                      min={0}
                      value={cashReceivedInput}
                      onChange={(e) => setCashReceivedInput(e.target.value)}
                      placeholder={String(subtotal)}
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {[subtotal, 20000, 50000, 100000]
                        .filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx)
                        .map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCashReceivedInput(String(preset))}
                            className="px-2.5 py-1 min-h-[32px] rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-mono font-bold text-slate-700 cursor-pointer"
                          >
                            {preset === subtotal ? "Uang Pas" : formatRupiah(preset)}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Totals & Change Summary */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal Belanja</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatRupiah(subtotal)}
                    </span>
                  </div>
                  {paymentMethod === "TUNAI" && (
                    <>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Tunai Diterima</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatRupiah(cashReceivedNum)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 text-sm font-extrabold text-[#202531]">
                        <span>Kembalian Otomatis</span>
                        <span className="font-mono">{formatRupiah(changeAmount)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Complete Transaction CTA */}
                <button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={handleCompleteSale}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  <CheckCircle size={20} weight="fill" aria-hidden="true" />
                  <span>
                    {submitting
                      ? "Memproses Transaksi..."
                      : `Bayar Sekarang (${formatRupiah(subtotal)})`}
                  </span>
                </button>
              </div>
            </aside>

            <BarcodeScannerModal
              isOpen={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onDetected={handleBarcodeDetected}
              products={products}
            />
          </div>
        );
      }}
    </AppShell>
  );
}

