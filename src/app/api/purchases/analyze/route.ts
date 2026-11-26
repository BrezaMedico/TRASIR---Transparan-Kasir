import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { validateProofAttachment } from "@/lib/attachment";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import {
  analyzePurchaseReceiptWithGemini,
  computeReceiptHash,
} from "@/lib/gemini";
import { z } from "zod";

const analyzeItemSchema = z.object({
  itemName: z.string().trim().min(1).max(150),
  quantity: z.number().finite().min(0),
  unit: z.string().trim().min(1).max(40),
  unitCost: z.number().finite().min(0),
  subtotal: z.number().finite().min(0),
});

const analyzePurchaseSchema = z.object({
  purchaseId: z.string().trim().optional(),
  receiptImageData: z.string().optional().nullable(),
  invoiceNumber: z.string().trim().max(100).optional(),
  supplierName: z.string().trim().max(120).optional(),
  purchaseDate: z.string().trim().max(40).optional(),
  totalAmount: z.number().finite().min(0).optional(),
  captureMethod: z.enum(["LIVE_CAMERA", "DIGITAL_UPLOAD", "TANPA_NOTA"]).optional(),
  items: z.array(analyzeItemSchema).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang berwenang memeriksa nota dengan AI." },
        { status: 403 }
      );
    }

    const rawBody = await request.json();
    const parsed = analyzePurchaseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data pemeriksaan nota tidak valid." },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const purchaseId = body.purchaseId || "";

    const existingPurchase = purchaseId
      ? await prisma.purchase.findFirst({
          where: { id: purchaseId, roomId: user.roomId },
          include: { items: true },
        })
      : null;

    if (purchaseId && !existingPurchase) {
      return NextResponse.json(
        { error: "Data pembelian tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    const resolvedReceipt =
      String(body.receiptImageData || "").trim() ||
      existingPurchase?.receiptImageData?.trim() ||
      "";

    if (!resolvedReceipt || resolvedReceipt.length < 16) {
      return NextResponse.json(
        { error: "Lampirkan foto nota fisik atau file nota digital terlebih dahulu sebelum memeriksa dengan AI." },
        { status: 400 }
      );
    }

    const proofCheck = validateProofAttachment(resolvedReceipt);
    if (!proofCheck.valid) {
      return NextResponse.json(
        { error: proofCheck.error || "Format lampiran nota tidak valid." },
        { status: 400 }
      );
    }

    const invoiceNumber =
      String(body.invoiceNumber || existingPurchase?.invoiceNumber || "DRAFT-NOTA").trim();
    const supplierName =
      String(body.supplierName || existingPurchase?.supplierName || "Pemasok").trim();
    const purchaseDate = String(
      body.purchaseDate ||
        (existingPurchase
          ? getJakartaDateKey(existingPurchase.purchaseDate)
          : getJakartaDateKey())
    );
    const totalAmount = Number(
      body.totalAmount !== undefined ? body.totalAmount : existingPurchase?.totalAmount ?? 0
    );

    const items =
      Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : (existingPurchase?.items || []).map((it) => ({
            itemName: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            unitCost: it.unitCost,
            subtotal: it.subtotal,
          }));

    const receiptHash = computeReceiptHash(resolvedReceipt);
    const duplicate = await prisma.purchase.findFirst({
      where: {
        roomId: user.roomId,
        id: purchaseId ? { not: purchaseId } : undefined,
        OR: [{ invoiceNumber }, { receiptHash }],
      },
      select: { invoiceNumber: true, supplierName: true },
    });

    const analysis = await analyzePurchaseReceiptWithGemini({
      supplierName,
      invoiceNumber,
      purchaseDate,
      totalAmount,
      items,
      receiptImageData: resolvedReceipt,
      isDuplicateInDatabase: Boolean(duplicate),
      duplicateRef: duplicate ? `${duplicate.invoiceNumber} (${duplicate.supplierName})` : null,
    });

    const resolvedCaptureMethod =
      body.captureMethod === "LIVE_CAMERA" || body.captureMethod === "DIGITAL_UPLOAD"
        ? body.captureMethod
        : existingPurchase?.captureMethod && existingPurchase.captureMethod !== "TANPA_NOTA"
        ? existingPurchase.captureMethod
        : "DIGITAL_UPLOAD";

    if (existingPurchase) {
      const persistedAiStatus =
        analysis.status === "GAGAL_CEK"
          ? existingPurchase.aiValidationStatus === "BELUM_DICEK"
            ? "BELUM_DICEK"
            : "GAGAL_CEK"
          : analysis.status;

      await prisma.$transaction(async (tx) => {
        await tx.purchase.update({
          where: { id: existingPurchase.id },
          data: {
            receiptImageData: resolvedReceipt,
            receiptHash,
            captureMethod: resolvedCaptureMethod,
            aiValidationStatus: persistedAiStatus,
            aiExtractedSupplier: analysis.extractedSupplier,
            aiExtractedDate: analysis.extractedDate,
            aiExtractedTotal: analysis.extractedTotal,
            aiAnalysisJson: JSON.stringify(analysis),
          },
        });

        for (let idx = 0; idx < existingPurchase.items.length; idx += 1) {
          const dbItem = existingPurchase.items[idx];
          const aiRow = analysis.items[idx];
          if (!aiRow) continue;
          await tx.purchaseItem.update({
            where: { id: dbItem.id },
            data: {
              aiExtractedQty: aiRow.quantity,
              aiExtractedPrice: aiRow.unitCost,
              aiDiscrepancyNote: aiRow.discrepancyNote,
            },
          });
        }
      });
    }

    return NextResponse.json({
      analysis,
      receiptImageData: resolvedReceipt,
      captureMethod: resolvedCaptureMethod,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memeriksa nota dengan AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
