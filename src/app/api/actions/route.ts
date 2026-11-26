import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { prisma, withDbRetry } from "@/lib/prisma";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [pendingProductRequests, pendingPurchases, pendingAmendments, pendingAdjustments] =
      await withDbRetry(() =>
        Promise.all([
          prisma.productRequest.count({
            where: { roomId: user.roomId, status: "MENUNGGU_PERSETUJUAN" },
          }),
          prisma.purchase.count({
            where: { roomId: user.roomId, approvalStatus: "MENUNGGU_PERSETUJUAN" },
          }),
          prisma.saleAmendment.count({
            where: { roomId: user.roomId, status: "MENUNGGU_PERSETUJUAN" },
          }),
          prisma.stockAdjustment.count({
            where: { roomId: user.roomId, status: "MENUNGGU_PERSETUJUAN" },
          }),
        ])
      );

    return NextResponse.json({
      pendingProductRequests,
      pendingPurchases,
      pendingAmendments,
      pendingAdjustments,
      totalPending:
        pendingProductRequests + pendingPurchases + pendingAmendments + pendingAdjustments,
    });
  } catch (err) {
    return handleApiError(err, "/api/actions", "Gagal memuat ringkasan antrean.");
  }
}
