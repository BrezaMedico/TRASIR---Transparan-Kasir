"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { useToast } from "@/components/layout/AppShell";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  FloppyDisk,
  CookingPot,
  Package,
  Trash,
  CheckCircle,
  Info,
  Warning,
  CaretDown,
  CaretUp,
  Plus,
} from "@phosphor-icons/react";
import {
  getDefaultRecipeQty,
  getQuickDosagesForUnit,
  getUnitDisplayLabel,
  type CategoryOption,
  type ProductItem,
  type UnitOption,
  type VariantRow,
} from "./types";

interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: ProductItem | null;
  products: ProductItem[];
  categories: CategoryOption[];
  units: UnitOption[];
  isAdmin: boolean;
  canSave: boolean;
  onSaved: (mode: "DIRECT" | "REQUEST", productName: string) => Promise<void> | void;
  onSwitchToAddMaterial: () => void;
}

const COMMON_SELL_UNITS = [
  { value: "pcs", label: "pcs" },
  { value: "botol", label: "botol" },
  { value: "bungkus", label: "bungkus" },
];

export function ProductDrawer({
  isOpen,
  onClose,
  editingProduct,
  products,
  categories,
  units,
  isAdmin,
  canSave,
  onSaved,
  onSwitchToAddMaterial,
}: ProductDrawerProps) {
  const { showToast } = useToast();

  // Mode utama ramah pemula: "READY" (langsung jual) atau "RECIPE" (pecah dari bahan baku)
  const [productKind, setProductKind] = useState<"READY" | "RECIPE">("RECIPE");
  const [useBulkSplit, setUseBulkSplit] = useState(false);

  // Field umum
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState<number>(0);

  // Field produk langsung jual
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellUnit, setSellUnit] = useState("pcs");
  const [useOtherUnit, setUseOtherUnit] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState("dus");
  const [conversionRatio, setConversionRatio] = useState<number>(24);
  const [currentStock, setCurrentStock] = useState<number>(0);

  // Field produk resep (default 1 ukuran, multi-ukuran opsional)
  const [variants, setVariants] = useState<VariantRow[]>([
    { name: "Standar", sellPrice: 0, costPrice: 0, ingredients: [] },
  ]);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);

  // Pengaturan tambahan (terlipat)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);

  const availableMaterials = useMemo(() => {
    const list = products.filter(
      (p) => p.id !== (editingProduct?.id ?? null) && p.stockMethod !== "RESEP"
    );
    return [...list].sort((a, b) => {
      if (a.isRawMaterial !== b.isRawMaterial) return a.isRawMaterial ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [products, editingProduct]);

  const rawMaterialsOnly = useMemo(
    () => availableMaterials.filter((m) => m.isRawMaterial),
    [availableMaterials]
  );

  useEffect(() => {
    if (!isOpen) return;

    const defaultOpenCat =
      categories.find((c) => c.areaType === "TERBUKA") || categories[0];

    if (editingProduct) {
      const isRecipe = editingProduct.stockMethod === "RESEP";
      const isCommonSellUnit = COMMON_SELL_UNITS.some((u) => u.value === editingProduct.sellUnit);

      setProductKind(isRecipe ? "RECIPE" : "READY");
      setUseBulkSplit(editingProduct.stockMethod === "PECAH");
      setName(editingProduct.name);
      setSellPrice(
        isRecipe && editingProduct.variants.length > 0
          ? editingProduct.variants[0].sellPrice
          : editingProduct.sellPrice
      );
      setCostPrice(editingProduct.costPrice);
      setSellUnit(editingProduct.sellUnit);
      setUseOtherUnit(!isCommonSellUnit);
      setPurchaseUnit(editingProduct.purchaseUnit);
      setConversionRatio(editingProduct.conversionRatio || 1);
      setCurrentStock(editingProduct.currentStock ?? 0);
      setVariants(
        editingProduct.variants.length > 0
          ? editingProduct.variants.map((v) => ({
              name: v.name,
              sellPrice: v.sellPrice,
              costPrice: v.costPrice,
              ingredients: v.ingredients.map((ing) => ({
                materialId: ing.materialId,
                quantity: ing.quantity,
                unit: ing.unit,
              })),
            }))
          : [
              {
                name: "Standar",
                sellPrice: editingProduct.sellPrice,
                costPrice: editingProduct.costPrice,
                ingredients: [],
              },
            ]
      );
      setActiveVariantIdx(0);
      setSku(editingProduct.sku);
      setBarcode(editingProduct.barcode || "");
      setCategoryId(editingProduct.categoryId);
      setMinStockAlert(editingProduct.minStockAlert);
      setShowAdvanced(false);
    } else {
      const preferRecipe = rawMaterialsOnly.length > 0;
      setProductKind(preferRecipe ? "RECIPE" : "READY");
      setUseBulkSplit(false);
      setName("");
      setSellPrice(0);
      setCostPrice(0);
      setSellUnit("pcs");
      setUseOtherUnit(false);
      setPurchaseUnit("dus");
      setConversionRatio(24);
      setCurrentStock(0);
      setVariants([{ name: "Standar", sellPrice: 0, costPrice: 0, ingredients: [] }]);
      setActiveVariantIdx(0);
      setSku(`PRD-${Math.floor(1000 + Math.random() * 9000)}`);
      setBarcode("");
      setCategoryId(defaultOpenCat?.id || "");
      setMinStockAlert(5);
      setShowAdvanced(false);
    }
  }, [isOpen, editingProduct, categories, rawMaterialsOnly.length]);

  const safeVariantIdx = Math.min(activeVariantIdx, Math.max(0, variants.length - 1));
  const currentVariant = variants[safeVariantIdx] || {
    name: "Standar",
    sellPrice,
    costPrice: 0,
    ingredients: [],
  };

  const toggleMaterialInVariant = (mat: ProductItem) => {
    setVariants((prev) =>
      prev.map((v, idx) => {
        if (idx !== safeVariantIdx) return v;
        const exists = v.ingredients.some((ig) => ig.materialId === mat.id);
        if (exists) {
          return {
            ...v,
            ingredients: v.ingredients.filter((ig) => ig.materialId !== mat.id),
          };
        }
        return {
          ...v,
          ingredients: [
            ...v.ingredients,
            {
              materialId: mat.id,
              quantity: getDefaultRecipeQty(mat.sellUnit),
              unit: mat.sellUnit,
            },
          ],
        };
      })
    );
  };

  const updateIngredientQty = (ingIdx: number, nextQty: number) => {
    setVariants((prev) =>
      prev.map((v, idx) =>
        idx === safeVariantIdx
          ? {
              ...v,
              ingredients: v.ingredients.map((ig, j) =>
                j === ingIdx ? { ...ig, quantity: Math.max(0, nextQty) } : ig
              ),
            }
          : v
      )
    );
  };

  const removeIngredient = (ingIdx: number) => {
    setVariants((prev) =>
      prev.map((v, idx) =>
        idx === safeVariantIdx
          ? {
              ...v,
              ingredients: v.ingredients.filter((_, j) => j !== ingIdx),
            }
          : v
      )
    );
  };

  const computeVariantStats = (v: VariantRow) => {
    const totalCost = v.ingredients.reduce((acc, ing) => {
      const mat = products.find((p) => p.id === ing.materialId);
      return acc + Math.round((mat?.costPrice || 0) * (Number(ing.quantity) || 0));
    }, 0);

    let maxPortions = Infinity;
    let limitingMaterialName = "";
    for (const ing of v.ingredients) {
      if (ing.quantity <= 0) continue;
      const mat = products.find((p) => p.id === ing.materialId);
      const possible = Math.floor((mat?.currentStock || 0) / ing.quantity);
      if (possible < maxPortions) {
        maxPortions = possible;
        limitingMaterialName = mat?.name || "";
      }
    }
    const resolvedPortions = Number.isFinite(maxPortions) ? Math.max(0, maxPortions) : 0;
    const effectiveSell = variants.length === 1 ? sellPrice : v.sellPrice;
    const profitRp = effectiveSell - totalCost;
    const marginPct =
      effectiveSell > 0 ? Math.round((profitRp / effectiveSell) * 100) : 0;

    return { totalCost, resolvedPortions, limitingMaterialName, profitRp, marginPct, effectiveSell };
  };

  const activeStats = computeVariantStats(currentVariant);
  const readyProfit = sellPrice - costPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Nama menu atau produk wajib diisi.", "error");
      return;
    }

    const resolvedCategoryId =
      categoryId ||
      categories.find((c) => c.areaType === "TERBUKA")?.id ||
      categories[0]?.id ||
      "";
    if (!resolvedCategoryId) {
      showToast("Kategori ruangan belum tersedia. Muat ulang halaman lalu coba lagi.", "error");
      return;
    }

    const stockMethod: "TETAP" | "PECAH" | "RESEP" =
      productKind === "RECIPE" ? "RESEP" : useBulkSplit ? "PECAH" : "TETAP";

    if (stockMethod === "RESEP") {
      const emptyVariant = variants.find((v) => v.ingredients.length === 0);
      if (emptyVariant) {
        showToast(
          variants.length > 1
            ? `Pilih minimal 1 bahan baku untuk ukuran "${emptyVariant.name}".`
            : "Pilih minimal 1 bahan baku dari stok Anda untuk membuat resep menu ini.",
          "error"
        );
        return;
      }
      const zeroQty = variants.some((v) =>
        v.ingredients.some((ig) => !Number.isFinite(ig.quantity) || ig.quantity <= 0)
      );
      if (zeroQty) {
        showToast("Takaran setiap bahan baku pada resep harus lebih dari 0.", "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      const normalizedVariants =
        stockMethod === "RESEP"
          ? variants.map((v, idx) => {
              const effectivePrice =
                variants.length === 1 ? Math.round(Number(sellPrice) || 0) : Math.round(Number(v.sellPrice) || 0);
              const vCost = v.ingredients.reduce((acc, ing) => {
                const mat = products.find((p) => p.id === ing.materialId);
                return acc + Math.round((mat?.costPrice || 0) * (Number(ing.quantity) || 0));
              }, 0);
              return {
                name: v.name.trim() || (idx === 0 ? "Standar" : `Ukuran ${idx + 1}`),
                sellPrice: effectivePrice,
                costPrice: vCost,
                ingredients: v.ingredients.map((ig) => ({
                  materialId: ig.materialId,
                  quantity: Number(ig.quantity),
                  unit: ig.unit,
                })),
              };
            })
          : undefined;

      const primaryRecipeCost = normalizedVariants?.[0]?.costPrice ?? 0;
      const primaryRecipeSell = normalizedVariants?.[0]?.sellPrice ?? Math.round(Number(sellPrice) || 0);

      const payload = {
        id: editingProduct?.id || undefined,
        sku: sku.trim() || `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
        barcode: barcode.trim() || null,
        name: trimmedName,
        categoryId: resolvedCategoryId,
        stockMethod,
        isRawMaterial: false,
        purchaseUnit: stockMethod === "PECAH" ? purchaseUnit : stockMethod === "RESEP" ? "pcs" : sellUnit,
        sellUnit: stockMethod === "RESEP" ? "pcs" : sellUnit,
        conversionRatio: stockMethod === "PECAH" ? Math.max(1, Number(conversionRatio) || 1) : 1,
        costPrice: stockMethod === "RESEP" ? primaryRecipeCost : Math.round(Number(costPrice) || 0),
        sellPrice: stockMethod === "RESEP" ? primaryRecipeSell : Math.round(Number(sellPrice) || 0),
        currentStock: stockMethod === "RESEP" ? 0 : Math.max(0, Number(currentStock) || 0),
        minStockAlert: Math.max(0, Number(minStockAlert) || 5),
        variants: normalizedVariants,
      };

      const res = await fetch("/api/products", {
        method: editingProduct ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menyimpan produk.", "error");
        return;
      }

      if (data.mode === "REQUEST") {
        showToast(
          data.message || "Pengajuan produk berhasil dikirim dan menunggu persetujuan Pemilik atau Manajer.",
          "info"
        );
        await onSaved("REQUEST", trimmedName);
      } else {
        showToast(
          editingProduct
            ? `Menu "${data.product.name}" berhasil diperbarui.`
            : `Menu "${data.product.name}" berhasil ditambahkan dan siap dijual di Kasir.`,
          "success"
        );
        await onSaved("DIRECT", data.product.name);
      }
      onClose();
    } catch {
      showToast("Gagal menghubungi server. Coba beberapa saat lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingProduct
          ? `Ubah Menu: ${editingProduct.name}`
          : isAdmin
          ? "Tambah Menu / Produk Jual"
          : "Ajukan Menu / Produk Baru"
      }
      subtitle="Pilih produk langsung jual atau menu racikan yang memecah stok bahan baku secara otomatis."
      widthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {!editingProduct && !isAdmin && (
          <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] flex items-start gap-2.5">
            <Info size={16} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Produk yang Anda kirim akan berstatus <strong>Menunggu Persetujuan</strong> dan aktif di Kasir setelah disetujui Pemilik atau Manajer.
            </p>
          </div>
        )}

        {/* Pilihan 2 Jenis Produk Jual Ramah Pemula */}
        <div className="space-y-2">
          <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
            Jenis Produk yang Ingin Dijual
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setProductKind("RECIPE")}
              className={`p-3.5 rounded-2xl border text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#334E6B] ${
                productKind === "RECIPE"
                  ? "bg-[#334E6B] text-white border-[#334E6B]"
                  : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold text-sm">
                <CookingPot size={18} weight="duotone" aria-hidden="true" />
                <span>Menu Racikan / Resep</span>
              </div>
              <p
                className={`text-xs mt-1 ${
                  productKind === "RECIPE" ? "text-slate-200" : "text-slate-600"
                }`}
              >
                Misalnya Kopi Susu atau Es Teh Manis. Stok bahan baku otomatis dipecah tiap gelas terjual.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setProductKind("READY")}
              className={`p-3.5 rounded-2xl border text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#334E6B] ${
                productKind === "READY"
                  ? "bg-[#334E6B] text-white border-[#334E6B]"
                  : "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold text-sm">
                <Package size={18} weight="duotone" aria-hidden="true" />
                <span>Produk Langsung Jual</span>
              </div>
              <p
                className={`text-xs mt-1 ${
                  productKind === "READY" ? "text-slate-200" : "text-slate-600"
                }`}
              >
                Misalnya Air Mineral, Roti, atau Snack kemasan. Stok langsung berkurang 1 saat terjual.
              </p>
            </button>
          </div>
        </div>

        {/* Nama Menu & Harga Jual */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label htmlFor="prod-drawer-name" className="block text-sm font-bold text-slate-900">
              {productKind === "RECIPE" ? "Nama Menu" : "Nama Produk"}
            </label>
            <input
              id="prod-drawer-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                productKind === "RECIPE"
                  ? "Contoh: Es Kopi Susu, Teh Manis"
                  : "Contoh: Air Mineral 600ml, Roti Cokelat"
              }
              className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:border-[#334E6B]"
            />
          </div>

          {!(productKind === "RECIPE" && variants.length > 1) && (
            <div className="space-y-1.5">
              <label htmlFor="prod-drawer-sellprice" className="block text-sm font-bold text-slate-900">
                Harga Jual di Kasir
              </label>
              <div className="relative">
                <span
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 select-none"
                  aria-hidden="true"
                >
                  Rp
                </span>
                <input
                  id="prod-drawer-sellprice"
                  type="number"
                  min={0}
                  required
                  value={sellPrice}
                  onChange={(e) => {
                    const nextVal = Math.max(0, Number(e.target.value) || 0);
                    setSellPrice(nextVal);
                    if (productKind === "RECIPE" && variants.length === 1) {
                      setVariants((prev) =>
                        prev.map((v, i) => (i === 0 ? { ...v, sellPrice: nextVal } : v))
                      );
                    }
                  }}
                  placeholder="15000"
                  className="w-full pl-11 pr-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white focus:border-[#334E6B]"
                />
              </div>
            </div>
          )}
        </div>

        {/* MODE A: PRODUK LANGSUNG JUAL */}
        {productKind === "READY" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label htmlFor="ready-cost" className="block text-sm font-bold text-slate-900">
                  Harga Modal / Beli per 1 {getUnitDisplayLabel(sellUnit)}
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-600 select-none"
                    aria-hidden="true"
                  >
                    Rp
                  </span>
                  <input
                    id="ready-cost"
                    type="number"
                    min={0}
                    value={costPrice}
                    onChange={(e) => setCostPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full pl-11 pr-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-bold text-slate-900">Satuan Jual</span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SELL_UNITS.map((u) => {
                    const active = !useOtherUnit && sellUnit === u.value;
                    return (
                      <button
                        key={u.value}
                        type="button"
                        onClick={() => {
                          setUseOtherUnit(false);
                          setSellUnit(u.value);
                        }}
                        className={`flex-1 min-w-[68px] px-2.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer ${
                          active
                            ? "bg-[#334E6B] text-white border-[#334E6B]"
                            : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setUseOtherUnit((prev) => !prev)}
                    className={`px-2.5 min-h-[44px] rounded-xl text-xs font-bold border cursor-pointer ${
                      useOtherUnit
                        ? "bg-[#334E6B] text-white border-[#334E6B]"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    Lainnya
                  </button>
                </div>
                {useOtherUnit && (
                  <select
                    aria-label="Pilih satuan jual lainnya"
                    value={sellUnit}
                    onChange={(e) => setSellUnit(e.target.value)}
                    className="w-full px-3 h-10 mt-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white cursor-pointer"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.label || u.name} ({u.group})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Stok Sekarang */}
            <div className="p-4 rounded-2xl bg-[#F0FDFA] border border-[#99F6E4] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="ready-stock" className="text-sm font-bold text-[#0F766E]">
                  {editingProduct
                    ? `Stok Tersedia Sekarang (${getUnitDisplayLabel(sellUnit)})`
                    : `Jumlah Stok Awal (${getUnitDisplayLabel(sellUnit)})`}
                </label>
                <div className="flex items-center gap-1.5">
                  {[10, 25, 50].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() =>
                        setCurrentStock((prev) => Math.max(0, (Number(prev) || 0) + inc))
                      }
                      className="px-2.5 min-h-[34px] rounded-lg bg-white border border-[#99F6E4] text-xs font-bold text-[#0F766E] hover:bg-[#CCFBF1] cursor-pointer"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="ready-stock"
                type="number"
                min={0}
                step="any"
                value={currentStock}
                onChange={(e) => setCurrentStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3.5 h-11 rounded-xl border border-slate-300 text-sm font-mono font-extrabold text-slate-900 bg-white"
              />
              {sellPrice > 0 && (
                <p
                  className={`text-xs font-bold ${
                    readyProfit < 0 ? "text-[#9F1239]" : "text-[#0F766E]"
                  }`}
                >
                  {readyProfit < 0
                    ? `Perhatian: Harga jual lebih rendah ${formatRupiah(Math.abs(readyProfit))} dari harga modal.`
                    : `Estimasi untung kotor: ${formatRupiah(readyProfit)} per ${getUnitDisplayLabel(sellUnit)}`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* MODE B: MENU RACIKAN / RESEP (PECAH DARI BAHAN BAKU DI SINI!) */}
        {productKind === "RECIPE" && (
          <div className="space-y-4">
            {/* Tab Ukuran jika user menambahkan lebih dari 1 ukuran */}
            {variants.length > 1 && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-slate-800">
                    Pilih Ukuran yang Sedang Diatur Resepnya:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = variants.length;
                      setVariants((prev) => [
                        ...prev,
                        {
                          name: nextIdx === 1 ? "Large" : `Ukuran ${nextIdx + 1}`,
                          sellPrice: Math.max(0, (sellPrice || 10000) + 3000),
                          costPrice: 0,
                          ingredients: prev[0]?.ingredients.map((ig) => ({ ...ig })) || [],
                        },
                      ]);
                      setActiveVariantIdx(nextIdx);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#334E6B] text-white text-xs font-bold cursor-pointer"
                  >
                    <Plus size={14} weight="bold" aria-hidden="true" />
                    <span>Ukuran Baru</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {variants.map((v, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveVariantIdx(idx)}
                      className={`px-3.5 min-h-[40px] rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        safeVariantIdx === idx
                          ? "bg-[#334E6B] text-white border-[#334E6B]"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {v.name || `Ukuran ${idx + 1}`} ({formatRupiah(v.sellPrice)})
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label
                      htmlFor="variant-name-input"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      Nama Ukuran
                    </label>
                    <input
                      id="variant-name-input"
                      type="text"
                      value={currentVariant.name}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((row, i) =>
                            i === safeVariantIdx ? { ...row, name: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Regular / Large"
                      className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label
                        htmlFor="variant-price-input"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Harga Jual Ukuran Ini (Rp)
                      </label>
                      <input
                        id="variant-price-input"
                        type="number"
                        min={0}
                        value={currentVariant.sellPrice}
                        onChange={(e) => {
                          const nextVal = Math.max(0, Number(e.target.value) || 0);
                          if (safeVariantIdx === 0) setSellPrice(nextVal);
                          setVariants((prev) =>
                            prev.map((row, i) =>
                              i === safeVariantIdx ? { ...row, sellPrice: nextVal } : row
                            )
                          );
                        }}
                        className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVariants((prev) => {
                          const next = prev.filter((_, i) => i !== safeVariantIdx);
                          if (next.length === 1) {
                            setSellPrice(next[0].sellPrice);
                          }
                          return next;
                        });
                        setActiveVariantIdx(0);
                      }}
                      className="px-3 h-10 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239] text-xs font-bold cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pemilih Bahan Baku 1-Klik */}
            <div className="p-4 rounded-2xl bg-[#F0FDFA] border border-[#99F6E4] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-[#0F766E]">
                    Pilih Bahan Baku untuk Resep Ini
                  </p>
                  <p className="text-xs text-[#0F766E]">
                    Klik bahan di bawah untuk memasukkan ke resep, lalu tentukan takaran per gelas/porsi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSwitchToAddMaterial}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-white border border-[#99F6E4] text-xs font-bold text-[#0F766E] hover:bg-[#CCFBF1] cursor-pointer"
                >
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  <span>Bahan Baku Baru</span>
                </button>
              </div>

              {availableMaterials.length === 0 ? (
                <div className="p-4 rounded-xl bg-white border border-[#FDE68A] text-xs text-[#92400E] space-y-2.5">
                  <p className="font-bold">
                    Belum ada bahan baku di stok Anda.
                  </p>
                  <p>
                    Masukkan bahan baku terlebih dahulu (misalnya <strong>Susu Ultra Milk 1000 ml</strong> atau <strong>Gula Pasir 1000 gram</strong>), nanti bahan tersebut otomatis muncul di sini untuk dipecah ke resep.
                  </p>
                  <button
                    type="button"
                    onClick={onSwitchToAddMaterial}
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#0F766E] text-white text-xs font-extrabold cursor-pointer"
                  >
                    <Plus size={16} weight="bold" aria-hidden="true" />
                    <span>Masukkan Bahan Baku Pertama</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableMaterials.map((mat) => {
                    const selected = currentVariant.ingredients.some(
                      (ig) => ig.materialId === mat.id
                    );
                    const uLabel = getUnitDisplayLabel(mat.sellUnit);
                    return (
                      <button
                        key={mat.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleMaterialInVariant(mat)}
                        className={`inline-flex items-center gap-2 px-3 py-2 min-h-[42px] rounded-xl text-xs font-bold border transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] ${
                          selected
                            ? "bg-[#0F766E] text-white border-[#0F766E]"
                            : "bg-white text-slate-900 border-[#99F6E4] hover:bg-[#CCFBF1]"
                        }`}
                      >
                        {selected ? (
                          <CheckCircle size={15} weight="fill" aria-hidden="true" />
                        ) : (
                          <Plus size={14} weight="bold" aria-hidden="true" />
                        )}
                        <span>{mat.name}</span>
                        <span
                          className={`font-mono text-[11px] ${
                            selected ? "text-teal-100" : "text-[#0F766E]"
                          }`}
                        >
                          ({formatNumber(mat.currentStock)} {uLabel})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Daftar Bahan Terpilih & Pemecahan Takaran per Porsi */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-900">
                  Takaran Bahan per 1 Porsi {variants.length > 1 ? `(${currentVariant.name})` : ""}
                </p>
                <span className="text-xs font-semibold text-slate-600">
                  {currentVariant.ingredients.length} bahan dipilih
                </span>
              </div>

              {currentVariant.ingredients.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-600">
                  Klik salah satu bahan baku di kotak hijau di atas (misalnya <strong>Susu Ultra Milk</strong>) untuk mulai mengatur takaran resep.
                </div>
              ) : (
                <div className="space-y-3">
                  {currentVariant.ingredients.map((ing, ingIdx) => {
                    const mat = products.find((p) => p.id === ing.materialId);
                    const uLabel = getUnitDisplayLabel(ing.unit);
                    const qty = Number(ing.quantity) || 0;
                    const ingCost = Math.round((mat?.costPrice || 0) * qty);
                    const portionsFromMat =
                      mat && qty > 0 ? Math.floor(mat.currentStock / qty) : 0;
                    const packRef = mat && mat.conversionRatio > 1 ? mat.conversionRatio : mat?.currentStock || 0;
                    const pctOfPack =
                      packRef > 0 ? Math.min(100, Math.round((qty / packRef) * 100)) : 0;
                    const quickDosages = getQuickDosagesForUnit(ing.unit);

                    return (
                      <div
                        key={ing.materialId}
                        className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">
                              {mat?.name || "Bahan Baku"}
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              Sisa stok:{" "}
                              <strong className="font-mono text-slate-900">
                                {formatNumber(mat?.currentStock || 0)} {uLabel}
                              </strong>{" "}
                              • Modal:{" "}
                              <strong className="font-mono text-slate-800">
                                {formatRupiah(mat?.costPrice || 0)}/{uLabel}
                              </strong>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeIngredient(ingIdx)}
                            className="inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg text-xs font-bold text-[#9F1239] hover:bg-[#FFF1F2] cursor-pointer"
                          >
                            <Trash size={14} weight="bold" aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        </div>

                        {/* Input Takaran + Tombol Cepat */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={`ing-qty-${ing.materialId}`}
                              className="text-xs font-bold text-slate-700"
                            >
                              Dipakai per 1 porsi:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                id={`ing-qty-${ing.materialId}`}
                                type="number"
                                min={0.1}
                                step="any"
                                value={ing.quantity}
                                onChange={(e) =>
                                  updateIngredientQty(ingIdx, Number(e.target.value))
                                }
                                className="w-24 px-3 h-10 rounded-xl border border-slate-300 text-sm font-mono font-extrabold text-slate-900 bg-slate-50 focus:bg-white"
                              />
                              <span className="text-xs font-extrabold text-slate-700">
                                {uLabel}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-500 mr-1">
                              Takaran cepat:
                            </span>
                            {quickDosages.map((dose) => (
                              <button
                                key={dose}
                                type="button"
                                onClick={() => updateIngredientQty(ingIdx, dose)}
                                className={`px-2.5 min-h-[32px] rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                  qty === dose
                                    ? "bg-[#334E6B] text-white border-[#334E6B]"
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {dose} {uLabel}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Visual Feedback Pecahan Kemasan & Biaya */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-slate-700">
                              Modal bahan ini:{" "}
                              <strong className="font-mono text-[#B45309]">
                                {formatRupiah(ingCost)}
                              </strong>
                            </span>
                            <span
                              className={`font-bold ${
                                portionsFromMat <= 0 ? "text-[#9F1239]" : "text-[#0F766E]"
                              }`}
                            >
                              {portionsFromMat <= 0
                                ? "Stok belum cukup untuk 1 porsi"
                                : `Cukup untuk ${formatNumber(portionsFromMat)} porsi`}
                            </span>
                          </div>
                          {packRef > 0 && (
                            <div className="space-y-1">
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#0F766E] transition-all duration-150"
                                  style={{ width: `${Math.max(4, pctOfPack)}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Memakai {pctOfPack}% dari 1 kemasan ({formatNumber(packRef)} {uLabel}) per porsi
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tombol Opsional Tambah Ukuran (Regular / Large) */}
            {variants.length === 1 && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setVariants((prev) => [
                      { ...prev[0], name: "Regular", sellPrice: sellPrice || prev[0].sellPrice },
                      {
                        name: "Large",
                        sellPrice: Math.max(0, (sellPrice || prev[0].sellPrice || 10000) + 3000),
                        costPrice: 0,
                        ingredients: prev[0].ingredients.map((ig) => ({ ...ig })),
                      },
                    ]);
                    setActiveVariantIdx(1);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#334E6B] hover:underline py-1 cursor-pointer"
                >
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  <span>Menu ini punya lebih dari 1 ukuran? (misal Regular &amp; Large)</span>
                </button>
              </div>
            )}

            {/* Ringkasan Otomatis Modal, Untung & Kapasitas Stok */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-extrabold text-slate-900">
                Ringkasan Otomatis per 1 Porsi
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <p className="text-slate-600">Total Modal Bahan</p>
                  <p className="text-base font-extrabold font-mono text-[#B45309] mt-0.5 tabular-nums">
                    {formatRupiah(activeStats.totalCost)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <p className="text-slate-600">Untung Kotor / Porsi</p>
                  <p
                    className={`text-base font-extrabold font-mono mt-0.5 tabular-nums ${
                      activeStats.profitRp < 0 ? "text-[#9F1239]" : "text-[#0F766E]"
                    }`}
                  >
                    {formatRupiah(activeStats.profitRp)}
                    {activeStats.effectiveSell > 0 ? ` (${activeStats.marginPct}%)` : ""}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <p className="text-slate-600">Bisa Dibuat Sekarang</p>
                  <p className="text-base font-extrabold font-mono text-[#334E6B] mt-0.5 tabular-nums">
                    {formatNumber(activeStats.resolvedPortions)} porsi
                  </p>
                </div>
              </div>

              {activeStats.effectiveSell > 0 && activeStats.profitRp < 0 && (
                <div className="p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-xs font-semibold text-[#9F1239] flex items-start gap-2">
                  <Warning size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Harga jual ({formatRupiah(activeStats.effectiveSell)}) lebih rendah daripada total modal bahan ({formatRupiah(activeStats.totalCost)}).
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pengaturan Tambahan (Terlipat untuk Pemula) */}
        <div className="border-t border-slate-200 pt-3">
          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 cursor-pointer"
          >
            {showAdvanced ? (
              <CaretUp size={15} weight="bold" aria-hidden="true" />
            ) : (
              <CaretDown size={15} weight="bold" aria-hidden="true" />
            )}
            <span>Pengaturan Tambahan (Kode SKU, Barcode, Kategori{productKind === "READY" ? ", Pecah Dus" : ""})</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              {productKind === "READY" && (
                <div className="space-y-2.5 pb-3 border-b border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useBulkSplit}
                      onChange={(e) => setUseBulkSplit(e.target.checked)}
                      className="w-4 h-4 rounded text-[#334E6B]"
                    />
                    <span>Beli dalam dus/pak lalu jual satuan (Pecah Satuan)</span>
                  </label>
                  {useBulkSplit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="bulk-unit" className="block text-xs font-bold text-slate-700 mb-1">
                          Satuan Beli Besar
                        </label>
                        <select
                          id="bulk-unit"
                          value={purchaseUnit}
                          onChange={(e) => setPurchaseUnit(e.target.value)}
                          className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs bg-white cursor-pointer"
                        >
                          {units.map((u) => (
                            <option key={u.id} value={u.name}>
                              {u.label || u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="bulk-ratio" className="block text-xs font-bold text-slate-700 mb-1">
                          Isi per 1 {purchaseUnit} (dalam {sellUnit})
                        </label>
                        <input
                          id="bulk-ratio"
                          type="number"
                          min={1}
                          step="any"
                          value={conversionRatio}
                          onChange={(e) => setConversionRatio(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-adv-sku" className="block text-xs font-bold text-slate-700 mb-1">
                    Kode SKU (Otomatis)
                  </label>
                  <input
                    id="prod-adv-sku"
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="prod-adv-barcode" className="block text-xs font-bold text-slate-700 mb-1">
                    Kode Barcode (Opsional)
                  </label>
                  <input
                    id="prod-adv-barcode"
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="899..."
                    className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-adv-cat" className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    id="prod-adv-cat"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-semibold bg-white cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.areaType})
                      </option>
                    ))}
                  </select>
                </div>
                {productKind === "READY" && (
                  <div>
                    <label htmlFor="prod-adv-min" className="block text-xs font-bold text-slate-700 mb-1">
                      Batas Peringatan Stok Menipis
                    </label>
                    <input
                      id="prod-adv-min"
                      type="number"
                      min={0}
                      value={minStockAlert}
                      onChange={(e) => setMinStockAlert(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-3 h-10 rounded-xl border border-slate-300 text-xs font-mono bg-white"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {canSave && (
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="w-full flex items-center justify-center gap-2 px-5 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-sm font-extrabold hover:bg-[#24384E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
          >
            <FloppyDisk size={18} weight="bold" aria-hidden="true" />
            <span>
              {submitting
                ? "Menyimpan Menu..."
                : editingProduct
                ? "Simpan Perubahan"
                : isAdmin
                ? "Simpan & Aktifkan di Kasir"
                : "Kirim Pengajuan Menu"}
            </span>
          </button>
        )}
      </form>
    </SlideDrawer>
  );
}

