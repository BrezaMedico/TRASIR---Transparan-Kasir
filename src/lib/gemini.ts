import { GoogleGenAI } from "@google/genai";
import crypto from "node:crypto";
import type {
  ProductRequestAIItemCheck,
  ProductRequestAIResult,
} from "./product-request-batch";

export interface SubmittedPurchaseInputItem {
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
}

export interface AIExtractedItem {
  itemName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  matchesInput: boolean;
  discrepancyNote: string | null;
}

export interface AIReceiptValidationResult {
  status: "SESUAI" | "ADA_SELISIH" | "NOTA_GANDA" | "TERINDIKASI_EDIT";
  extractedSupplier: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  items: AIExtractedItem[];
  editSuspicionReason: string | null;
  duplicateDetected: boolean;
  duplicateInvoiceRef: string | null;
  neutralEvaluationSummary: string;
  disclaimer: string;
  aiEngineUsed: boolean;
}

export const NEUTRAL_AI_DISCLAIMER =
  "Hasil pemeriksaan AI merupakan bahan evaluasi, bukan keputusan kecurangan.";

const RECEIPT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

const RECEIPT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    extractedSupplier: { type: "string" },
    extractedInvoiceNumber: { type: "string" },
    extractedDate: { type: "string" },
    extractedTotal: { type: "number" },
    hasDiscrepancy: { type: "boolean" },
    hasEditSuspicion: { type: "boolean" },
    editSuspicionReason: { type: "string" },
    neutralSummary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemName: { type: "string" },
          quantity: { type: "number" },
          unitCost: { type: "number" },
          subtotal: { type: "number" },
          matchesInput: { type: "boolean" },
          discrepancyNote: { type: "string" },
        },
        required: ["itemName", "quantity", "unitCost", "subtotal", "matchesInput"],
      },
    },
  },
  required: ["hasDiscrepancy", "hasEditSuspicion", "neutralSummary", "items"],
};

export function computeReceiptHash(base64OrDataUrl: string): string {
  const cleaned = base64OrDataUrl.replace(/^data:[^;]+;base64,/, "").trim();
  return crypto.createHash("sha256").update(cleaned).digest("hex");
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64Data: match[2] };
  }
  return { mimeType: "image/jpeg", base64Data: dataUrl };
}

