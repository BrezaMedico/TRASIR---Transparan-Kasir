import { GoogleGenAI, Type, type Schema } from "@google/genai";
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
  matchedReceiptName?: string | null;
  quantity: number;
  unitCost: number;
  subtotal: number;
  submittedQty?: number;
  submittedUnit?: string;
  submittedUnitCost?: number;
  submittedSubtotal?: number;
  matchStatus?: "COCOK" | "SELISIH" | "TIDAK_DITEMUKAN" | "BELUM_DICEK";
  matchesInput: boolean;
  discrepancyNote: string | null;
}

export interface AIReceiptValidationResult {
  status: "SESUAI" | "ADA_SELISIH" | "NOTA_GANDA" | "TERINDIKASI_EDIT" | "GAGAL_CEK";
  isReceiptReadable?: boolean;
  detectedDocumentType?: string | null;
  receiptLines?: string[];
  unmatchedReceiptItems?: string[];
  missingReceiptInfo?: string[];
  extractedSupplier: string | null;
  extractedInvoiceNumber: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  submittedTotal?: number;
  items: AIExtractedItem[];
  editSuspicionReason: string | null;
  duplicateDetected: boolean;
  duplicateInvoiceRef: string | null;
  neutralEvaluationSummary: string;
  disclaimer: string;
  aiEngineUsed: boolean;
  modelUsed?: string | null;
  engineError?: string | null;
  checkedAt?: string;
}

export const NEUTRAL_AI_DISCLAIMER =
  "Hasil pemeriksaan AI merupakan bahan evaluasi, bukan keputusan kecurangan.";

const GEN_CONTENT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite",
] as const;

const INTERACTION_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
] as const;

const COMMON_RECEIPT_REQUIRED = [
  "isReceiptReadable",
  "detectedDocumentType",
  "receiptLines",
  "hasDiscrepancy",
  "hasEditSuspicion",
  "neutralSummary",
  "items",
];

const COMMON_RECEIPT_GEN_PROPERTIES: Record<string, Schema> = {
  isReceiptReadable: { type: Type.BOOLEAN },
  detectedDocumentType: { type: Type.STRING },
  receiptLines: { type: Type.ARRAY, items: { type: Type.STRING } },
  unmatchedReceiptItems: { type: Type.ARRAY, items: { type: Type.STRING } },
  missingReceiptInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
  extractedSupplier: { type: Type.STRING },
  extractedInvoiceNumber: { type: Type.STRING },
  extractedDate: { type: Type.STRING },
  extractedTotal: { type: Type.NUMBER },
  hasDiscrepancy: { type: Type.BOOLEAN },
  hasEditSuspicion: { type: Type.BOOLEAN },
  editSuspicionReason: { type: Type.STRING },
  neutralSummary: { type: Type.STRING },
};

const COMMON_RECEIPT_INTERACTION_PROPERTIES = {
  isReceiptReadable: { type: "boolean" },
  detectedDocumentType: { type: "string" },
  receiptLines: { type: "array", items: { type: "string" } },
  unmatchedReceiptItems: { type: "array", items: { type: "string" } },
  missingReceiptInfo: { type: "array", items: { type: "string" } },
  extractedSupplier: { type: "string" },
  extractedInvoiceNumber: { type: "string" },
  extractedDate: { type: "string" },
  extractedTotal: { type: "number" },
  hasDiscrepancy: { type: "boolean" },
  hasEditSuspicion: { type: "boolean" },
  editSuspicionReason: { type: "string" },
  neutralSummary: { type: "string" },
};

const RECEIPT_ITEM_REQUIRED = [
  "submittedName",
  "itemName",
  "quantity",
  "unitCost",
  "subtotal",
  "matchStatus",
  "matchesInput",
];

const RECEIPT_GEN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ...COMMON_RECEIPT_GEN_PROPERTIES,
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          submittedName: { type: Type.STRING },
          matchedReceiptName: { type: Type.STRING },
          itemName: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unitCost: { type: Type.NUMBER },
          subtotal: { type: Type.NUMBER },
          matchStatus: {
            type: Type.STRING,
            enum: ["COCOK", "SELISIH", "TIDAK_DITEMUKAN"],
          },
          matchesInput: { type: Type.BOOLEAN },
          discrepancyNote: { type: Type.STRING },
        },
        required: RECEIPT_ITEM_REQUIRED,
      },
    },
  },
  required: COMMON_RECEIPT_REQUIRED,
};

const RECEIPT_INTERACTION_SCHEMA = {
  type: "object",
  properties: {
    ...COMMON_RECEIPT_INTERACTION_PROPERTIES,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          submittedName: { type: "string" },
          matchedReceiptName: { type: "string" },
          itemName: { type: "string" },
          quantity: { type: "number" },
          unitCost: { type: "number" },
          subtotal: { type: "number" },
          matchStatus: {
            type: "string",
            enum: ["COCOK", "SELISIH", "TIDAK_DITEMUKAN"],
          },
          matchesInput: { type: "boolean" },
          discrepancyNote: { type: "string" },
        },
        required: RECEIPT_ITEM_REQUIRED,
      },
    },
  },
  required: COMMON_RECEIPT_REQUIRED,
};

const PRODUCT_BATCH_GEN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ...COMMON_RECEIPT_GEN_PROPERTIES,
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          submittedName: { type: Type.STRING },
          matchedReceiptName: { type: Type.STRING },
          receiptQty: { type: Type.NUMBER },
          receiptUnitCost: { type: Type.NUMBER },
          receiptSubtotal: { type: Type.NUMBER },
          matchStatus: {
            type: Type.STRING,
            enum: ["COCOK", "SELISIH", "TIDAK_DITEMUKAN", "RESEP_NON_NOTA"],
          },
          note: { type: Type.STRING },
        },
        required: ["submittedName", "matchStatus"],
      },
    },
  },
  required: COMMON_RECEIPT_REQUIRED,
};

