import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pendingPurchases, pendingAmendments, pendingAdjustments] = await Promise.all([
    prisma.purchase.count({ where: { approvalStatus: "MENUNGGU_PERSETUJUAN" } }),
    prisma.saleAmendment.count({ where: { status: "MENUNGGU_PERSETUJUAN" } }),
    prisma.stockAdjustment.count({ where: { status: "MENUNGGU_PERSETUJUAN" } }),
  ]);

  return NextResponse.json({
    pendingPurchases,
    pendingAmendments,
    pendingAdjustments,
    totalPending: pendingPurchases + pendingAmendments + pendingAdjustments,
  });
}