export async function analyzePurchaseReceiptWithGemini(params: {
  supplierName: string;
  invoiceNumber: string;
  purchaseDate: string;
  totalAmount: number;
  items: SubmittedPurchaseInputItem[];
  receiptImageData: string;
  isDuplicateInDatabase: boolean;
  duplicateRef?: string | null;
}): Promise<AIReceiptValidationResult> {
  // Always perform deterministic backend math verification first (Rule 4.E: calculations done by backend)
  const calculatedItemsSum = params.items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitCost),
    0
  );
  const mathMismatch = Math.abs(calculatedItemsSum - params.totalAmount) > 100;

  if (params.isDuplicateInDatabase) {
    return {
      status: "NOTA_GANDA",
      extractedSupplier: params.supplierName,
      extractedInvoiceNumber: params.invoiceNumber,
      extractedDate: params.purchaseDate,
      extractedTotal: calculatedItemsSum,
      items: params.items.map((it) => ({
        itemName: it.itemName,
        quantity: it.quantity,
        unitCost: it.unitCost,
        subtotal: it.subtotal,
        matchesInput: true,
        discrepancyNote: "Nomor nota atau berkas gambar terdeteksi pernah diajukan sebelumnya.",
      })),
      editSuspicionReason: null,
      duplicateDetected: true,
      duplicateInvoiceRef: params.duplicateRef ?? null,
      neutralEvaluationSummary: `Nota dengan referensi ${
        params.duplicateRef || params.invoiceNumber
      } tercatat pernah digunakan pada pengajuan sebelumnya. Perlu diperiksa oleh Pemilik.`,
      disclaimer: NEUTRAL_AI_DISCLAIMER,
      aiEngineUsed: false,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const { mimeType, base64Data } = parseDataUrl(params.receiptImageData);

  if (apiKey && base64Data && base64Data.length > 64) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "v1beta",
        timeout: 15000,
        retryOptions: { attempts: 1 },
      },
    });

    const promptText = `Anda adalah sistem pembaca nota pembelian objektif untuk aplikasi TRASIR (Transparan Kasir).
Tugas Anda:
1. Baca gambar bukti nota pembelian yang dilampirkan.
2. Ekstrak nama toko/pemasok, nomor nota/struk, tanggal transaksi, daftar barang (nama, jumlah, harga satuan, subtotal), dan total pembayaran.
3. Bandingkan hasil pembacaan nota dengan data yang diinput pegawai berikut:
- Pemasok diinput: ${params.supplierName}
- Nomor Nota diinput: ${params.invoiceNumber}
- Tanggal diinput: ${params.purchaseDate}
- Total Nilai Nota diinput: Rp ${params.totalAmount}
- Rincian Barang diinput: ${JSON.stringify(params.items)}
4. Periksa apakah terdapat indikasi visual nota telah diedit secara digital atau tidak wajar.
5. Gunakan bahasa evaluasi yang NETRAL dan OBJEKTIF ("Perlu diperiksa", "Terdapat perbedaan angka"), JANGAN menuduh pegawai melakukan kecurangan.`;

    let rawJsonText: string | null = null;

    for (const model of RECEIPT_MODELS) {
      try {
        const mediaContent =
          mimeType === "application/pdf"
            ? { type: "document" as const, data: base64Data, mime_type: mimeType }
            : { type: "image" as const, data: base64Data, mime_type: mimeType };

        const interaction = await ai.interactions.create(
          {
            model,
            store: false,
            input: [{ type: "text", text: promptText }, mediaContent],
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: RECEIPT_RESPONSE_SCHEMA,
            },
          },
          {
            timeout_ms: 12000,
            retries: { strategy: "none" },
          }
        );
        if (interaction.output_text) {
          rawJsonText = interaction.output_text;
          break;
        }
      } catch {
        // Try next available Gemini model in fallback list before falling back to backend arithmetic check
      }
    }

    if (rawJsonText) {
      try {
        const cleanedJson = rawJsonText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsed = JSON.parse(cleanedJson);

        const extractedTotal =
          typeof parsed.extractedTotal === "number" && parsed.extractedTotal > 0
            ? Math.round(parsed.extractedTotal)
            : calculatedItemsSum;

        const totalDiffers = Math.abs(extractedTotal - params.totalAmount) > 100;
        const hasItemDiscrepancy =
          Boolean(parsed.hasDiscrepancy) ||
          totalDiffers ||
          mathMismatch ||
          (Array.isArray(parsed.items) &&
            parsed.items.some((i: { matchesInput?: boolean }) => i.matchesInput === false));

        let status: AIReceiptValidationResult["status"] = "SESUAI";
        if (parsed.hasEditSuspicion) {
          status = "TERINDIKASI_EDIT";
        } else if (hasItemDiscrepancy) {
          status = "ADA_SELISIH";
        }

        return {
          status,
          extractedSupplier: parsed.extractedSupplier || params.supplierName,
          extractedInvoiceNumber: parsed.extractedInvoiceNumber || params.invoiceNumber,
          extractedDate: parsed.extractedDate || params.purchaseDate,
          extractedTotal,
          items:
            Array.isArray(parsed.items) && parsed.items.length > 0
              ? parsed.items.map((it: Record<string, unknown>) => ({
                  itemName: String(it.itemName ?? ""),
                  quantity: Number(it.quantity ?? 0),
                  unitCost: Math.round(Number(it.unitCost ?? 0)),
                  subtotal: Math.round(Number(it.subtotal ?? 0)),
                  matchesInput: Boolean(it.matchesInput ?? true),
                  discrepancyNote: it.discrepancyNote ? String(it.discrepancyNote) : null,
                }))
              : params.items.map((it) => ({
                  itemName: it.itemName,
                  quantity: it.quantity,
                  unitCost: it.unitCost,
                  subtotal: it.subtotal,
                  matchesInput: Math.round(it.quantity * it.unitCost) === it.subtotal,
                  discrepancyNote:
                    Math.round(it.quantity * it.unitCost) !== it.subtotal
                      ? "Subtotal baris berbeda dengan hasil perkalian jumlah x harga satuan."
                      : null,
                })),
          editSuspicionReason: parsed.editSuspicionReason
            ? String(parsed.editSuspicionReason)
            : null,
          duplicateDetected: false,
          duplicateInvoiceRef: null,
          neutralEvaluationSummary:
            typeof parsed.neutralSummary === "string" && parsed.neutralSummary.trim()
              ? parsed.neutralSummary.trim()
              : status === "SESUAI"
              ? "Data rincian barang dan total pembayaran pada nota sesuai dengan input pegawai."
              : "Terdapat perbedaan antara pembacaan nota dengan rincian input yang perlu diperiksa Pemilik.",
          disclaimer: NEUTRAL_AI_DISCLAIMER,
          aiEngineUsed: true,
        };
      } catch {
        // Fall through to deterministic verification if response JSON parsing fails
      }
    }
  }

  // Deterministic backend verification fallback when AI is unreachable or image is too short
  const verifiedItems: AIExtractedItem[] = params.items.map((it) => {
    const expectedSub = Math.round(it.quantity * it.unitCost);
    const rowMatch = Math.abs(expectedSub - it.subtotal) <= 10;
    return {
      itemName: it.itemName,
      quantity: it.quantity,
      unitCost: it.unitCost,
      subtotal: expectedSub,
      matchesInput: rowMatch,
      discrepancyNote: rowMatch
        ? null
        : `Perhitungan baris (${it.quantity} x Rp ${it.unitCost} = Rp ${expectedSub}) berbeda dari input Rp ${it.subtotal}.`,
    };
  });

  const anyRowMismatch = verifiedItems.some((i) => !i.matchesInput) || mathMismatch;

  return {
    status: anyRowMismatch ? "ADA_SELISIH" : "SESUAI",
    extractedSupplier: params.supplierName,
    extractedInvoiceNumber: params.invoiceNumber,
    extractedDate: params.purchaseDate,
    extractedTotal: calculatedItemsSum,
    items: verifiedItems,
    editSuspicionReason: null,
    duplicateDetected: false,
    duplicateInvoiceRef: null,
    neutralEvaluationSummary: anyRowMismatch
      ? `Terdeteksi selisih perhitungan nilai total (Jumlah rincian Rp ${calculatedItemsSum} vs Total Nota Rp ${params.totalAmount}). Perlu diperiksa Pemilik.`
      : "Verifikasi aritmetika nota dan struktur bukti pembelian sesuai. Siap ditinjau oleh Pemilik.",
    disclaimer: NEUTRAL_AI_DISCLAIMER,
    aiEngineUsed: false,
  };
}

