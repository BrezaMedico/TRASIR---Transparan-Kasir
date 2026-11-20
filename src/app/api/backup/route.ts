import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user || user.role !== "PEMILIK") {
      return NextResponse.json(
        { error: "Hanya Pemilik yang dapat mengunduh cadangan penuh database toko." },
        { status: 403 }
      );
    }

    const [
      settings,
      users,
      rolePermissions,
      units,
      categories,
      warehouses,
      products,
      variants,
      ingredients,
      purchases,
      sales,
      amendments,
      shiftClosings,
      stockAdjustments,
      opnameSessions,
      auditLogs,
    ] = await Promise.all([
      prisma.systemSetting.findMany(),
      prisma.user.findMany({
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
      prisma.category.findMany(),
      prisma.warehouse.findMany(),
      prisma.product.findMany(),
      prisma.productVariant.findMany(),
      prisma.recipeIngredient.findMany(),
      prisma.purchase.findMany({ include: { items: true } }),
      prisma.sale.findMany({ include: { items: true } }),
      prisma.saleAmendment.findMany(),
      prisma.shiftClosing.findMany(),
      prisma.stockAdjustment.findMany(),
      prisma.stockOpnameSession.findMany({ include: { items: true } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    ]);

    const now = new Date();
    await prisma.systemSetting.updateMany({
      where: { id: "default" },
      data: { lastBackupAt: now },
    });

    await recordAuditLog({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      actionType: "PENGATURAN",
      actionSummary: "Melakukan pencadangan data manual (Manual Data Backup)",
      entityType: "Backup",
      approvalState: "TERCATAT",
      linkUrl: "/pengaturan",
    });

    return NextResponse.json({
      backupVersion: "1.0.0",
      exportedAt: now.toISOString(),
      exportedBy: { id: user.id, name: user.name, role: user.role },
      data: {
        settings,
        users,
        rolePermissions,
        units,
        categories,
        warehouses,
        products,
        variants,
        ingredients,
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

