export interface ProductRequestVariantData {
  name: string;
  sellPrice: number;
  costPrice?: number;
  ingredients?: {
    materialId: string;
    materialName?: string;
    quantity: number;
    unit: string;
  }[];
}

export interface ProductRequestAIItemCheck {
  submittedName: string;
  matchedReceiptName: string | null;
  submittedQty: number;
  submittedUnit: string;
  submittedCostTotal: number;
  receiptQty: number | null;
  receiptUnitCost: number | null;
  receiptSubtotal: number | null;
  matchStatus: "COCOK" | "SELISIH" | "TIDAK_DITEMUKAN" | "RESEP_NON_NOTA";
  note: string | null;
}

export interface ProductRequestAIResult {
  status: "SESUAI" | "ADA_SELISIH" | "TERINDIKASI_EDIT";
  receiptSource: "FISIK" | "DIGITAL";
  extractedSupplier: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  submittedEstimatedTotal: number;
  items: ProductRequestAIItemCheck[];
  neutralSummary: string;
  disclaimer: string;
  aiEngineUsed: boolean;
  checkedAt: string;
}

export interface ProductRequestEnvelope {
  initialStock?: number;
  variants?: ProductRequestVariantData[];
  clientTempId?: string;
  batchId?: string;
  batchIndex?: number;
  batchSize?: number;
  batchTitle?: string;
  batchNote?: string;
  supplierName?: string;
  receiptImageData?: string | null;
  receiptSource?: "FISIK" | "DIGITAL" | null;
  aiScanResult?: ProductRequestAIResult | null;
}

export interface BatchableProductRequestRow {
  id: string;
  name: string;
  stockMethod: string;
  isRawMaterial: boolean;
  costPrice: number;
  sellPrice: number;
  status: string;
  variantsJson?: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string; username?: string; role: string };
}

export interface GroupedProductRequestBatch<T extends BatchableProductRequestRow> {
  batchId: string;
  leadRequestId: string;
  batchTitle: string;
  batchNote: string | null;
  supplierName: string | null;
  receiptImageData: string | null;
  receiptSource: "FISIK" | "DIGITAL" | null;
  aiScanResult: ProductRequestAIResult | null;
  status: "MENUNGGU_PERSETUJUAN" | "DISETUJUI" | "DITOLAK" | "SEBAGIAN";
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalEstimatedCost: number;
  createdAt: string;
  requestedBy: { id: string; name: string; username?: string; role: string };
  items: T[];
}

export function parseProductRequestEnvelope(
  variantsJson?: string | null
): ProductRequestEnvelope {
  if (!variantsJson) return {};
  try {
    const parsed = JSON.parse(variantsJson) as unknown;
    if (Array.isArray(parsed)) {
      return { variants: parsed as ProductRequestVariantData[] };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        initialStock:
          typeof obj.initialStock === "number" && Number.isFinite(obj.initialStock)
            ? Math.max(0, obj.initialStock)
            : undefined,
        variants: Array.isArray(obj.variants)
          ? (obj.variants as ProductRequestVariantData[])
          : undefined,
        clientTempId: typeof obj.clientTempId === "string" ? obj.clientTempId : undefined,
        batchId: typeof obj.batchId === "string" ? obj.batchId : undefined,
        batchIndex:
          typeof obj.batchIndex === "number" && Number.isFinite(obj.batchIndex)
            ? obj.batchIndex
            : undefined,
        batchSize:
          typeof obj.batchSize === "number" && Number.isFinite(obj.batchSize)
            ? obj.batchSize
            : undefined,
        batchTitle: typeof obj.batchTitle === "string" ? obj.batchTitle : undefined,
        batchNote: typeof obj.batchNote === "string" ? obj.batchNote : undefined,
        supplierName: typeof obj.supplierName === "string" ? obj.supplierName : undefined,
        receiptImageData:
          typeof obj.receiptImageData === "string" ? obj.receiptImageData : null,
        receiptSource:
          obj.receiptSource === "FISIK" || obj.receiptSource === "DIGITAL"
            ? obj.receiptSource
            : null,
        aiScanResult:
          obj.aiScanResult && typeof obj.aiScanResult === "object"
            ? (obj.aiScanResult as ProductRequestAIResult)
            : null,
      };
    }
  } catch {
    return {};
  }
  return {};
}

