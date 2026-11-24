import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;
    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat mengunduh cadangan database ruangan." },
        { status: 403 }
      );
    }

    // Batching bertahap (maks 4 query per gelombang) agar aman terhadap pool koneksi PgBouncer
    const [room, users, rolePermissions, units] = await Promise.all([
      prisma.room.findUnique({ where: { id: user.roomId } }),
      prisma.user.findMany({
        where: { roomId: user.roomId, isAssigned: true },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.rolePermission.findMany(),
      prisma.unit.findMany(),
    ]);

    const [categories, warehouses, products, productRequests] = await Promise.all([
      prisma.category.findMany({ where: { roomId: user.roomId } }),
      prisma.warehouse.findMany({ where: { roomId: user.roomId } }),
      prisma.product.findMany({
        where: { roomId: user.roomId },
        include: { variants: { include: { ingredients: true } } },
      }),
      prisma.productRequest.findMany({ where: { roomId: user.roomId } }),
    ]);

    const [purchases, sales, amendments, shiftClosings] = await Promise.all([
      prisma.purchase.findMany({
        where: { roomId: user.roomId },
        include: { items: true },
      }),
      prisma.sale.findMany({
        where: { roomId: user.roomId },
        include: { items: true },
      }),
      prisma.saleAmendment.findMany({ where: { roomId: user.roomId } }),
      prisma.shiftClosing.findMany({
        where: { roomId: user.roomId },
        select: {
          id: true,
          cashierId: true,
          shiftDate: true,
          systemTxCount: true,
          systemCashTotal: true,
          systemQrisTotal: true,
          systemTransferTotal: true,
          systemCardTotal: true,
          systemGrandTotal: true,
          actualCashTotal: true,
          actualDigitalTotal: true,
          notes: true,
          createdAt: true,
        },
      }),
    ]);

    const [stockAdjustments, opnameSessions, auditLogs] = await Promise.all([
      prisma.stockAdjustment.findMany({ where: { roomId: user.roomId } }),
      prisma.stockOpnameSession.findMany({
        where: { roomId: user.roomId },
        include: { items: true },
      }),
      prisma.auditLog.findMany({
        where: { roomId: user.roomId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    const now = new Date();
    await prisma.room.update({
      where: { id: user.roomId },
      data: { lastBackupAt: now },
    });

    await recordAuditLog({
      roomId: user.roomId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      actionType: "PENGATURAN",
      actionSummary: "Melakukan pencadangan data ruangan manual (Manual Data Backup)",
      entityType: "Backup",
      approvalState: "TERCATAT",
      linkUrl: "/pengaturan",
    });

    return NextResponse.json({
      backupVersion: "2.0.0",
      exportedAt: now.toISOString(),
      exportedBy: { id: user.id, name: user.name, role: user.role },
      room,
      data: {
        users,
        rolePermissions,
        units,
        categories,
        warehouses,
        products,
        productRequests,
        purchases,
        sales,
        amendments,
        shiftClosings,
        stockAdjustments,
        opnameSessions,
        auditLogs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat cadangan data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
