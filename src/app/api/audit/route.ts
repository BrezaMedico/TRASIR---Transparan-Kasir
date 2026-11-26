import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { z } from "zod";

const markIdsSchema = z.object({
  action: z.literal("MARK_IDS_READ"),
  notificationIds: z.array(z.string().min(1)).min(1).max(200),
});

function buildNotificationVisibilityWhere(user: {
  id: string;
  roomId: string;
  role: string;
}) {
  return {
    roomId: user.roomId,
    OR: isStoreAdmin(user.role)
      ? [
          { userId: user.id },
          {
            userId: null,
            OR: [{ targetRole: null }, { targetRole: "PEMILIK" }, { targetRole: "MANAJER" }],
          },
        ]
      : [{ userId: user.id }, { userId: null, targetRole: user.role }],
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

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

    const isRestrictedStaff = !isStoreAdmin(user.role);

    const auditWhere: Record<string, unknown> = { roomId: user.roomId };
    if (isRestrictedStaff) {
      auditWhere.actorId = user.id;
    } else {
      if (roleFilter) auditWhere.actorRole = roleFilter;
    }
    if (actionType) {
      auditWhere.actionType = actionType;
    }

    const notifWhere = buildNotificationVisibilityWhere(user);

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
            where: { roomId: user.roomId, isAssigned: true },
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
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();
    if (body.action === "MARK_READ" && body.notificationId) {
      await prisma.notification.updateMany({
        where: {
          id: String(body.notificationId),
          ...buildNotificationVisibilityWhere(user),
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === "MARK_IDS_READ") {
      const parsedIds = markIdsSchema.safeParse(body);
      if (!parsedIds.success) {
        return NextResponse.json({ error: "Daftar ID notifikasi tidak valid." }, { status: 400 });
      }
      await prisma.notification.updateMany({
        where: {
          id: { in: parsedIds.data.notificationIds },
          ...buildNotificationVisibilityWhere(user),
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === "MARK_ALL_READ") {
      await prisma.notification.updateMany({
        where: buildNotificationVisibilityWhere(user),
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
