import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { validateProofAttachment } from "@/lib/attachment";
import { computeReceiptHash } from "@/lib/gemini";
import { z } from "zod";

const updatePurchaseReceiptSchema = z.object({
  purchaseId: z.string().trim().min(1, "ID pembelian wajib disertakan."),
  receiptImageData: z.string().nullable(),
  captureMethod: z.enum(["LIVE_CAMERA", "DIGITAL_UPLOAD", "TANPA_NOTA"]).optional(),
});

export async function PATCH(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();
    const parsed = updatePurchaseReceiptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data pembaruan nota pembelian tidak valid." },
        { status: 400 }
      );
    }

    const { purchaseId, receiptImageData, captureMethod } = parsed.data;
    const existing = await prisma.purchase.findFirst({
      where: { id: purchaseId, roomId: user.roomId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Data pembelian tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    if (!isStoreAdmin(user.role) && existing.submittedById !== user.id) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengubah lampiran nota pembelian ini." },
        { status: 403 }
      );
    }

    if (
      existing.approvalStatus !== "MENUNGGU_PERSETUJUAN" &&
      existing.approvalStatus !== "PERLU_PERBAIKAN"
    ) {
      return NextResponse.json(
        {
          error:
            "Lampiran nota hanya dapat diganti selama pengajuan pembelian masih menunggu persetujuan atau perlu perbaikan.",
        },
        { status: 400 }
      );
    }

    const trimmedReceipt = receiptImageData?.trim() || "";
    const hasReceipt = trimmedReceipt.length > 0;

    if (hasReceipt) {
      const proofCheck = validateProofAttachment(trimmedReceipt);
      if (!proofCheck.valid) {
        return NextResponse.json(
          { error: proofCheck.error || "Format lampiran nota tidak valid." },
          { status: 400 }
        );
      }
    }

    const receiptHash = hasReceipt ? computeReceiptHash(trimmedReceipt) : null;
    const resolvedCaptureMethod = hasReceipt
      ? captureMethod === "LIVE_CAMERA"
        ? "LIVE_CAMERA"
        : "DIGITAL_UPLOAD"
      : "TANPA_NOTA";
    const nextAiStatus = hasReceipt ? "BELUM_DICEK" : "TANPA_NOTA";

    const updated = await prisma.$transaction(async (tx) => {
      const nextPurchase = await tx.purchase.update({
        where: { id: existing.id },
        data: {
          receiptImageData: trimmedReceipt,
          receiptHash,
          captureMethod: resolvedCaptureMethod,
          aiValidationStatus: nextAiStatus,
          aiExtractedSupplier: null,
          aiExtractedDate: null,
          aiExtractedTotal: null,
          aiAnalysisJson: null,
        },
        include: {
          submittedBy: { select: { id: true, name: true, role: true, username: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
          items: { include: { product: true } },
        },
      });

      await tx.purchaseItem.updateMany({
        where: { purchaseId: existing.id },
        data: {
          aiExtractedQty: null,
          aiExtractedPrice: null,
          aiDiscrepancyNote: null,
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PEMBELIAN",
          actionSummary: hasReceipt
            ? `${user.name} memperbarui lampiran nota pembelian #${existing.invoiceNumber}`
            : `${user.name} menghapus lampiran nota pembelian #${existing.invoiceNumber}`,
          entityType: "Purchase",
          entityId: existing.id,
          afterData: {
            hasReceipt,
            captureMethod: resolvedCaptureMethod,
            aiValidationStatus: nextAiStatus,
          },
          approvalState: existing.approvalStatus as
            | "MENUNGGU_PERSETUJUAN"
            | "PERLU_PERBAIKAN",
          linkUrl: `/pembelian/${existing.id}`,
        },
        tx
      );

      return nextPurchase;
    });

    return NextResponse.json({ purchase: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui lampiran nota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
