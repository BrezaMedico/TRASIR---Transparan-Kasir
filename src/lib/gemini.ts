import { GoogleGenAI } from "@google/genai";
import crypto from "node:crypto";

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
        const interaction = await ai.interactions.create(
          {
            model,
            store: false,
            input: [
              { type: "text", text: promptText },
              { type: "image", data: base64Data, mime_type: mimeType },
            ],
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