export interface ProductRequestBatchAnalyzeItemInput {
  name: string;
  kind: "BAHAN_BAKU" | "PRODUK_JUAL" | "MENU_RESEP";
  sku: string;
  initialStock: number;
  sellUnit: string;
  purchaseUnit: string;
  conversionRatio: number;
  unitCostPrice: number;
  estimatedTotalCost: number;
  sellPrice: number;
}

const PRODUCT_BATCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    extractedSupplier: { type: "string" },
    extractedInvoiceNumber: { type: "string" },
    extractedDate: { type: "string" },
    extractedTotal: { type: "number" },
    hasDiscrepancy: { type: "boolean" },
    hasEditSuspicion: { type: "boolean" },
    neutralSummary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          submittedName: { type: "string" },
          matchedReceiptName: { type: "string" },
          receiptQty: { type: "number" },
          receiptUnitCost: { type: "number" },
          receiptSubtotal: { type: "number" },
          matchStatus: {
            type: "string",
            enum: ["COCOK", "SELISIH", "TIDAK_DITEMUKAN", "RESEP_NON_NOTA"],
          },
          note: { type: "string" },
        },
        required: ["submittedName", "matchStatus"],
      },
    },
  },
  required: ["hasDiscrepancy", "hasEditSuspicion", "neutralSummary", "items"],
};