const PRODUCT_BATCH_INTERACTION_SCHEMA = {
  type: "object",
  properties: {
    ...COMMON_RECEIPT_INTERACTION_PROPERTIES,
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
  required: COMMON_RECEIPT_REQUIRED,
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

function sanitizeText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u2014/g, ", ")
    .trim();
}

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => sanitizeText(item))
    .filter((item) => item.length > 0);
}

function formatErrorReason(err: unknown): string {
  if (!err) return "Layanan AI Gemini sedang tidak merespons.";
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("503") || msg.toLowerCase().includes("high demand")) {
    return "Server Gemini AI sedang padat sementara. Tekan Cek Ulang beberapa saat lagi.";
  }
  if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
    return "Batas pemakaian sementara API Gemini tercapai. Tunggu sebentar lalu coba lagi.";
  }
  if (msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key")) {
    return "Kunci API Gemini tidak valid atau belum memiliki akses.";
  }
  if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("deadline")) {
    return "Waktu koneksi ke Gemini AI habis. Silakan coba tekan Cek Ulang.";
  }
  return "Layanan Gemini AI sedang tidak terjangkau. Silakan coba lagi beberapa saat lagi.";
}

function parseJsonText(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as Record<string, unknown>;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms (${label})`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGeminiVisionJson(params: {
  apiKey: string;
  promptText: string;
  mimeType: string;
  base64Data: string;
  genSchema: Schema;
  interactionSchema: Record<string, unknown>;
}): Promise<{
  parsed: Record<string, unknown> | null;
  modelUsed: string | null;
  errorMessage: string | null;
}> {
  const ai = new GoogleGenAI({
    apiKey: params.apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      timeout: 22000,
      retryOptions: { attempts: 1 },
    },
  });

  let lastErr: unknown = null;

  // Pass 1: models.generateContent (tercepat & paling stabil untuk vision + JSON schema)
  for (const model of GEN_CONTENT_MODELS) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [
            { inlineData: { mimeType: params.mimeType, data: params.base64Data } },
            params.promptText,
          ],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: params.genSchema,
          },
        }),
        18000,
        model
      );
      if (res.text) {
        const parsed = parseJsonText(res.text);
        return { parsed, modelUsed: model, errorMessage: null };
      }
    } catch (err) {
      lastErr = err;
      const errText = err instanceof Error ? err.message : String(err);
      if (errText.includes("503")) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  // Pass 2: interactions.create sebagai cadangan (khususnya jika ada dokumen PDF tertentu)
  const mediaContent =
    params.mimeType === "application/pdf"
      ? { type: "document" as const, data: params.base64Data, mime_type: params.mimeType }
      : { type: "image" as const, data: params.base64Data, mime_type: params.mimeType };

  for (const model of INTERACTION_FALLBACK_MODELS) {
    try {
      const interaction = await ai.interactions.create(
        {
          model,
          store: false,
          input: [{ type: "text", text: params.promptText }, mediaContent],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: params.interactionSchema,
          },
        },
        {
          timeout_ms: 15000,
          retries: { strategy: "none" },
        }
      );
      if (interaction.output_text) {
        const parsed = parseJsonText(interaction.output_text);
        return { parsed, modelUsed: model, errorMessage: null };
      }
    } catch (err) {
      lastErr = err;
    }
  }

  return {
    parsed: null,
    modelUsed: null,
    errorMessage: formatErrorReason(lastErr),
  };
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
  const checkedAt = new Date().toISOString();
  const calculatedItemsSum = params.items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitCost),
    0
  );
  const mathMismatch = Math.abs(calculatedItemsSum - params.totalAmount) > 100;

  if (params.isDuplicateInDatabase) {
    return {
      status: "NOTA_GANDA",
      isReceiptReadable: true,
      detectedDocumentType: "Nota Belanja",
      receiptLines: [],
      unmatchedReceiptItems: [],
      missingReceiptInfo: [],
      extractedSupplier: params.supplierName,
      extractedInvoiceNumber: params.invoiceNumber,
      extractedDate: params.purchaseDate,
      extractedTotal: calculatedItemsSum,
      submittedTotal: params.totalAmount,
      items: params.items.map((it) => ({
        itemName: it.itemName,
        matchedReceiptName: it.itemName,
        quantity: it.quantity,
        unitCost: it.unitCost,
        subtotal: it.subtotal,
        submittedQty: it.quantity,
        submittedUnit: it.unit,
        submittedUnitCost: it.unitCost,
        submittedSubtotal: it.subtotal,
        matchStatus: "COCOK",
        matchesInput: true,
        discrepancyNote: "Nomor nota atau foto nota ini pernah dipakai pada pengajuan sebelumnya.",
      })),
      editSuspicionReason: null,
      duplicateDetected: true,
      duplicateInvoiceRef: params.duplicateRef ?? null,
      neutralEvaluationSummary: `Nota dengan referensi ${
        params.duplicateRef || params.invoiceNumber
      } tercatat pernah dipakai sebelumnya. Mohon periksa kembali agar tidak tercatat dua kali.`,
      disclaimer: NEUTRAL_AI_DISCLAIMER,
      aiEngineUsed: false,
      modelUsed: null,
      engineError: null,
      checkedAt,
    };
  }

  const useOfflineStub = process.env.GEMINI_MODE === "offline_stub";
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const { mimeType, base64Data } = parseDataUrl(params.receiptImageData);
  let lastErrorMsg: string | null = null;

  if (!useOfflineStub && apiKey && base64Data && base64Data.length > 64) {
    const promptText = `Anda adalah asisten pemeriksa nota belanja toko di Indonesia untuk pemilik toko (orang awam).
Ikuti langkah ini dengan teliti dan adil:

LANGKAH 1 (Cek Keaslian & Keterbacaan Gambar):
- Periksa apakah gambar atau PDF ini benar-benar nota, struk kasir, kuitansi, atau faktur pembelian yang tulisannya terbaca.
- Isi detectedDocumentType dengan jenis dokumen yang terlihat (misalnya: "Nota Belanja", "Struk Kasir", "Nota Tulis Tangan", "Faktur Pembelian", "CV / Daftar Riwayat Hidup", "Poster / Twibbon", atau "Foto Buram").
- Jika ini BUKAN nota belanja atau tulisannya sama sekali tidak terbaca, set isReceiptReadable = false, receiptLines = [], missingReceiptInfo = [], hasDiscrepancy = true, jelaskan dokumen apa yang sebenarnya ada di gambar dalam Bahasa Indonesia sederhana pada neutralSummary, dan tandai semua item sebagai TIDAK_DITEMUKAN.

LANGKAH 2 (Baca Semua Baris Nota Terlebih Dahulu):
- Jika ini nota belanja yang terbaca, salin setiap baris yang tertulis pada nota ke array receiptLines (contoh: "Gula 90.000", "TOTAL 90.000").
- Ekstrak HANYA yang benar-benar tertulis pada gambar: nama toko (extractedSupplier), nomor nota (extractedInvoiceNumber), tanggal (extractedDate), dan total akhir pembayaran (extractedTotal). Jika tidak tertulis pada nota, biarkan string kosong "" atau angka 0, JANGAN menyalin dari input pegawai.

LANGKAH 3 (Cocokkan dengan Data yang Diinput Pegawai):
- Toko diinput: ${params.supplierName}
- Nomor Nota diinput: ${params.invoiceNumber}
- Tanggal diinput: ${params.purchaseDate}
- Total Nilai diinput: Rp ${params.totalAmount}
- Daftar Barang diinput pegawai:
${JSON.stringify(params.items)}

PRINSIP ADIL UNTUK NOTA TIDAK LENGKAP (SANGAT PENTING):
- Nota belanja warung, pasar, atau tulis tangan di Indonesia sering kali sangat ringkas dan TIDAK selengkap form input pegawai.
- JANGAN menyalahkan atau menandai SELISIH / TIDAK_DITEMUKAN / hasDiscrepancy = true hanya karena keterangan berikut tidak tertulis di nota:
  1. Nama toko/pemasok, nomor nota, atau tanggal tidak tertulis di nota.
  2. Merek, varian, satuan berat/isi kemasan (gram, ml, kg, liter) tidak ditulis di nota (contoh: nota hanya menulis "Gula 5 = 90.000" atau "Gula 90rb", sedangkan input "Gula Pasir 5 kemasan isi 1000g @ 18.000 = 90.000") -> anggap COCOK.
  3. Harga satuan atau jumlah tidak dirinci per item, tetapi subtotal item di nota cocok dengan subtotal input (toleransi pembulatan <= Rp 500) -> anggap COCOK.
  4. Nota hanya menuliskan daftar nama barang + total akhir belanja (atau kuitansi total ringkas tanpa rincian barang per baris), dan total akhir di nota cocok dengan total input pegawai (toleransi <= Rp 500) -> anggap COCOK, lalu tulis catatan netral bahwa nota tidak merinci per item tetapi totalnya cocok.
  5. Singkatan atau penulisan nama barang yang lebih pendek (contoh: GULPAS = Gula Pasir, Gula = Gula Pasir, MYK GRG = Minyak Goreng, Susu = Susu Ultra Milk, bks = bungkus, btl = botol, krt/dus = karton/dus).
  6. Pembulatan wajar <= Rp 500.
- Catat keterangan yang memang tidak tertulis di nota secara objektif pada array missingReceiptInfo (contoh: "Nama toko tidak tertulis di nota", "Harga satuan tidak dirinci di nota, hanya tertulis subtotal"). Isi [] jika nota sudah lengkap.

KAPAN HARUS MENANDAI BERBEDA (hasDiscrepancy = true / SELISIH / TIDAK_DITEMUKAN):
- Tandai SELISIH / TIDAK_DITEMUKAN HANYA jika informasi yang TERTULIS di nota BENAR-BENAR BERTENTANGAN dengan input pegawai:
  1. Jumlah yang tertulis di nota jelas berbeda dari jumlah input (contoh: nota tertulis 2, input 3).
  2. Harga satuan atau subtotal yang tertulis di nota jelas berbeda (> Rp 500) dari input (contoh: nota tertulis Rp 18.000, input Rp 22.000; subtotal nota Rp 70.000, input Rp 105.000).
  3. Total akhir yang tertulis di nota jelas berbeda (> Rp 500) dari total input pegawai.
  4. Nota menampilkan daftar barang yang rinci dan lengkap, tetapi barang yang diinput pegawai memang tidak ada sama sekali di daftar itu atau barangnya jelas berbeda.
  5. Lampiran bukan nota belanja atau ada indikasi editan digital yang mencolok (set hasEditSuspicion dan editSuspicionReason).

Format setiap item output:
- submittedName: sama persis dengan nama barang input pegawai
- matchedReceiptName: nama barang yang tertulis pada nota (atau "" jika nota hanya tulis total keseluruhan)
- quantity, unitCost, subtotal: isi angka yang TERTULIS PADA NOTA (isi 0 jika komponen itu tidak tertulis di nota; JANGAN menyalin angka input pegawai bila di nota tidak tertulis)
- matchStatus: "COCOK", "SELISIH", atau "TIDAK_DITEMUKAN"
- matchesInput: true hanya jika matchStatus === "COCOK"
- discrepancyNote: jika COCOK namun nota tidak merinci jumlah/harga satuan, beri catatan singkat yang netral dan tidak menyalahkan (atau null jika sudah persis). Jika SELISIH, sebutkan perbandingan angka input vs nota secara jelas.
- Jika ada barang lain di nota yang tidak diinput pegawai, tulis di unmatchedReceiptItems.
- Gunakan Bahasa Indonesia sehari-hari yang ramah, objektif, dan tidak menyalahkan (tanpa istilah teknis dan tanpa tanda pisah panjang em dash).`;

    const callResult = await callGeminiVisionJson({
      apiKey,
      promptText,
      mimeType,
      base64Data,
      genSchema: RECEIPT_GEN_SCHEMA,
      interactionSchema: RECEIPT_INTERACTION_SCHEMA,
    });

    lastErrorMsg = callResult.errorMessage;

    if (callResult.parsed) {
      const parsed = callResult.parsed;
      const isReadable = parsed.isReceiptReadable !== false;
      const detectedDoc = sanitizeText(parsed.detectedDocumentType) || (isReadable ? "Nota Belanja" : "Bukan Nota");
      const receiptLines = sanitizeStringList(parsed.receiptLines);
      const unmatchedReceiptItems = sanitizeStringList(parsed.unmatchedReceiptItems);
      const missingReceiptInfo = isReadable ? sanitizeStringList(parsed.missingReceiptInfo) : [];

      const extractedTotal =
        isReadable && typeof parsed.extractedTotal === "number" && parsed.extractedTotal > 0
          ? Math.round(parsed.extractedTotal)
          : null;

      const rawAiItems = Array.isArray(parsed.items)
        ? (parsed.items as Record<string, unknown>[])
        : [];

      const mappedItems: AIExtractedItem[] = params.items.map((sub, idx) => {
        const found =
          rawAiItems.find(
            (r) =>
              String(r.submittedName || r.itemName || "")
                .trim()
                .toLowerCase() === sub.itemName.trim().toLowerCase()
          ) || rawAiItems[idx];

        const rawStatus = String(
          found?.matchStatus || (found?.matchesInput === false ? "SELISIH" : "COCOK")
        );
        const matchStatus: "COCOK" | "SELISIH" | "TIDAK_DITEMUKAN" = !isReadable
          ? "TIDAK_DITEMUKAN"
          : rawStatus === "COCOK" || rawStatus === "SELISIH" || rawStatus === "TIDAK_DITEMUKAN"
          ? rawStatus
          : "COCOK";

        return {
          itemName: sub.itemName,
          matchedReceiptName: found?.matchedReceiptName
            ? sanitizeText(found.matchedReceiptName) || null
            : found?.itemName
            ? sanitizeText(found.itemName) || null
            : null,
          quantity: isReadable ? Number(found?.quantity ?? 0) : 0,
          unitCost: isReadable ? Math.round(Number(found?.unitCost ?? 0)) : 0,
          subtotal: isReadable ? Math.round(Number(found?.subtotal ?? 0)) : 0,
          submittedQty: sub.quantity,
          submittedUnit: sub.unit,
          submittedUnitCost: sub.unitCost,
          submittedSubtotal: sub.subtotal,
          matchStatus,
          matchesInput: matchStatus === "COCOK",
          discrepancyNote: !isReadable
            ? sanitizeText(found?.discrepancyNote) ||
              `Lampiran terdeteksi sebagai ${detectedDoc}, bukan nota belanja.`
            : found?.discrepancyNote
            ? sanitizeText(found.discrepancyNote)
            : null,
        };
      });

      const anyItemMismatch = mappedItems.some((i) => !i.matchesInput);
      const totalDiffers =
        extractedTotal !== null && Math.abs(extractedTotal - params.totalAmount) > 500;
      const hasItemDiscrepancy = !isReadable || anyItemMismatch || totalDiffers || mathMismatch;

      let status: AIReceiptValidationResult["status"] = "SESUAI";
      if (parsed.hasEditSuspicion) {
        status = "TERINDIKASI_EDIT";
      } else if (hasItemDiscrepancy) {
        status = "ADA_SELISIH";
      }

      const defaultSummary = !isReadable
        ? `Lampiran terdeteksi sebagai ${detectedDoc} dan bukan nota belanja yang bisa dibaca.`
        : status === "SESUAI"
        ? missingReceiptInfo.length > 0
          ? "Data yang tertulis di nota sudah cocok dengan input pegawai. Beberapa detail memang tidak tercantum di nota."
          : "Barang dan total belanja yang diinput pegawai sudah cocok dengan isi nota."
        : "Ada beberapa angka atau barang yang berbeda antara input pegawai dan isi nota.";

      return {
        status,
        isReceiptReadable: isReadable,
        detectedDocumentType: detectedDoc,
        receiptLines,
        unmatchedReceiptItems,
        missingReceiptInfo,
        extractedSupplier: isReadable ? sanitizeText(parsed.extractedSupplier) || null : null,
        extractedInvoiceNumber: isReadable
          ? sanitizeText(parsed.extractedInvoiceNumber) || null
          : null,
        extractedDate: isReadable ? sanitizeText(parsed.extractedDate) || null : null,
        extractedTotal,
        submittedTotal: params.totalAmount,
        items: mappedItems,
        editSuspicionReason: parsed.editSuspicionReason
          ? sanitizeText(parsed.editSuspicionReason)
          : null,
        duplicateDetected: false,
        duplicateInvoiceRef: null,
        neutralEvaluationSummary: sanitizeText(parsed.neutralSummary) || defaultSummary,
        disclaimer: NEUTRAL_AI_DISCLAIMER,
        aiEngineUsed: true,
        modelUsed: callResult.modelUsed,
        engineError: null,
        checkedAt,
      };
    }
  } else if (!useOfflineStub && !apiKey) {
    lastErrorMsg = "Kunci API Gemini belum diisi pada pengaturan server (.env).";
  }

  // Di mode live (default), jika Gemini gagal dihubungi, JANGAN pernah palsukan status "SESUAI"!
  if (!useOfflineStub) {
    return {
      status: "GAGAL_CEK",
      isReceiptReadable: true,
      detectedDocumentType: null,
      receiptLines: [],
      unmatchedReceiptItems: [],
      missingReceiptInfo: [],
      extractedSupplier: null,
      extractedInvoiceNumber: null,
      extractedDate: null,
      extractedTotal: null,
      submittedTotal: params.totalAmount,
      items: params.items.map((it) => ({
        itemName: it.itemName,
        matchedReceiptName: null,
        quantity: 0,
        unitCost: 0,
        subtotal: 0,
        submittedQty: it.quantity,
        submittedUnit: it.unit,
        submittedUnitCost: it.unitCost,
        submittedSubtotal: it.subtotal,
        matchStatus: "BELUM_DICEK",
        matchesInput: false,
        discrepancyNote: "Belum diperiksa AI. Silakan tekan Cek Ulang.",
      })),
      editSuspicionReason: null,
      duplicateDetected: false,
      duplicateInvoiceRef: null,
      neutralEvaluationSummary:
        lastErrorMsg ||
        "AI Gemini belum berhasil terhubung saat ini. Tekan tombol Cek Ulang beberapa saat lagi atau cocokkan langsung dengan foto nota.",
      disclaimer: NEUTRAL_AI_DISCLAIMER,
      aiEngineUsed: false,
      modelUsed: null,
      engineError: lastErrorMsg,
      checkedAt,
    };
  }

  // Fallback deterministik khusus untuk Vitest (agar tes otomatis tetap cepat & deterministik)
  const verifiedItems: AIExtractedItem[] = params.items.map((it) => {
    const expectedSub = Math.round(it.quantity * it.unitCost);
    const rowMatch = Math.abs(expectedSub - it.subtotal) <= 10;
    return {
      itemName: it.itemName,
      matchedReceiptName: null,
      quantity: it.quantity,
      unitCost: it.unitCost,
      subtotal: expectedSub,
      submittedQty: it.quantity,
      submittedUnit: it.unit,
      submittedUnitCost: it.unitCost,
      submittedSubtotal: it.subtotal,
      matchStatus: rowMatch ? "COCOK" : "SELISIH",
      matchesInput: rowMatch,
      discrepancyNote: rowMatch
        ? null
        : `Perhitungan baris (${it.quantity} x Rp ${it.unitCost} = Rp ${expectedSub}) berbeda dari input Rp ${it.subtotal}.`,
    };
  });

  const anyRowMismatch = verifiedItems.some((i) => !i.matchesInput) || mathMismatch;

  return {
    status: anyRowMismatch ? "ADA_SELISIH" : "SESUAI",
    isReceiptReadable: true,
    detectedDocumentType: "Mode Uji Lokal",
    receiptLines: [],
    unmatchedReceiptItems: [],
    missingReceiptInfo: [],
    extractedSupplier: params.supplierName,
    extractedInvoiceNumber: params.invoiceNumber,
    extractedDate: params.purchaseDate,
    extractedTotal: calculatedItemsSum,
    submittedTotal: params.totalAmount,
    items: verifiedItems,
    editSuspicionReason: null,
    duplicateDetected: false,
    duplicateInvoiceRef: null,
    neutralEvaluationSummary: anyRowMismatch
      ? `Terdeteksi selisih hitung total (Rincian Rp ${calculatedItemsSum} vs Total Rp ${params.totalAmount}). Perlu diperiksa.`
      : "Perhitungan daftar barang dan total sudah sesuai (mode uji lokal).",
    disclaimer: NEUTRAL_AI_DISCLAIMER,
    aiEngineUsed: false,
    modelUsed: null,
    engineError: lastErrorMsg,
    checkedAt,
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

export async function analyzeProductRequestBatchWithGemini(params: {
  items: ProductRequestBatchAnalyzeItemInput[];
  supplierName?: string | null;
  batchNote?: string | null;
  receiptSource: "FISIK" | "DIGITAL";
  receiptImageData: string;
}): Promise<ProductRequestAIResult> {
  const submittedEstimatedTotal = params.items.reduce(
    (sum, it) =>
      sum + (it.kind === "MENU_RESEP" ? 0 : Math.max(0, Math.round(it.estimatedTotalCost))),
    0
  );
  const checkedAt = new Date().toISOString();

  // Hitung rincian kemasan yang mudah dicocokkan dengan struk belanja toko Indonesia
  const enrichedInputs = params.items.map((it) => {
    const ratio = it.conversionRatio > 0 ? it.conversionRatio : 1;
    const isPackaged = it.kind !== "MENU_RESEP" && ratio > 1;
    const packCount = isPackaged
      ? Number((it.initialStock / ratio).toFixed(2))
      : it.initialStock;
    const packUnitPrice = isPackaged
      ? Math.round(it.unitCostPrice * ratio)
      : it.unitCostPrice;
    const packSummary =
      it.kind === "MENU_RESEP"
        ? "Menu racikan internal (bukan barang beli di nota)"
        : isPackaged
        ? `${packCount} ${it.purchaseUnit || "kemasan"} x Rp ${packUnitPrice} = Rp ${
            it.estimatedTotalCost
          } (isi ${ratio} ${it.sellUnit}/${it.purchaseUnit || "kemasan"}, total ${
            it.initialStock
          } ${it.sellUnit})`
        : `${it.initialStock} ${it.sellUnit} x Rp ${it.unitCostPrice} = Rp ${it.estimatedTotalCost}`;

    return {
      ...it,
      isPackaged,
      packCount,
      packSize: ratio,
      packUnitPrice,
      packSummary,
    };
  });

  const useOfflineStub = process.env.GEMINI_MODE === "offline_stub";
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const { mimeType, base64Data } = parseDataUrl(params.receiptImageData);
  let lastErrorMsg: string | null = null;

  if (!useOfflineStub && apiKey && base64Data && base64Data.length > 64) {
    const promptText = `Anda adalah asisten pemeriksa nota belanja toko di Indonesia untuk pemilik toko (orang awam).
Seorang pegawai mengajukan daftar barang baru dan melampirkan foto atau file (${
      params.receiptSource === "FISIK" ? "foto nota fisik" : "berkas nota digital / PDF"
    }).

LANGKAH 1 (Cek Keaslian & Keterbacaan Gambar):
- Periksa apakah gambar atau PDF ini benar-benar nota, struk kasir, kuitansi, atau faktur belanja yang tulisannya terbaca.
- Isi detectedDocumentType dengan jenis dokumen yang terlihat (contoh: "Nota Belanja", "Struk Kasir", "Nota Tulis Tangan", "CV / Daftar Riwayat Hidup", "Poster / Twibbon", atau "Foto Buram").
- Jika BUKAN nota belanja atau sama sekali tidak terbaca, set isReceiptReadable = false, receiptLines = [], missingReceiptInfo = [], hasDiscrepancy = true, jelaskan dokumen apa yang terlihat dalam Bahasa Indonesia sederhana pada neutralSummary, dan tandai item bahan/produk sebagai TIDAK_DITEMUKAN.

LANGKAH 2 (Baca Semua Baris Nota Terlebih Dahulu):
- Jika ini nota belanja yang terbaca, salin setiap baris yang tertulis pada nota ke array receiptLines (contoh: "Gula 90.000", "TOTAL 90.000").
- Ekstrak HANYA yang benar-benar tertulis di gambar: nama toko (extractedSupplier), nomor nota (extractedInvoiceNumber), tanggal (extractedDate), dan total akhir pembayaran pada nota (extractedTotal). Jika tidak tertulis di nota, biarkan string kosong "" atau angka 0, JANGAN menyalin dari input pegawai.

LANGKAH 3 (Cocokkan dengan Data Pengajuan Pegawai):
- Nama Pemasok Diinput: ${params.supplierName || "(tidak diisi)"}
- Catatan Pegawai: ${params.batchNote || "(tidak ada)"}
- Total Belanja Diinput: Rp ${submittedEstimatedTotal}
- Daftar Barang yang Diinput Pegawai:
${JSON.stringify(
  enrichedInputs.map((e) => ({
    nama: e.name,
    tipe: e.kind,
    rincianKemasanDanHarga: e.packSummary,
    totalBiayaInput: e.estimatedTotalCost,
  }))
)}

PRINSIP ADIL UNTUK NOTA TIDAK LENGKAP (SANGAT PENTING):
- Nota belanja warung, pasar, atau tulis tangan di Indonesia sering kali sangat ringkas dan TIDAK selengkap form input pegawai.
- JANGAN menyalahkan atau menandai SELISIH / TIDAK_DITEMUKAN / hasDiscrepancy = true hanya karena keterangan berikut tidak tertulis di nota:
  1. Nama toko/pemasok, nomor nota, atau tanggal tidak tertulis di nota.
  2. Ukuran/berat/isi kemasan (gram, ml, kg, liter) atau merek tidak tertulis di nota (contoh: nota hanya menulis "Gula 5 = 90.000" atau "Gula 90rb", sedangkan input pegawai "Gula Pasir 5 kemasan isi 1000g x Rp 18.000 = Rp 90.000") -> anggap COCOK karena nama barang dan totalnya selaras.
  3. Harga satuan per kemasan atau jumlah kemasan tidak dirinci di nota, tetapi subtotal barang tersebut cocok dengan total biaya input (toleransi pembulatan <= Rp 500) -> anggap COCOK.
  4. Nota hanya berupa kuitansi total ringkas tanpa rincian barang per baris (misal hanya tulis "Belanja bahan Rp 90.000" atau "TOTAL 90.000") dan total akhir di nota cocok dengan total pengajuan pegawai (toleransi <= Rp 500) -> anggap COCOK, dan tulis catatan netral bahwa nota hanya memuat total tanpa rincian per barang.
  5. Singkatan atau penulisan nama barang yang lebih pendek (contoh: GULPAS = Gula Pasir, Gula = Gula Pasir, Susu = Susu Ultra Milk, bks/btl/dus). Pahami juga konversi umum 1 kg = 1000 g dan 1 liter = 1000 ml.
  6. Pembulatan wajar <= Rp 500.
- Catat keterangan yang memang tidak tertulis di nota secara objektif ke array missingReceiptInfo (contoh: "Nama toko tidak tertulis di nota", "Ukuran kemasan (1000 g) tidak tertulis di nota", "Harga satuan tidak dirinci di nota"). Isi [] jika nota sudah lengkap.

KAPAN HARUS MENANDAI BERBEDA (hasDiscrepancy = true / SELISIH / TIDAK_DITEMUKAN):
- Untuk tipe MENU_RESEP, selalu beri matchStatus = "RESEP_NON_NOTA" dengan catatan "Menu racikan internal, bukan barang beli di nota".
- Untuk tipe BAHAN_BAKU atau PRODUK_JUAL, tandai SELISIH atau TIDAK_DITEMUKAN HANYA jika data yang TERTULIS di nota BENAR-BENAR BERTENTANGAN:
  1. Jumlah kemasan yang tertulis di nota jelas berbeda (misal nota tulis 2, input 3).
  2. Harga kemasan atau subtotal yang tertulis di nota jelas berbeda (> Rp 500) dari input pegawai (misal nota tulis Rp 70.000, input Rp 105.000).
  3. Nota menampilkan daftar rincian barang yang jelas, tetapi barang yang diinput pegawai memang tidak ada sama sekali di daftar tersebut atau barangnya jelas berbeda.
  4. Lampiran bukan nota belanja atau ada tanda editan digital mencolok (set hasEditSuspicion dan editSuspicionReason).
- Isi receiptQty, receiptUnitCost, receiptSubtotal HANYA jika angka itu tertulis di nota (biarkan null/kosong jika tidak dirinci di nota, JANGAN menyalin angka input pegawai bila di nota tidak tertulis).
- Jika di nota ada barang lain yang tidak dimasukkan pegawai, tulis di unmatchedReceiptItems.
- Gunakan Bahasa Indonesia sehari-hari yang ramah, objektif, dan tidak menyalahkan (tanpa istilah teknis dan tanpa tanda pisah panjang em dash).`;

    const callResult = await callGeminiVisionJson({
      apiKey,
      promptText,
      mimeType,
      base64Data,
      genSchema: PRODUCT_BATCH_GEN_SCHEMA,
      interactionSchema: PRODUCT_BATCH_INTERACTION_SCHEMA,
    });

    lastErrorMsg = callResult.errorMessage;

    if (callResult.parsed) {
      const parsed = callResult.parsed;
      const isReadable = parsed.isReceiptReadable !== false;
      const detectedDoc =
        sanitizeText(parsed.detectedDocumentType) ||
        (isReadable ? "Nota Belanja" : "Bukan Nota");
      const receiptLines = sanitizeStringList(parsed.receiptLines);
      const unmatchedReceiptItems = sanitizeStringList(parsed.unmatchedReceiptItems);
      const missingReceiptInfo = isReadable ? sanitizeStringList(parsed.missingReceiptInfo) : [];
      const rawItems = Array.isArray(parsed.items)
        ? (parsed.items as Record<string, unknown>[])
        : [];

      const mappedItems: ProductRequestAIItemCheck[] = enrichedInputs.map((sub, idx) => {
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
            packCount: null,
            packSize: null,
            packUnitPrice: null,
            purchaseUnit: null,
            receiptQty: null,
            receiptUnitCost: null,
            receiptSubtotal: null,
            matchStatus: "RESEP_NON_NOTA",
            note: "Menu racikan internal (bahan bakunya dicek per masing-masing bahan).",
          };
        }

        if (!isReadable) {
          return {
            submittedName: sub.name,
            matchedReceiptName: null,
            submittedQty: sub.initialStock,
            submittedUnit: sub.sellUnit,
            submittedCostTotal: sub.estimatedTotalCost,
            packCount: sub.isPackaged ? sub.packCount : null,
            packSize: sub.isPackaged ? sub.packSize : null,
            packUnitPrice: sub.isPackaged ? sub.packUnitPrice : null,
            purchaseUnit: sub.purchaseUnit,
            receiptQty: null,
            receiptUnitCost: null,
            receiptSubtotal: null,
            matchStatus: "TIDAK_DITEMUKAN",
            note:
              sanitizeText(found?.note) ||
              `Lampiran terdeteksi sebagai ${detectedDoc}, bukan nota belanja.`,
          };
        }

        const rawStatus = String(
          found?.matchStatus || (sub.kind === "MENU_RESEP" ? "RESEP_NON_NOTA" : "COCOK")
        );
        const matchStatus: ProductRequestAIItemCheck["matchStatus"] =
          rawStatus === "COCOK" ||
          rawStatus === "SELISIH" ||
          rawStatus === "TIDAK_DITEMUKAN" ||
          rawStatus === "RESEP_NON_NOTA"
            ? rawStatus
            : "COCOK";

        const parsedReceiptQty =
          typeof found?.receiptQty === "number" && found.receiptQty > 0
            ? found.receiptQty
            : null;
        const parsedReceiptUnitCost =
          typeof found?.receiptUnitCost === "number" && found.receiptUnitCost > 0
            ? Math.round(found.receiptUnitCost)
            : null;
        const parsedReceiptSubtotal =
          typeof found?.receiptSubtotal === "number" && found.receiptSubtotal > 0
            ? Math.round(found.receiptSubtotal)
            : null;

        return {
          submittedName: sub.name,
          matchedReceiptName: found?.matchedReceiptName
            ? sanitizeText(found.matchedReceiptName) || null
            : null,
          submittedQty: sub.initialStock,
          submittedUnit: sub.sellUnit,
          submittedCostTotal: sub.estimatedTotalCost,
          packCount: sub.isPackaged ? sub.packCount : null,
          packSize: sub.isPackaged ? sub.packSize : null,
          packUnitPrice: sub.isPackaged ? sub.packUnitPrice : null,
          purchaseUnit: sub.purchaseUnit,
          receiptQty: parsedReceiptQty,
          receiptUnitCost: parsedReceiptUnitCost,
          receiptSubtotal: parsedReceiptSubtotal,
          matchStatus,
          note: found?.note ? sanitizeText(found.note) : null,
        };
      });

      const extractedTotal =
        isReadable && typeof parsed.extractedTotal === "number" && parsed.extractedTotal > 0
          ? Math.round(parsed.extractedTotal)
          : null;

      const anyItemMismatch = mappedItems.some(
        (m) => m.matchStatus === "SELISIH" || m.matchStatus === "TIDAK_DITEMUKAN"
      );
      const totalDiffers =
        extractedTotal !== null &&
        submittedEstimatedTotal > 0 &&
        unmatchedReceiptItems.length === 0 &&
        Math.abs(extractedTotal - submittedEstimatedTotal) > 500;
      const hasMismatch = !isReadable || anyItemMismatch || totalDiffers;

      const status: ProductRequestAIResult["status"] = parsed.hasEditSuspicion
        ? "TERINDIKASI_EDIT"
        : hasMismatch
        ? "ADA_SELISIH"
        : "SESUAI";

      const defaultSummary = !isReadable
        ? `Lampiran terdeteksi sebagai ${detectedDoc} dan bukan nota belanja yang bisa dibaca.`
        : status === "SESUAI"
        ? missingReceiptInfo.length > 0
          ? "Data yang tertulis di nota sudah cocok dengan pengajuan pegawai. Beberapa detail memang tidak tercantum di nota."
          : "Barang dan harga yang diinput pegawai sudah cocok dengan isi nota."
        : "Ada perbedaan antara data yang diinput pegawai dengan isi nota.";

      return {
        status,
        isReceiptReadable: isReadable,
        detectedDocumentType: detectedDoc,
        receiptLines,
        unmatchedReceiptItems,
        missingReceiptInfo,
        receiptSource: params.receiptSource,
        extractedSupplier: isReadable
          ? sanitizeText(parsed.extractedSupplier) || null
          : null,
        extractedInvoiceNumber: isReadable
          ? sanitizeText(parsed.extractedInvoiceNumber) || null
          : null,
        extractedDate: isReadable ? sanitizeText(parsed.extractedDate) || null : null,
        extractedTotal,
        submittedEstimatedTotal,
        items: mappedItems,
        editSuspicionReason: parsed.editSuspicionReason
          ? sanitizeText(parsed.editSuspicionReason)
          : null,
        neutralSummary: sanitizeText(parsed.neutralSummary) || defaultSummary,
        disclaimer: NEUTRAL_AI_DISCLAIMER,
        aiEngineUsed: true,
        modelUsed: callResult.modelUsed,
        engineError: null,
        checkedAt,
      };
    }
  } else if (!useOfflineStub && !apiKey) {
    lastErrorMsg = "Kunci API Gemini belum diisi pada pengaturan server (.env).";
  }

  // Di mode live (default), jika Gemini gagal dihubungi, JANGAN pernah palsukan status "SESUAI"!
  if (!useOfflineStub) {
    return {
      status: "GAGAL_CEK",
      isReceiptReadable: true,
      detectedDocumentType: null,
      receiptLines: [],
      unmatchedReceiptItems: [],
      missingReceiptInfo: [],
      receiptSource: params.receiptSource,
      extractedSupplier: null,
      extractedInvoiceNumber: null,
      extractedDate: null,
      extractedTotal: null,
      submittedEstimatedTotal,
      items: enrichedInputs.map((sub) =>
        sub.kind === "MENU_RESEP"
          ? {
              submittedName: sub.name,
              matchedReceiptName: null,
              submittedQty: sub.initialStock,
              submittedUnit: sub.sellUnit,
              submittedCostTotal: 0,
              packCount: null,
              packSize: null,
              packUnitPrice: null,
              purchaseUnit: null,
              receiptQty: null,
              receiptUnitCost: null,
              receiptSubtotal: null,
              matchStatus: "RESEP_NON_NOTA",
              note: "Menu racikan internal (bukan barang beli di nota).",
            }
          : {
              submittedName: sub.name,
              matchedReceiptName: null,
              submittedQty: sub.initialStock,
              submittedUnit: sub.sellUnit,
              submittedCostTotal: sub.estimatedTotalCost,
              packCount: sub.isPackaged ? sub.packCount : null,
              packSize: sub.isPackaged ? sub.packSize : null,
              packUnitPrice: sub.isPackaged ? sub.packUnitPrice : null,
              purchaseUnit: sub.purchaseUnit,
              receiptQty: null,
              receiptUnitCost: null,
              receiptSubtotal: null,
              matchStatus: "BELUM_DICEK",
              note: "Belum diperiksa AI. Silakan tekan Cek Ulang.",
            }
      ),
      editSuspicionReason: null,
      neutralSummary:
        lastErrorMsg ||
        "AI Gemini belum berhasil terhubung saat ini. Tekan tombol Cek Ulang beberapa saat lagi atau cocokkan langsung dengan foto nota.",
      disclaimer: NEUTRAL_AI_DISCLAIMER,
      aiEngineUsed: false,
      modelUsed: null,
      engineError: lastErrorMsg,
      checkedAt,
    };
  }

  // Fallback lokal deterministik khusus mode uji Vitest
  const fallbackItems: ProductRequestAIItemCheck[] = enrichedInputs.map((sub) => {
    if (sub.kind === "MENU_RESEP") {
      return {
        submittedName: sub.name,
        matchedReceiptName: null,
        submittedQty: sub.initialStock,
        submittedUnit: sub.sellUnit,
        submittedCostTotal: 0,
        packCount: null,
        packSize: null,
        packUnitPrice: null,
        purchaseUnit: null,
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
      matchedReceiptName: null,
      submittedQty: sub.initialStock,
      submittedUnit: sub.sellUnit,
      submittedCostTotal: sub.estimatedTotalCost,
      packCount: sub.isPackaged ? sub.packCount : null,
      packSize: sub.isPackaged ? sub.packSize : null,
      packUnitPrice: sub.isPackaged ? sub.packUnitPrice : null,
      purchaseUnit: sub.purchaseUnit,
      receiptQty: null,
      receiptUnitCost: null,
      receiptSubtotal: null,
      matchStatus: missingPrice ? "SELISIH" : "COCOK",
      note: missingPrice
        ? "Harga modal masih Rp 0. Periksa langsung angka pada nota lampiran."
        : "Perlu pencocokan visual langsung dengan gambar atau dokumen nota terlampir.",
    };
  });

  const anyMissingPrice = fallbackItems.some((it) => it.matchStatus === "SELISIH");

  return {
    status: anyMissingPrice ? "ADA_SELISIH" : "SESUAI",
    isReceiptReadable: true,
    detectedDocumentType: "Mode Uji Lokal",
    receiptLines: [],
    unmatchedReceiptItems: [],
    missingReceiptInfo: [],
    receiptSource: params.receiptSource,
    extractedSupplier: params.supplierName || null,
    extractedInvoiceNumber: null,
    extractedDate: null,
    extractedTotal: null,
    submittedEstimatedTotal,
    items: fallbackItems,
    editSuspicionReason: null,
    neutralSummary: anyMissingPrice
      ? "Ada barang yang harganya masih Rp 0. Periksa kembali dengan lampiran nota."
      : "Perhitungan daftar barang dan total sudah sesuai (mode uji lokal).",
    disclaimer: NEUTRAL_AI_DISCLAIMER,
    aiEngineUsed: false,
    modelUsed: null,
    engineError: lastErrorMsg,
    checkedAt,
  };
}
