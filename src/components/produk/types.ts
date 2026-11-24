export interface IngredientRow {
  materialId: string;
  materialName?: string;
  quantity: number;
  unit: string;
}

export interface VariantRow {
  name: string;
  sellPrice: number;
  costPrice: number;
  ingredients: IngredientRow[];
}

export interface ProposalCartItem {
  clientTempId: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  categoryName?: string;
  stockMethod: "TETAP" | "PECAH" | "RESEP";
  isRawMaterial: boolean;
  purchaseUnit: string;
  sellUnit: string;
  conversionRatio: number;
  costPrice: number;
  sellPrice: number;
  currentStock: number;
  minStockAlert: number;
  variants?: VariantRow[];
  packSize?: number;
  packCount?: number;
  packPrice?: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  areaType: string;
}

export interface UnitOption {
  id: string;
  name: string;
  label: string;
  group: string;
}

export interface ProductItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  category: CategoryOption;
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

export interface ProductRequestItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  category: CategoryOption;
  stockMethod: "TETAP" | "PECAH" | "RESEP";
  isRawMaterial: boolean;
  purchaseUnit: string;
  sellUnit: string;
  conversionRatio: number;
  costPrice: number;
  sellPrice: number;
  minStockAlert: number;
  variantsJson?: string | null;
  status: "MENUNGGU_PERSETUJUAN" | "DISETUJUI" | "DITOLAK";
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string; username: string; role: string };
  reviewedBy: { id: string; name: string; username: string; role: string } | null;
}

export interface InitialProdukCatalog {
  products: ProductItem[];
  categories: CategoryOption[];
  units: UnitOption[];
  pendingRequestsCount?: number;
}

export function parseRequestInitialStock(variantsJson?: string | null): number | null {
  if (!variantsJson) return null;
  try {
    const parsed = JSON.parse(variantsJson) as { initialStock?: unknown } | unknown[];
    if (
      !Array.isArray(parsed) &&
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.initialStock === "number"
    ) {
      return Math.max(0, parsed.initialStock);
    }
  } catch {
    return null;
  }
  return null;
}

export function getUnitDisplayLabel(unit: string): string {
  if (unit === "g") return "gram";
  return unit;
}

export function getQuickDosagesForUnit(unit: string): number[] {
  if (unit === "ml" || unit === "g") {
    return [10, 25, 50, 100, 150, 200];
  }
  return [1, 2, 3, 5];
}

export function getDefaultRecipeQty(unit: string): number {
  if (unit === "ml") return 100;
  if (unit === "g") return 20;
  return 1;
}

export function computeProductMaxPortions(
  prod: ProductItem,
  allProducts: ProductItem[]
): number {
  if (prod.stockMethod !== "RESEP") {
    return Math.max(0, Math.floor(prod.currentStock));
  }
  const primaryVariant = prod.variants[0];
  if (!primaryVariant || primaryVariant.ingredients.length === 0) return 0;

  let maxPortions = Infinity;
  for (const ing of primaryVariant.ingredients) {
    if (ing.quantity <= 0) continue;
    const liveMat = allProducts.find((p) => p.id === ing.materialId);
    const stock = liveMat ? liveMat.currentStock : 0;
    const possible = Math.floor(stock / ing.quantity);
    if (possible < maxPortions) maxPortions = possible;
  }
  return Number.isFinite(maxPortions) ? Math.max(0, maxPortions) : 0;
}

