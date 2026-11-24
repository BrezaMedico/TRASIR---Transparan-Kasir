import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { validateProofAttachment } from "@/lib/attachment";
import { analyzeProductRequestBatchWithGemini } from "@/lib/gemini";
import {
  computeRequestItemEstimatedCost,
  parseProductRequestEnvelope,
  serializeProductRequestEnvelope,
} from "@/lib/product-request-batch";
import { z } from "zod";

const analyzeSchema = z.object({
  batchId: z.string().trim().optional(),
  requestIds: z.array(z.string().min(1)).optional(),
  receiptImageData: z.string().optional().nullable(),
  receiptSource: z.enum(["FISIK", "DIGITAL"]).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang berwenang memindai kesesuaian nota dengan AI." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = analyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data permintaan pindai AI tidak valid." },
        { status: 400 }
      );
    }

    const { batchId, requestIds, receiptImageData: uploadedReceipt, receiptSource: uploadedSource } =
      parsed.data;

    if (!batchId && (!requestIds || requestIds.length === 0)) {
      return NextResponse.json(
        { error: "Sertakan batchId atau daftar requestIds yang akan dipindai." },
        { status: 400 }
      );
    }

    const candidates = await prisma.productRequest.findMany({
      where: {
        roomId: user.roomId,
        ...(requestIds && requestIds.length > 0 ? { id: { in: requestIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const batchRows = (
      requestIds && requestIds.length > 0
        ? candidates
        : candidates.filter((row) => parseProductRequestEnvelope(row.variantsJson).batchId === batchId)
    ).sort((a, b) => {
      const idxA = parseProductRequestEnvelope(a.variantsJson).batchIndex ?? Number.MAX_SAFE_INTEGER;
      const idxB = parseProductRequestEnvelope(b.variantsJson).batchIndex ?? Number.MAX_SAFE_INTEGER;
      return idxA - idxB;
    });

    if (batchRows.length === 0) {
      return NextResponse.json(
        { error: "Paket pengajuan produk tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    const leadRow = batchRows[0];
    const leadEnv = parseProductRequestEnvelope(leadRow.variantsJson);

    let resolvedReceipt = uploadedReceipt?.trim() || "";
    let resolvedSource: "FISIK" | "DIGITAL" = uploadedSource || "DIGITAL";

    if (!resolvedReceipt) {
      for (const row of batchRows) {
        const env = parseProductRequestEnvelope(row.variantsJson);
        if (env.receiptImageData) {
          resolvedReceipt = env.receiptImageData;
          if (!uploadedSource && env.receiptSource) {
            resolvedSource = env.receiptSource;
          }
          break;
        }
      }
    }

    if (!resolvedReceipt) {
      return NextResponse.json(
        { error: "Lampirkan foto nota fisik atau file nota digital terlebih dahulu sebelum memindai AI." },
        { status: 400 }
      );
    }

    const proofCheck = validateProofAttachment(resolvedReceipt);
    if (!proofCheck.valid) {
      return NextResponse.json(
        { error: proofCheck.error || "Format lampiran nota tidak valid untuk dipindai." },
        { status: 400 }
      );
    }

    let supplierName: string | null = leadEnv.supplierName || null;
    let batchNote: string | null = leadEnv.batchNote || null;

    const analyzeItems = batchRows.map((row) => {
      const env = parseProductRequestEnvelope(row.variantsJson);
      if (!supplierName && env.supplierName) supplierName = env.supplierName;
      if (!batchNote && env.batchNote) batchNote = env.batchNote;

      const initialStock = row.stockMethod === "RESEP" ? 0 : env.initialStock ?? 0;
      const kind: "BAHAN_BAKU" | "PRODUK_JUAL" | "MENU_RESEP" = row.isRawMaterial
        ? "BAHAN_BAKU"
        : row.stockMethod === "RESEP"
        ? "MENU_RESEP"
        : "PRODUK_JUAL";

      return {
        name: row.name,
        kind,
        sku: row.sku,
        initialStock,
        sellUnit: row.sellUnit,
        purchaseUnit: row.purchaseUnit,
        conversionRatio: row.conversionRatio,
        unitCostPrice: row.costPrice,
        estimatedTotalCost: computeRequestItemEstimatedCost({
          stockMethod: row.stockMethod,
          costPrice: row.costPrice,
          initialStock,
        }),
        sellPrice: row.sellPrice,
      };
    });

    const analysis = await analyzeProductRequestBatchWithGemini({
      items: analyzeItems,
      supplierName,
      batchNote,
      receiptSource: resolvedSource,
      receiptImageData: resolvedReceipt,
    });

    const nextLeadEnv = {
      ...leadEnv,
      receiptImageData: resolvedReceipt,
      receiptSource: resolvedSource,
      aiScanResult: analysis,
    };

    await prisma.productRequest.update({
      where: { id: leadRow.id },
      data: {
        variantsJson: serializeProductRequestEnvelope(nextLeadEnv),
      },
    });

    return NextResponse.json({
      analysis,
      receiptImageData: resolvedReceipt,
      receiptSource: resolvedSource,
      leadRequestId: leadRow.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menganalisis nota dengan AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

