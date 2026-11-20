"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  Plus,
  MagnifyingGlass,
  Package,
  Trash,
  FloppyDisk,
  ArrowsLeftRight,
  CookingPot,
} from "@phosphor-icons/react";

interface IngredientRow {
  materialId: string;
  quantity: number;
  unit: string;
}

interface VariantRow {
  name: string;
  sellPrice: number;
  costPrice: number;
  ingredients: IngredientRow[];
}

interface ProductItem {
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
  minStockAlert: number;
  variants: {
    id: string;
    name: string;
    sellPrice: number;
    costPrice: number;
    ingredients: {
      id: string;
      materialId: string;
      quantity: number;
      unit: string;
      material: { id: string; name: string; sellUnit: string; costPrice: number };
    }[];
  }[];
}

export default function ProdukPage() {
  const { showToast } = useToast();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; areaType: string }[]>([]);
  const [units, setUnits] = useState<{ id: string; name: string; label: string; group: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");

  // Side Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"config" | "summary">("config");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockMethod, setStockMethod] = useState<"TETAP" | "PECAH" | "RESEP">("TETAP");
  const [isRawMaterial, setIsRawMaterial] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState("pcs");
  const [sellUnit, setSellUnit] = useState("pcs");
  const [conversionRatio, setConversionRatio] = useState<number>(1);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [variants, setVariants] = useState<VariantRow[]>([
    { name: "Regular", sellPrice: 18000, costPrice: 0, ingredients: [] },
    { name: "Large", sellPrice: 24000, costPrice: 0, ingredients: [] },
  ]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setUnits(data.units || []);
        if (!categoryId && data.categories?.[0]) {
          setCategoryId(data.categories[0].id);
        }
      }
    } catch {
      showToast("Gagal memuat katalog produk.", "error");
    } finally {
      setLoading(false);
    }
  }, [categoryId, showToast]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const openCreateDrawer = () => {
    setEditingId(null);
    setDrawerTab("config");
    setSku(`PRD-${Math.floor(1000 + Math.random() * 9000)}`);
    setBarcode("");
    setName("");
    setCategoryId(categories[0]?.id || "");
    setStockMethod("TETAP");
    setIsRawMaterial(false);
    setPurchaseUnit("pcs");
    setSellUnit("pcs");
    setConversionRatio(1);
    setCostPrice(0);
    setSellPrice(0);
    setMinStockAlert(5);
    setVariants([
      { name: "Regular", sellPrice: 18000, costPrice: 0, ingredients: [] },
      { name: "Large", sellPrice: 24000, costPrice: 0, ingredients: [] },
    ]);
    setDrawerOpen(true);
  };

  const openEditDrawer = (prod: ProductItem) => {
    setEditingId(prod.id);
    setDrawerTab("config");
    setSku(prod.sku);
    setBarcode(prod.barcode || "");
    setName(prod.name);
    setCategoryId(prod.categoryId);
    setStockMethod(prod.stockMethod);
    setIsRawMaterial(prod.isRawMaterial);
    setPurchaseUnit(prod.purchaseUnit);
    setSellUnit(prod.sellUnit);
    setConversionRatio(prod.conversionRatio);
    setCostPrice(prod.costPrice);
    setSellPrice(prod.sellPrice);
    setMinStockAlert(prod.minStockAlert);
    setVariants(
      prod.variants.length > 0
        ? prod.variants.map((v) => ({
            name: v.name,
            sellPrice: v.sellPrice,
            costPrice: v.costPrice,
            ingredients: v.ingredients.map((ing) => ({
              materialId: ing.materialId,
              quantity: ing.quantity,
              unit: ing.unit,
            })),
          }))
        : [{ name: "Regular", sellPrice: prod.sellPrice, costPrice: prod.costPrice, ingredients: [] }]
    );
    setDrawerOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim() || !categoryId) {
      showToast("Nama produk, SKU, dan kategori wajib diisi.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        id: editingId || undefined,
        sku,
        barcode: barcode || null,
        name,
        categoryId,
        stockMethod,
        isRawMaterial,
        purchaseUnit,
        sellUnit: stockMethod === "TETAP" ? purchaseUnit : sellUnit,
        conversionRatio: stockMethod === "TETAP" ? 1 : Number(conversionRatio) || 1,
        costPrice: Math.round(Number(costPrice) || 0),
        sellPrice: Math.round(Number(sellPrice) || 0),
        minStockAlert: Number(minStockAlert) || 5,
        variants: stockMethod === "RESEP" ? variants : undefined,
      };

      const res = await fetch("/api/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan produk.", "error");
        return;
      }

      showToast(
        editingId
          ? `Konfigurasi produk "${data.product.name}" berhasil diperbarui.`
          : `Produk "${data.product.name}" berhasil ditambahkan ke katalog.`,
        "success"
      );
      setDrawerOpen(false);
      await loadCatalog();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      {(session) => {
        const canCreate = session.permissions.produk?.canCreate;
        const canEdit = session.permissions.produk?.canEdit;
        const q = search.trim().toLowerCase();

        const filtered = products.filter((p) => {
          if (categoryFilter !== "ALL" && p.categoryId !== categoryFilter) return false;
          if (methodFilter !== "ALL" && p.stockMethod !== methodFilter) return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        });

        const selectedProductObj = editingId ? products.find((p) => p.id === editingId) : null;

        return (
          <div className="space-y-6">
            {/* Top Bar: Title, Filters & + Tambah Produk */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Katalog Produk, Konversi Satuan & Resep
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Pengelolaan master produk, mode Area Terbuka vs Area Tertutup, serta 3 metode stok (Satuan Tetap 1:1, Pecah Satuan, Resep & Varian)
                  </p>
                </div>

                {canCreate && (
                  <button
                    type="button"
                    onClick={openCreateDrawer}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer shrink-0"
                  >
                    <Plus size={18} weight="bold" aria-hidden="true" />
                    <span>+ Tambah Produk</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div className="relative">
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
                    placeholder="Cari nama produk, SKU, barcode..."
                    aria-label="Cari produk"
                    className="w-full pl-9 pr-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="cat-filter" className="sr-only">
                    Filter Kategori & Area
                  </label>
                  <select
                    id="cat-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="ALL">Semua Kategori & Area Pengawasan</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Area {c.areaType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="method-filter" className="sr-only">
                    Filter Metode Stok
                  </label>
                  <select
                    id="method-filter"
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="w-full px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                  >
                    <option value="ALL">Semua Metode Pengelolaan Stok</option>
                    <option value="TETAP">Satuan Tetap (1:1)</option>
                    <option value="PECAH">Pecah Satuan (Rasio Konversi)</option>
                    <option value="RESEP">Resep & Varian Bahan Baku</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-10 text-center text-xs text-slate-600">
                  Memuat katalog produk...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Package
                    size={36}
                    weight="duotone"
                    className="mx-auto text-slate-400"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      Belum ada produk yang terdaftar di katalog.
                    </p>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      Klik tombol + Tambah Produk untuk membuat master produk beserta aturan konversi satuan atau komposisi resep.
                    </p>
                  </div>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={openCreateDrawer}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                    >
                      <Plus size={16} weight="bold" aria-hidden="true" />
                      <span>Tambah Produk Pertama</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                        <th className="py-3.5 px-4">Nama Produk & SKU</th>
                        <th className="py-3.5 px-4">Kategori & Lencana Area</th>
                        <th className="py-3.5 px-4">Metode Stok & Konversi</th>
                        <th className="py-3.5 px-4 text-right">Harga Jual</th>
                        <th className="py-3.5 px-4 text-right">HPP / Modal</th>
                        <th className="py-3.5 px-4 text-right">Stok Tersedia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filtered.map((prod) => (
                        <tr
                          key={prod.id}
                          onClick={() => openEditDrawer(prod)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <p className="font-extrabold text-slate-900">
                              {prod.name}{" "}
                              {prod.isRawMaterial && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700 ml-1">
                                  Bahan Baku
                                </span>
                              )}
                            </p>
                            <p className="font-mono text-[11px] text-slate-600 mt-0.5">
                              SKU: {prod.sku} {prod.barcode ? `• Barcode: ${prod.barcode}` : ""}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-semibold text-slate-800 mb-1">
                              {prod.category.name}
                            </p>
                            <StatusBadge status={prod.category.areaType} />
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={prod.stockMethod} />
                            <p className="text-[11px] text-slate-600 mt-1">
                              {prod.stockMethod === "TETAP" &&
                                `1 ${prod.purchaseUnit} = 1 ${prod.sellUnit}`}
                              {prod.stockMethod === "PECAH" &&
                                `1 ${prod.purchaseUnit} = ${formatNumber(prod.conversionRatio)} ${prod.sellUnit}`}
                              {prod.stockMethod === "RESEP" &&
                                `${prod.variants.length} Varian Resep (${prod.variants
                                  .map((v) => v.name)
                                  .join(", ")})`}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-extrabold text-[#334E6B] tabular-nums">
                            {prod.stockMethod === "RESEP" && prod.variants.length > 0
                              ? `${formatRupiah(prod.variants[0].sellPrice)}+`
                              : formatRupiah(prod.sellPrice)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                            {formatRupiah(prod.costPrice)} / {prod.sellUnit}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-extrabold tabular-nums">
                            {prod.stockMethod === "RESEP" ? (
                              <span className="text-[#0F766E]">Mengikuti Bahan Baku</span>
                            ) : (
                              <span
                                className={
                                  prod.currentStock <= prod.minStockAlert
                                    ? "text-[#9F1239]"
                                    : "text-slate-900"
                                }
                              >
                                {formatNumber(prod.currentStock)} {prod.sellUnit}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RIGHT SIDE DRAWER: Product Configuration & 3 Stock Management Methods */}
            <SlideDrawer
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              title={editingId ? `Konfigurasi Produk: ${name}` : "Tambah Produk Baru ke Katalog"}
              subtitle="Pengaturan kategori area pengawasan, konversi satuan, dan resep varian"
              widthClass="max-w-2xl"
            >
              <div className="space-y-5">
                {editingId && (
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDrawerTab("config")}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        drawerTab === "config"
                          ? "bg-white text-[#334E6B] shadow-sm"
                          : "text-slate-700"
                      }`}
                    >
                      Pengaturan & Metode Stok
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerTab("summary")}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                        drawerTab === "summary"
                          ? "bg-white text-[#334E6B] shadow-sm"
                          : "text-slate-700"
                      }`}
                    >
                      Ringkasan & Posisi Stok
                    </button>
                  </div>
                )}

                {drawerTab === "summary" && selectedProductObj ? (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-slate-500">Posisi Stok Saat Ini</p>
                        <p className="text-lg font-extrabold font-mono text-slate-900 mt-1">
                          {selectedProductObj.stockMethod === "RESEP"
                            ? "Otomatis dari Bahan Baku"
                            : `${formatNumber(selectedProductObj.currentStock)} ${selectedProductObj.sellUnit}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Area Pengawasan Audit</p>
                        <div className="mt-1">
                          <StatusBadge status={selectedProductObj.category.areaType} />
                        </div>
                      </div>
                    </div>
                    <p className="text-slate-600">
                      Catatan Integritas: Stok barang baru resmi bertambah ketika pengajuan Pembelian disetujui Pemilik di Halaman 5.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="prod-name"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nama Produk
                        </label>
                        <input
                          id="prod-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Contoh: Kopi Susu / Susu Segar / Air Mineral"
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="prod-cat"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Kategori & Mode Area Audit
                        </label>
                        <select
                          id="prod-cat"
                          required
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (Area {c.areaType})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="prod-sku"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Kode SKU
                        </label>
                        <input
                          id="prod-sku"
                          type="text"
                          required
                          value={sku}
                          onChange={(e) => setSku(e.target.value)}
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="prod-barcode"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Kode Barcode (Opsional)
                        </label>
                        <input
                          id="prod-barcode"
                          type="text"
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          placeholder="899..."
                          className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRawMaterial}
                        onChange={(e) => setIsRawMaterial(e.target.checked)}
                        className="w-4 h-4 rounded text-[#334E6B]"
                      />
                      <span>
                        Tandai sebagai Bahan Baku Dapur/Gudang (Digunakan untuk komposisi produk Resep)
                      </span>
                    </label>

                    {/* 3 STOCK MANAGEMENT METHODS SELECTOR */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <p className="text-xs font-extrabold text-slate-900">
                        Pilih Metode Pengelolaan Stok (3 Metode TRASIR)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {(
                          [
                            {
                              id: "TETAP",
                              title: "1. Satuan Tetap (1:1)",
                              desc: "Beli dan jual dalam satuan identik (1 unit = 1 unit)",
                            },
                            {
                              id: "PECAH",
                              title: "2. Pecah Satuan",
                              desc: "Rasio konversi manual per barang (misal 1 dus = 24 botol)",
                            },
                            {
                              id: "RESEP",
                              title: "3. Resep & Varian",
                              desc: "Varian ukuran (Regular/Large) dengan komposisi bahan baku",
                            },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setStockMethod(m.id)}
                            className={`p-3 rounded-xl border text-left space-y-1 transition-colors cursor-pointer ${
                              stockMethod === m.id
                                ? "bg-[#334E6B] text-white border-[#334E6B]"
                                : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            <p className="text-xs font-extrabold">{m.title}</p>
                            <p className="text-[11px] opacity-90">{m.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* METHOD 1: SATUAN TETAP (1:1) */}
                    {stockMethod === "TETAP" && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <p className="text-xs font-extrabold text-[#334E6B]">
                          Konfigurasi Satuan Tetap (1:1)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Satuan Barang
                            </label>
                            <select
                              value={purchaseUnit}
                              onChange={(e) => {
                                setPurchaseUnit(e.target.value);
                                setSellUnit(e.target.value);
                              }}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
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
                              HPP / Harga Modal (Rp)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={costPrice}
                              onChange={(e) => setCostPrice(Number(e.target.value))}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Harga Jual Kasir (Rp)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={sellPrice}
                              onChange={(e) => setSellPrice(Number(e.target.value))}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* METHOD 2: PECAH SATUAN */}
                    {stockMethod === "PECAH" && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-[#334E6B]">
                          <ArrowsLeftRight size={16} weight="bold" aria-hidden="true" />
                          <span>Konfigurasi Pecah Satuan (Rasio Konversi per Barang)</span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Contoh: Membeli dalam <strong>dus</strong> dan menjual dalam <strong>botol</strong> (1 dus = 24 botol), atau membeli <strong>liter</strong> dan memakai dalam <strong>ml</strong> (1 liter = 1.000 ml).
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Satuan Pembelian (Besar)
                            </label>
                            <select
                              value={purchaseUnit}
                              onChange={(e) => setPurchaseUnit(e.target.value)}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
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
                              Isi Konversi per 1 {purchaseUnit}
                            </label>
                            <input
                              type="number"
                              min={1}
                              step="any"
                              value={conversionRatio}
                              onChange={(e) => setConversionRatio(Number(e.target.value))}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Satuan Jual / Pakai (Kecil)
                            </label>
                            <select
                              value={sellUnit}
                              onChange={(e) => setSellUnit(e.target.value)}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs bg-white"
                            >
                              {units.map((u) => (
                                <option key={u.id} value={u.name}>
                                  {u.name} ({u.group})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              HPP / Modal per 1 {sellUnit} (Rp)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={costPrice}
                              onChange={(e) => setCostPrice(Number(e.target.value))}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Harga Jual per 1 {sellUnit} (Rp)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={sellPrice}
                              onChange={(e) => setSellPrice(Number(e.target.value))}
                              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* METHOD 3: RESEP & VARIAN */}
                    {stockMethod === "RESEP" && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-extrabold text-[#334E6B]">
                            <CookingPot size={18} weight="duotone" aria-hidden="true" />
                            <span>Konfigurasi Varian & Komposisi Bahan Baku Resep</span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setVariants((prev) => [
                                ...prev,
                                { name: `Varian ${prev.length + 1}`, sellPrice: 20000, costPrice: 0, ingredients: [] },
                              ])
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-[#334E6B] text-white text-[11px] font-bold cursor-pointer"
                          >
                            + Tambah Varian Ukuran
                          </button>
                        </div>

                        <div className="space-y-3">
                          {variants.map((v, vIdx) => (
                            <div
                              key={vIdx}
                              className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={v.name}
                                    onChange={(e) =>
                                      setVariants((prev) =>
                                        prev.map((row, i) =>
                                          i === vIdx ? { ...row, name: e.target.value } : row
                                        )
                                      )
                                    }
                                    placeholder="Nama Varian (misal: Regular / Large)"
                                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-bold"
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    value={v.sellPrice}
                                    onChange={(e) =>
                                      setVariants((prev) =>
                                        prev.map((row, i) =>
                                          i === vIdx
                                            ? { ...row, sellPrice: Number(e.target.value) }
                                            : row
                                        )
                                      )
                                    }
                                    placeholder="Harga Jual (Rp)"
                                    className="w-36 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-mono"
                                  />
                                </div>

                                {variants.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVariants((prev) => prev.filter((_, i) => i !== vIdx))
                                    }
                                    className="text-xs font-bold text-[#9F1239] cursor-pointer"
                                  >
                                    Hapus Varian
                                  </button>
                                )}
                              </div>

                              {/* Ingredients Table for Variant */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-600">
                                    Komposisi Bahan Baku (Otomatis terpotong saat terjual di Kasir):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const defaultMat = products.find((p) => p.id !== editingId);
                                      if (!defaultMat) {
                                        showToast(
                                          "Tambahkan produk bahan baku terlebih dahulu di katalog.",
                                          "error"
                                        );
                                        return;
                                      }
                                      setVariants((prev) =>
                                        prev.map((row, i) =>
                                          i === vIdx
                                            ? {
                                                ...row,
                                                ingredients: [
                                                  ...row.ingredients,
                                                  {
                                                    materialId: defaultMat.id,
                                                    quantity: 10,
                                                    unit: defaultMat.sellUnit,
                                                  },
                                                ],
                                              }
                                            : row
                                        )
                                      );
                                    }}
                                    className="text-[11px] font-bold text-[#334E6B] hover:underline cursor-pointer"
                                  >
                                    + Tambah Bahan Baku
                                  </button>
                                </div>

                                {v.ingredients.length === 0 ? (
                                  <p className="text-[11px] text-slate-500 italic">
                                    Belum ada bahan baku pada varian ini.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {v.ingredients.map((ing, ingIdx) => (
                                      <div
                                        key={ingIdx}
                                        className="flex items-center gap-2 text-xs"
                                      >
                                        <select
                                          value={ing.materialId}
                                          onChange={(e) => {
                                            const mat = products.find(
                                              (p) => p.id === e.target.value
                                            );
                                            setVariants((prev) =>
                                              prev.map((row, i) =>
                                                i === vIdx
                                                  ? {
                                                      ...row,
                                                      ingredients: row.ingredients.map((ig, j) =>
                                                        j === ingIdx
                                                          ? {
                                                              ...ig,
                                                              materialId: e.target.value,
                                                              unit: mat?.sellUnit || ig.unit,
                                                            }
                                                          : ig
                                                      ),
                                                    }
                                                  : row
                                              )
                                            );
                                          }}
                                          className="flex-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white"
                                        >
                                          {products
                                            .filter((p) => p.id !== editingId)
                                            .map((p) => (
                                              <option key={p.id} value={p.id}>
                                                {p.name} (Satuan pakai: {p.sellUnit})
                                              </option>
                                            ))}
                                        </select>
                                        <input
                                          type="number"
                                          min={0.01}
                                          step="any"
                                          value={ing.quantity}
                                          onChange={(e) =>
                                            setVariants((prev) =>
                                              prev.map((row, i) =>
                                                i === vIdx
                                                  ? {
                                                      ...row,
                                                      ingredients: row.ingredients.map((ig, j) =>
                                                        j === ingIdx
                                                          ? {
                                                              ...ig,
                                                              quantity: Number(e.target.value),
                                                            }
                                                          : ig
                                                      ),
                                                    }
                                                  : row
                                              )
                                            )
                                          }
                                          className="w-24 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-slate-300 font-mono"
                                        />
                                        <span className="text-slate-600 font-mono w-12">
                                          {ing.unit}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setVariants((prev) =>
                                              prev.map((row, i) =>
                                                i === vIdx
                                                  ? {
                                                      ...row,
                                                      ingredients: row.ingredients.filter(
                                                        (_, j) => j !== ingIdx
                                                      ),
                                                    }
                                                  : row
                                              )
                                            )
                                          }
                                          aria-label="Hapus bahan baku"
                                          className="p-1.5 text-[#9F1239] cursor-pointer"
                                        >
                                          <Trash size={14} weight="bold" aria-hidden="true" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(canCreate || canEdit) && (
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
                      >
                        <FloppyDisk size={18} weight="bold" aria-hidden="true" />
                        <span>
                          {submitting
                            ? "Menyimpan..."
                            : editingId
                            ? "Simpan Perubahan Konfigurasi Produk"
                            : "Simpan Produk ke Katalog"}
                        </span>
                      </button>
                    )}
                  </form>
                )}
              </div>
            </SlideDrawer>
          </div>
        );
      }}
    </AppShell>
  );
}
