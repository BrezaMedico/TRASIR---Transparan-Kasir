import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView = await checkUserPermission(user.role, "pembelian", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses lampiran nota pembelian." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const purchase = await prisma.purchase.findFirst({
      where: { id, roomId: user.roomId },
      select: {
        id: true,
        invoiceNumber: true,
        captureMethod: true,
        aiValidationStatus: true,
        receiptUrl: true,
        receiptImageData: true,
        receiptHash: true,
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Data pembelian tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    const receiptUrl = purchase.receiptUrl?.trim() || null;
    const inlineData = purchase.receiptImageData?.trim() || "";
    const resolvedReceipt = receiptUrl || inlineData;
    const hasReceipt = resolvedReceipt.length > 0;
    const storageType = receiptUrl
      ? "OBJECT_STORAGE"
      : inlineData
        ? "INLINE_BASE64"
        : "NONE";

    return NextResponse.json({
      id: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
      captureMethod: purchase.captureMethod,
      aiValidationStatus: purchase.aiValidationStatus,
      hasReceipt,
      receiptUrl,
      receiptImageData: resolvedReceipt,
      receiptHash: purchase.receiptHash,
      storageType,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/purchases/[id]/receipt", "Gagal memuat lampiran nota.");
  }
}

