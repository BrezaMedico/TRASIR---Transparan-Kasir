import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView = await checkUserPermission(user.role, "aktivitas", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses halaman Notifikasi & Audit Trail." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const actionType = searchParams.get("actionType");
    const roleFilter = searchParams.get("role");

    const isRestrictedStaff = user.role === "KASIR" || user.role === "GUDANG";

    const auditWhere: Record<string, unknown> = {};
    if (isRestrictedStaff) {
      auditWhere.actorId = user.id;
    } else {
      if (roleFilter) auditWhere.actorRole = roleFilter;
    }
    if (actionType) {
      auditWhere.actionType = actionType;
    }

    const notifWhere = isRestrictedStaff
      ? {
          OR: [{ userId: user.id }, { targetRole: user.role }],
        }
      : {
          OR: [{ userId: user.id }, { userId: null }],
        };

    const [auditLogs, notifications, users] = await Promise.all([
      prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.notification.findMany({
        where: notifWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      isRestrictedStaff
        ? Promise.resolve([])
        : prisma.user.findMany({
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
          }),
    ]);

    return NextResponse.json({
      auditLogs,
      notifications,
      users,
      isRestrictedStaff,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat log aktivitas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (body.action === "MARK_READ" && body.notificationId) {
      await prisma.notification.update({
        where: { id: String(body.notificationId) },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === "MARK_ALL_READ") {
      await prisma.notification.updateMany({
        where: {
          OR: [{ userId: user.id }, { targetRole: user.role }, { userId: null }],
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui status notifikasi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