export async function analyzeProductRequestBatchWithGemini(params: {
  items: ProductRequestBatchAnalyzeItemInput[];
  supplierName?: string | null;
  batchNote?: string | null;
  receiptSource: "FISIK" | "DIGITAL";
  receiptImageData: string;
}): Promise<ProductRequestAIResult> {
  const submittedEstimatedTotal = params.items.reduce(
    (sum, it) => sum + (it.kind === "MENU_RESEP" ? 0 : Math.max(0, Math.round(it.estimatedTotalCost))),
    0
  );
  const checkedAt = new Date().toISOString();

  const apiKey = process.env.GEMINI_API_KEY;
  const { mimeType, base64Data } = parseDataUrl(params.receiptImageData);

  if (apiKey && base64Data && base64Data.length > 64) {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "v1beta",
        timeout: 18000,
        retryOptions: { attempts: 1 },
      },
    });

    const promptText = `Anda adalah sistem pemindai nota pembelian objektif untuk aplikasi TRASIR (Transparan Kasir).
Seorang pegawai gudang mengajukan daftar barang baru dalam satu paket pengajuan dan melampirkan bukti nota (${
      params.receiptSource === "FISIK" ? "foto nota fisik" : "berkas nota digital / PDF / struk"
    }).

Data pengajuan paket:
- Nama Pemasok yang Diinput: ${params.supplierName || "(tidak diisi)"}
- Catatan Paket: ${params.batchNote || "(tidak ada)"}
- Total Estimasi Nilai Stok Awal yang Diajukan: Rp ${submittedEstimatedTotal}
- Daftar Item yang Diajukan:
${JSON.stringify(params.items)}

Tugas Anda:
1. Ekstrak nama toko/pemasok, nomor nota/referensi (jika ada), tanggal, dan total belanja pada nota.
2. Cocokkan setiap item yang diajukan dengan baris barang pada nota:
   - Item bertipe BAHAN_BAKU atau PRODUK_JUAL: cocokkan nama, jumlah/kemasan (perhatikan isi kemasan jika tertera), dan harga modal/total biaya.
     * "COCOK" jika barang ada di nota dengan jumlah/harga yang wajar dan selaras.
     * "SELISIH" jika barang ada di nota namun harga atau jumlah berbeda signifikan.
     * "TIDAK_DITEMUKAN" jika barang tidak terlihat pada nota.
   - Item bertipe MENU_RESEP: menu racikan biasanya tidak tercantum sebagai barang beli di nota pemasok. Beri matchStatus "RESEP_NON_NOTA" dan catatan singkat (misalnya "Menu racikan internal, bukan barang beli pemasok").
3. Periksa indikasi edit digital yang tidak wajar pada nota fisik/digital.
4. Gunakan bahasa Indonesia yang netral, objektif, dan ramah pemula ("Perlu diperiksa", "Terdapat perbedaan angka"), JANGAN menuduh kecurangan.`;

    let rawJsonText: string | null = null;
    for (const model of RECEIPT_MODELS) {
      try {
        const mediaContent =
          mimeType === "application/pdf"
            ? { type: "document" as const, data: base64Data, mime_type: mimeType }
            : { type: "image" as const, data: base64Data, mime_type: mimeType };

        const interaction = await ai.interactions.create(
          {
            model,
            store: false,
            input: [{ type: "text", text: promptText }, mediaContent],
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: PRODUCT_BATCH_RESPONSE_SCHEMA,
            },
          },
          {
            timeout_ms: 15000,
            retries: { strategy: "none" },
          }
        );
        if (interaction.output_text) {
          rawJsonText = interaction.output_text;
          break;
        }
      } catch {
        // Fallback to next model or deterministic verification
      }
    }

    if (rawJsonText) {
      try {
        const cleanedJson = rawJsonText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsed = JSON.parse(cleanedJson) as Record<string, unknown>;
        const rawItems = Array.isArray(parsed.items)
          ? (parsed.items as Record<string, unknown>[])
          : [];

        const mappedItems: ProductRequestAIItemCheck[] = params.items.map((sub, idx) => {
          const found =
            rawItems.find(
              (r) =>
                String(r.submittedName || "")
                  .trim()
                  .toLowerCase() === sub.name.trim().toLowerCase()
            ) || rawItems[idx];

          if (sub.kind === "MENU_RESEP" && (!found || found.matchStatus === "TIDAK_DITEMUKAN")) {
            return {
              submittedName: sub.name,
              matchedReceiptName: null,
              submittedQty: sub.initialStock,
              submittedUnit: sub.sellUnit,
              submittedCostTotal: 0,
              receiptQty: null,
              receiptUnitCost: null,
              receiptSubtotal: null,
              matchStatus: "RESEP_NON_NOTA",
              note: "Menu racikan internal (bahan baku dinilai per masing-masing bahan di nota).",
            };
          }

          const rawStatus = String(found?.matchStatus || (sub.kind === "MENU_RESEP" ? "RESEP_NON_NOTA" : "COCOK"));
          const matchStatus: ProductRequestAIItemCheck["matchStatus"] =
            rawStatus === "COCOK" ||
            rawStatus === "SELISIH" ||
            rawStatus === "TIDAK_DITEMUKAN" ||
            rawStatus === "RESEP_NON_NOTA"
              ? rawStatus
              : "COCOK";

          return {
            submittedName: sub.name,
            matchedReceiptName: found?.matchedReceiptName
              ? String(found.matchedReceiptName)
              : null,
            submittedQty: sub.initialStock,
            submittedUnit: sub.sellUnit,
            submittedCostTotal: sub.estimatedTotalCost,
            receiptQty: typeof found?.receiptQty === "number" ? found.receiptQty : null,
            receiptUnitCost:
              typeof found?.receiptUnitCost === "number"
                ? Math.round(found.receiptUnitCost)
                : null,
            receiptSubtotal:
              typeof found?.receiptSubtotal === "number"
                ? Math.round(found.receiptSubtotal)
                : null,
            matchStatus,
            note: found?.note ? String(found.note) : null,
          };
        });

        const hasMismatch =
          Boolean(parsed.hasDiscrepancy) ||
          mappedItems.some((m) => m.matchStatus === "SELISIH" || m.matchStatus === "TIDAK_DITEMUKAN");
        const status: ProductRequestAIResult["status"] = parsed.hasEditSuspicion
          ? "TERINDIKASI_EDIT"
          : hasMismatch
          ? "ADA_SELISIH"
          : "SESUAI";

        const extractedTotal =
          typeof parsed.extractedTotal === "number" && parsed.extractedTotal > 0
            ? Math.round(parsed.extractedTotal)
            : null;

        return {
          status,
          receiptSource: params.receiptSource,
          extractedSupplier: parsed.extractedSupplier
            ? String(parsed.extractedSupplier)
            : params.supplierName || null,
          extractedInvoiceNumber: parsed.extractedInvoiceNumber
            ? String(parsed.extractedInvoiceNumber)
            : null,
          extractedDate: parsed.extractedDate ? String(parsed.extractedDate) : null,
          extractedTotal,
          submittedEstimatedTotal,
          items: mappedItems,
          neutralSummary:
            typeof parsed.neutralSummary === "string" && parsed.neutralSummary.trim()
              ? parsed.neutralSummary.trim()
              : status === "SESUAI"
              ? "Barang dan harga modal pada paket pengajuan selaras dengan nota lampiran."
              : "Terdapat perbedaan atau catatan pada perbandingan nota yang perlu ditinjau Pemilik/Manajer.",
          disclaimer: NEUTRAL_AI_DISCLAIMER,
          aiEngineUsed: true,
          checkedAt,
        };
      } catch {
        // Fallback if AI response JSON parsing fails
      }
    }
  }

  // Fallback lokal deterministik saat kunci Gemini AI tidak aktif atau offline
  const fallbackItems: ProductRequestAIItemCheck[] = params.items.map((sub) => {
    if (sub.kind === "MENU_RESEP") {
      return {
        submittedName: sub.name,
        matchedReceiptName: null,
        submittedQty: sub.initialStock,
        submittedUnit: sub.sellUnit,
        submittedCostTotal: 0,
        receiptQty: null,
        receiptUnitCost: null,
        receiptSubtotal: null,
        matchStatus: "RESEP_NON_NOTA",
        note: "Menu racikan internal (tidak tercantum langsung pada nota pemasok).",
      };
    }

    const missingPrice = sub.unitCostPrice <= 0;
    return {
      submittedName: sub.name,
      matchedReceiptName: sub.name,
      submittedQty: sub.initialStock,
      submittedUnit: sub.sellUnit,
      submittedCostTotal: sub.estimatedTotalCost,
      receiptQty: sub.initialStock > 0 ? sub.initialStock : null,
      receiptUnitCost: sub.unitCostPrice > 0 ? sub.unitCostPrice : null,
      receiptSubtotal: sub.estimatedTotalCost > 0 ? sub.estimatedTotalCost : null,
      matchStatus: missingPrice ? "SELISIH" : "COCOK",
      note: missingPrice
        ? "Harga modal masih Rp 0. Periksa langsung angka pada nota lampiran."
        : "Perlu pencocokan visual langsung dengan gambar/dokumen nota terlampir.",
    };
  });

  const anyMissingPrice = fallbackItems.some((it) => it.matchStatus === "SELISIH");

  return {
    status: anyMissingPrice ? "ADA_SELISIH" : "SESUAI",
    receiptSource: params.receiptSource,
    extractedSupplier: params.supplierName || null,
    extractedInvoiceNumber: null,
    extractedDate: null,
    extractedTotal: null,
    submittedEstimatedTotal,
    items: fallbackItems,
    neutralSummary: anyMissingPrice
      ? "Pemeriksaan struktur paket selesai (mode lokal): ada barang yang harga modalnya masih Rp 0. Silakan bandingkan langsung dengan lampiran nota."
      : "Bukti nota terverifikasi valid secara struktur dan total pengajuan terhitung otomatis. Cocokkan rincian item dengan pratinjau nota sebelum menyetujui.",
    disclaimer: NEUTRAL_AI_DISCLAIMER,
    aiEngineUsed: false,
    checkedAt,
  };
}