export function serializeProductRequestEnvelope(
  envelope: ProductRequestEnvelope
): string | null {
  const clean: ProductRequestEnvelope = {};
  if (typeof envelope.initialStock === "number" && envelope.initialStock > 0) {
    clean.initialStock = envelope.initialStock;
  }
  if (envelope.variants && envelope.variants.length > 0) {
    clean.variants = envelope.variants;
  }
  if (envelope.clientTempId) clean.clientTempId = envelope.clientTempId;
  if (envelope.batchId) clean.batchId = envelope.batchId;
  if (typeof envelope.batchIndex === "number") clean.batchIndex = envelope.batchIndex;
  if (typeof envelope.batchSize === "number") clean.batchSize = envelope.batchSize;
  if (envelope.batchTitle) clean.batchTitle = envelope.batchTitle;
  if (envelope.batchNote) clean.batchNote = envelope.batchNote;
  if (envelope.supplierName) clean.supplierName = envelope.supplierName;
  if (envelope.receiptImageData) clean.receiptImageData = envelope.receiptImageData;
  if (envelope.receiptSource) clean.receiptSource = envelope.receiptSource;
  if (envelope.aiScanResult) clean.aiScanResult = envelope.aiScanResult;

  if (Object.keys(clean).length === 0) return null;
  return JSON.stringify(clean);
}

export function computeRequestItemEstimatedCost(item: {
  stockMethod: string;
  costPrice: number;
  initialStock?: number;
}): number {
  if (item.stockMethod === "RESEP") return 0;
  const qty = Math.max(0, Number(item.initialStock) || 0);
  if (qty <= 0) return 0;
  return Math.round(Math.max(0, item.costPrice) * qty);
}

export function groupProductRequestsIntoBatches<T extends BatchableProductRequestRow>(
  requests: T[]
): GroupedProductRequestBatch<T>[] {
  const groupMap = new Map<
    string,
    {
      rows: { row: T; env: ProductRequestEnvelope }[];
    }
  >();

  for (const row of requests) {
    const env = parseProductRequestEnvelope(row.variantsJson);
    const key = env.batchId ? env.batchId : `single-${row.id}`;
    const bucket = groupMap.get(key);
    if (bucket) {
      bucket.rows.push({ row, env });
    } else {
      groupMap.set(key, { rows: [{ row, env }] });
    }
  }

  const batches: GroupedProductRequestBatch<T>[] = [];

  for (const [batchId, bucket] of groupMap.entries()) {
    const sorted = [...bucket.rows].sort((a, b) => {
      const idxA = typeof a.env.batchIndex === "number" ? a.env.batchIndex : Number.MAX_SAFE_INTEGER;
      const idxB = typeof b.env.batchIndex === "number" ? b.env.batchIndex : Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) return idxA - idxB;
      return a.row.createdAt.localeCompare(b.row.createdAt);
    });

    const items = sorted.map((s) => s.row);
    const lead = sorted[0];

    let receiptImageData: string | null = null;
    let receiptSource: "FISIK" | "DIGITAL" | null = null;
    let aiScanResult: ProductRequestAIResult | null = null;
    let batchTitle: string | null = null;
    let batchNote: string | null = null;
    let supplierName: string | null = null;
    let totalEstimatedCost = 0;

    for (const entry of sorted) {
      if (!receiptImageData && entry.env.receiptImageData) {
        receiptImageData = entry.env.receiptImageData;
      }
      if (!receiptSource && entry.env.receiptSource) {
        receiptSource = entry.env.receiptSource;
      }
      if (!aiScanResult && entry.env.aiScanResult) {
        aiScanResult = entry.env.aiScanResult;
      }
      if (!batchTitle && entry.env.batchTitle) {
        batchTitle = entry.env.batchTitle;
      }
      if (!batchNote && entry.env.batchNote) {
        batchNote = entry.env.batchNote;
      }
      if (!supplierName && entry.env.supplierName) {
        supplierName = entry.env.supplierName;
      }
      totalEstimatedCost += computeRequestItemEstimatedCost({
        stockMethod: entry.row.stockMethod,
        costPrice: entry.row.costPrice,
        initialStock: entry.env.initialStock,
      });
    }

    const pendingCount = items.filter((i) => i.status === "MENUNGGU_PERSETUJUAN").length;
    const approvedCount = items.filter((i) => i.status === "DISETUJUI").length;
    const rejectedCount = items.filter((i) => i.status === "DITOLAK").length;

    let status: GroupedProductRequestBatch<T>["status"] = "MENUNGGU_PERSETUJUAN";
    if (pendingCount === items.length) {
      status = "MENUNGGU_PERSETUJUAN";
    } else if (approvedCount === items.length) {
      status = "DISETUJUI";
    } else if (rejectedCount === items.length) {
      status = "DITOLAK";
    } else {
      status = "SEBAGIAN";
    }

    const defaultTitle =
      items.length === 1
        ? lead.row.name
        : `Paket ${items.length} Pengajuan Barang`;

    batches.push({
      batchId,
      leadRequestId: lead.row.id,
      batchTitle: batchTitle || defaultTitle,
      batchNote,
      supplierName,
      receiptImageData,
      receiptSource,
      aiScanResult,
      status,
      pendingCount,
      approvedCount,
      rejectedCount,
      totalEstimatedCost,
      createdAt: lead.row.createdAt,
      requestedBy: lead.row.requestedBy,
      items,
    });
  }

  return batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

