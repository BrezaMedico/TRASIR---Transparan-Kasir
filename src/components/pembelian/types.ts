export interface PurchaseInputRow {
  rowKey: string;
  productId: string | null;
  isNewProduct: boolean;
  itemName: string;
  quantity: number;
  unit: string;
  conversionRatio: number;
  sellUnit: string;
  unitCost: number;
  sellPrice: number;
  showSplitOption?: boolean;
}

export interface PurchaseCatalogProd {
  id: string;
  name: string;
  purchaseUnit: string;
  sellUnit: string;
  conversionRatio: number;
  costPrice: number;
  sellPrice: number;
}

export interface PurchaseUnitOption {
  id: string;
  name: string;
  label: string;
  group: string;
}

export function createEmptyPurchaseRow(rowKey = "row-1"): PurchaseInputRow {
  return {
    rowKey,
    productId: null,
    isNewProduct: true,
    itemName: "",
    quantity: 1,
    unit: "pcs",
    conversionRatio: 1,
    sellUnit: "pcs",
    unitCost: 0,
    sellPrice: 0,
    showSplitOption: false,
  };
}

