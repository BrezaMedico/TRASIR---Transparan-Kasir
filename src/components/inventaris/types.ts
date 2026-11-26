export interface InventoryProduct {
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

export interface BlindCountProd {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  areaType: string;
  sellUnit: string;
}

export interface StockAdjustmentRow {
  id: string;
  productId: string;
  adjustmentType: string;
  quantity: number;
  reason: string;
  proofImageData: string | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sellUnit: string;
    category: { name: string; areaType: string };
  };
  fromWarehouse?: { id: string; name: string } | null;
  toWarehouse?: { id: string; name: string } | null;
  requestedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

export interface OpnameItemRow {
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

export interface OpnameSessionRow {
  id: string;
  title: string;
  scheduleType: string;
  toleranceThreshold: number;
  status: string;
  createdAt: string;
  createdBy: { id: string; name: string; role: string };
  items: OpnameItemRow[];
}

export type AdjustmentType =
  | "RUSAK"
  | "KEDALUWARSA"
  | "HILANG"
  | "DIKEMBALIKAN"
  | "PINDAH_GUDANG";

