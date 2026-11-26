import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
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

    const [activeShifts, latestClosings] = await withDbRetry(() =>
      Promise.all([
        prisma.shift.findMany({
          where: { roomId: user.roomId, status: "AKTIF" },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.shift.groupBy({
          by: ["userId"],
          where: { roomId: user.roomId, status: { not: "AKTIF" } },
          _max: { closedAt: true, createdAt: true },
        }),
      ])
    );

    const activeShiftCashiers = new Set<string>(activeShifts.map((row) => row.userId));
    const lastClosingByCashier = new Map<string, Date>();
    for (const row of latestClosings) {
      const closedTime = row._max.closedAt ?? row._max.createdAt;
      if (closedTime) {
        lastClosingByCashier.set(row.userId, closedTime);
      }
    }

    const unclosedCountByCashier = new Map<string, number>();
    for (let i = 0; i < users.length; i += 3) {
      const batch = users.slice(i, i + 3);
      const counts = await withDbRetry(() =>
        Promise.all(
          batch.map((member) => {
            const lastClosingAt = lastClosingByCashier.get(member.id);
            return prisma.sale.count({
              where: {
                roomId: user.roomId,
                cashierId: member.id,
                status: "NORMAL",
                ...(lastClosingAt ? { createdAt: { gt: lastClosingAt } } : {}),
              },
            });
          })
        )
      );
      batch.forEach((member, idx) => {
        unclosedCountByCashier.set(member.id, counts[idx] ?? 0);
      });
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
    return handleApiError(err, "/api/users", "Gagal memuat daftar tim.");
  }
}
