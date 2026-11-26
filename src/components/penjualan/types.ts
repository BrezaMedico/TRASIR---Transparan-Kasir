export interface SaleRecord {
  id: string;
  receiptNumber: string;
  paymentMethod: string;
  discountAmount?: number;
  totalAmount: number;
  totalCost: number;
  cashReceived: number;
  changeAmount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  cashier: { id: string; name: string; role: string };
  items: {
    id: string;
    productId: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  amendments: {
    id: string;
    amendmentType: string;
    reason: string;
    proofImageData: string | null;
    proofMimeType?: string | null;
    status: string;
    reviewNotes: string | null;
    reviewedAt?: string | null;
    createdAt: string;
    requestedBy: { id: string; name: string; role: string };
    reviewedBy?: { id: string; name: string; role: string } | null;
  }[];
}

export interface AmendmentRecord {
  id: string;
  saleId: string;
  amendmentType: string;
  reason: string;
  proofImageData: string | null;
  proofMimeType?: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  sale: {
    id: string;
    receiptNumber: string;
    totalAmount: number;
    paymentMethod: string;
    cashier: { id: string; name: string };
    items: {
      id: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      subtotal: number;
    }[];
  };
  requestedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

export interface CashierSummary {
  id: string;
  name: string;
  role: string;
}

export const SALES_PAGE_SIZE = 15;
export const MAX_PROOF_BYTES = 2 * 1024 * 1024;
export const ALLOWED_PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

