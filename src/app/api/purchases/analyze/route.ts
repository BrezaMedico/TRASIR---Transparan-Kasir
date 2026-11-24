import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import {
  analyzePurchaseReceiptWithGemini,
  computeReceiptHash,
} from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json();
    const invoiceNumber = String(body.invoiceNumber || "DRAFT-NOTA").trim();
    const supplierName = String(body.supplierName || "Pemasok").trim();
    const purchaseDate = String(body.purchaseDate || new Date().toISOString().slice(0, 10));
    const totalAmount = Number(body.totalAmount || 0);
    const receiptImageData = String(body.receiptImageData || "");
    const items = Array.isArray(body.items) ? body.items : [];

    if (!receiptImageData || receiptImageData.length < 16) {
      return NextResponse.json(
        { error: "Lampiran foto/berkas nota belum tersedia untuk dipindai AI." },
        { status: 400 }
      );
    }

    const receiptHash = computeReceiptHash(receiptImageData);
    const duplicate = await prisma.purchase.findFirst({
      where: {
        roomId: auth.user.roomId,
        id: body.purchaseId ? { not: String(body.purchaseId) } : undefined,
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
      receiptImageData,
      isDuplicateInDatabase: Boolean(duplicate),
      duplicateRef: duplicate ? `${duplicate.invoiceNumber} (${duplicate.supplierName})` : null,
    });

    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menganalisis nota dengan AI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

