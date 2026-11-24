import { NextResponse } from "next/server";
import { requireAssignedUser } from "@/lib/auth";
import { prisma, withDbRetry } from "@/lib/prisma";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

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
    const message = err instanceof Error ? err.message : "Gagal memuat ringkasan antrean.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
