"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/layout/AppShell";
import {
  getDefaultRecipeQty,
  type CategoryOption,
  type ProductItem,
  type ProposalCartItem,
  type VariantRow,
} from "./types";

export const COMMON_SELL_UNITS = [
  { value: "pcs", label: "pcs" },
  { value: "botol", label: "botol" },
  { value: "bungkus", label: "bungkus" },
];

export interface UseProductDrawerParams {
  isOpen: boolean;
  onClose: () => void;
  editingProduct: ProductItem | null;
  products: ProductItem[];
  queuedMaterials: ProductItem[];
  categories: CategoryOption[];
  isAdmin: boolean;
  onSaved: (mode: "DIRECT" | "REQUEST", productName: string) => Promise<void> | void;
  onAddToCart?: (item: ProposalCartItem) => void;
}

export function useProductDrawerForm({
  isOpen,
  onClose,
  editingProduct,
  products,
  queuedMaterials,
  categories,
  isAdmin,
  onSaved,
  onAddToCart,
}: UseProductDrawerParams) {
  const { showToast } = useToast();

  const [productKind, setProductKind] = useState<"READY" | "RECIPE">("RECIPE");
  const [useBulkSplit, setUseBulkSplit] = useState(false);
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellUnit, setSellUnit] = useState("pcs");
  const [useOtherUnit, setUseOtherUnit] = useState(false);
  const [purchaseUnit, setPurchaseUnit] = useState("dus");
  const [conversionRatio, setConversionRatio] = useState<number>(24);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [variants, setVariants] = useState<VariantRow[]>([
    { name: "Standar", sellPrice: 0, costPrice: 0, ingredients: [] },
  ]);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);

  const allMaterialsPool = useMemo(
    () => [...queuedMaterials, ...products],
    [queuedMaterials, products]
  );

  const queuedMaterialIdSet = useMemo(
    () => new Set(queuedMaterials.map((m) => m.id)),
    [queuedMaterials]
  );

  const availableMaterials = useMemo(() => {
    const list = allMaterialsPool.filter(
      (p) => p.id !== (editingProduct?.id ?? null) && p.stockMethod !== "RESEP"
    );
    return [...list].sort((a, b) => {
      if (a.isRawMaterial !== b.isRawMaterial) return a.isRawMaterial ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [allMaterialsPool, editingProduct]);

  const rawMaterialsOnly = useMemo(
    () => availableMaterials.filter((m) => m.isRawMaterial),
    [availableMaterials]
  );

  useEffect(() => {
    if (!isOpen) return;
    const defaultOpenCat = categories.find((c) => c.areaType === "TERBUKA") || categories[0];

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
          return { ...v, ingredients: v.ingredients.filter((ig) => ig.materialId !== mat.id) };
        }
        return {
          ...v,
          ingredients: [
            ...v.ingredients,
            { materialId: mat.id, quantity: getDefaultRecipeQty(mat.sellUnit), unit: mat.sellUnit },
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
          ? { ...v, ingredients: v.ingredients.filter((_, j) => j !== ingIdx) }
          : v
      )
    );
  };

  const computeVariantStats = (v: VariantRow) => {
    const totalCost = v.ingredients.reduce((acc, ing) => {
      const mat = allMaterialsPool.find((p) => p.id === ing.materialId);
      return acc + Math.round((mat?.costPrice || 0) * (Number(ing.quantity) || 0));
    }, 0);

    let maxPortions = Infinity;
    for (const ing of v.ingredients) {
      if (ing.quantity <= 0) continue;
      const mat = allMaterialsPool.find((p) => p.id === ing.materialId);
      const possible = Math.floor((mat?.currentStock || 0) / ing.quantity);
      if (possible < maxPortions) maxPortions = possible;
    }
    const resolvedPortions = Number.isFinite(maxPortions) ? Math.max(0, maxPortions) : 0;
    const effectiveSell = variants.length === 1 ? sellPrice : v.sellPrice;
    const profitRp = effectiveSell - totalCost;
    const marginPct = effectiveSell > 0 ? Math.round((profitRp / effectiveSell) * 100) : 0;
    return { totalCost, resolvedPortions, profitRp, marginPct, effectiveSell };
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
      categoryId || categories.find((c) => c.areaType === "TERBUKA")?.id || categories[0]?.id || "";
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
                variants.length === 1
                  ? Math.round(Number(sellPrice) || 0)
                  : Math.round(Number(v.sellPrice) || 0);
              const vCost = v.ingredients.reduce((acc, ing) => {
                const mat = allMaterialsPool.find((p) => p.id === ing.materialId);
                return acc + Math.round((mat?.costPrice || 0) * (Number(ing.quantity) || 0));
              }, 0);
              return {
                name: v.name.trim() || (idx === 0 ? "Standar" : `Ukuran ${idx + 1}`),
                sellPrice: effectivePrice,
                costPrice: vCost,
                ingredients: v.ingredients.map((ig) => {
                  const mat = allMaterialsPool.find((p) => p.id === ig.materialId);
                  return {
                    materialId: ig.materialId,
                    materialName: mat?.name,
                    quantity: Number(ig.quantity),
                    unit: ig.unit,
                  };
                }),
              };
            })
          : undefined;

      const primaryRecipeCost = normalizedVariants?.[0]?.costPrice ?? 0;
      const primaryRecipeSell =
        normalizedVariants?.[0]?.sellPrice ?? Math.round(Number(sellPrice) || 0);
      const resolvedCatObj = categories.find((c) => c.id === resolvedCategoryId);
      const resolvedSku = sku.trim() || `PRD-${Math.floor(1000 + Math.random() * 9000)}`;

      const payload = {
        id: editingProduct?.id || undefined,
        sku: resolvedSku,
        barcode: barcode.trim() || null,
        name: trimmedName,
        categoryId: resolvedCategoryId,
        stockMethod,
        isRawMaterial: false,
        purchaseUnit:
          stockMethod === "PECAH" ? purchaseUnit : stockMethod === "RESEP" ? "pcs" : sellUnit,
        sellUnit: stockMethod === "RESEP" ? "pcs" : sellUnit,
        conversionRatio: stockMethod === "PECAH" ? Math.max(1, Number(conversionRatio) || 1) : 1,
        costPrice: stockMethod === "RESEP" ? primaryRecipeCost : Math.round(Number(costPrice) || 0),
        sellPrice: stockMethod === "RESEP" ? primaryRecipeSell : Math.round(Number(sellPrice) || 0),
        currentStock: stockMethod === "RESEP" ? 0 : Math.max(0, Number(currentStock) || 0),
        minStockAlert: Math.max(0, Number(minStockAlert) || 5),
        variants: normalizedVariants,
      };

      if (!isAdmin && onAddToCart) {
        onAddToCart({
          clientTempId: editingProduct
            ? `cart-edit-${editingProduct.id}`
            : `cart-prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          requestKind: editingProduct ? "UPDATE" : "CREATE",
          targetProductId: editingProduct?.id,
          previousSnapshot: editingProduct
            ? {
                name: editingProduct.name,
                sku: editingProduct.sku,
                barcode: editingProduct.barcode,
                costPrice: editingProduct.costPrice,
                sellPrice: editingProduct.sellPrice,
                currentStock: editingProduct.currentStock,
                minStockAlert: editingProduct.minStockAlert,
                stockMethod: editingProduct.stockMethod,
                purchaseUnit: editingProduct.purchaseUnit,
                sellUnit: editingProduct.sellUnit,
                conversionRatio: editingProduct.conversionRatio,
              }
            : undefined,
          sku: payload.sku,
          barcode: payload.barcode,
          name: payload.name,
          categoryId: payload.categoryId,
          categoryName: resolvedCatObj?.name,
          stockMethod: payload.stockMethod,
          isRawMaterial: false,
          purchaseUnit: payload.purchaseUnit,
          sellUnit: payload.sellUnit,
          conversionRatio: payload.conversionRatio,
          costPrice: payload.costPrice,
          sellPrice: payload.sellPrice,
          currentStock: payload.currentStock,
          minStockAlert: payload.minStockAlert,
          variants: normalizedVariants,
        });
        setSubmitting(false);
        onClose();
        return;
      }

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
          data.message ||
            "Pengajuan produk berhasil dikirim dan menunggu persetujuan Pemilik atau Manajer.",
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

  return {
    productKind,
    setProductKind,
    useBulkSplit,
    setUseBulkSplit,
    name,
    setName,
    sellPrice,
    setSellPrice,
    costPrice,
    setCostPrice,
    sellUnit,
    setSellUnit,
    useOtherUnit,
    setUseOtherUnit,
    purchaseUnit,
    setPurchaseUnit,
    conversionRatio,
    setConversionRatio,
    currentStock,
    setCurrentStock,
    variants,
    setVariants,
    safeVariantIdx,
    setActiveVariantIdx,
    currentVariant,
    showAdvanced,
    setShowAdvanced,
    sku,
    setSku,
    barcode,
    setBarcode,
    categoryId,
    setCategoryId,
    minStockAlert,
    setMinStockAlert,
    submitting,
    allMaterialsPool,
    queuedMaterialIdSet,
    availableMaterials,
    activeStats,
    readyProfit,
    toggleMaterialInVariant,
    updateIngredientQty,
    removeIngredient,
    handleSubmit,
  };
}

