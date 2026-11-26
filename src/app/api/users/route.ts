import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat mengakses manajemen tim." },
        { status: 403 }
      );
    }

    const [room, users] = await withDbRetry(() =>
      Promise.all([
        prisma.room.findUnique({ where: { id: user.roomId }, select: { id: true, name: true } }),
        prisma.user.findMany({
          where: { roomId: user.roomId, isAssigned: true },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            isAssigned: true,
            lastLoginAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
      ])
    );

    const [shiftClosings, normalSales] = await withDbRetry(() =>
      Promise.all([
        prisma.shiftClosing.findMany({
          where: { roomId: user.roomId },
          orderBy: { createdAt: "desc" },
          select: { cashierId: true, status: true, createdAt: true },
        }),
        prisma.sale.findMany({
          where: { roomId: user.roomId, status: "NORMAL" },
          select: { cashierId: true, createdAt: true },
        }),
      ])
    );

    const activeShiftCashiers = new Set<string>();
    const lastClosingByCashier = new Map<string, Date>();
    for (const row of shiftClosings) {
      if (row.status === "AKTIF") {
        activeShiftCashiers.add(row.cashierId);
      } else if (!lastClosingByCashier.has(row.cashierId)) {
        lastClosingByCashier.set(row.cashierId, row.createdAt);
      }
    }

    const unclosedCountByCashier = new Map<string, number>();
    for (const sale of normalSales) {
      const lastClosingAt = lastClosingByCashier.get(sale.cashierId);
      if (!lastClosingAt || sale.createdAt > lastClosingAt) {
        unclosedCountByCashier.set(
          sale.cashierId,
          (unclosedCountByCashier.get(sale.cashierId) ?? 0) + 1
        );
      }
    }

    const enriched = users.map((member) => {
      const unclosedSalesCount = unclosedCountByCashier.get(member.id) ?? 0;
      const hasOpenShift = activeShiftCashiers.has(member.id) || unclosedSalesCount > 0;
      return {
        ...member,
        hasOpenShift,
        unclosedSalesCount,
      };
    });

    const activeOwnerCount = enriched.filter(
      (u) => u.isActive && u.isAssigned && u.role === "PEMILIK"
    ).length;

    const activeAdminCount = enriched.filter(
      (u) => u.isActive && u.isAssigned && isStoreAdmin(u.role)
    ).length;

    return NextResponse.json({
      room,
      users: enriched,
      activeOwnerCount,
      activeAdminCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar tim.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
