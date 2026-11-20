import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { ensureSystemBaseline, getRolePermissionsMap } from "@/lib/rbac";

export async function GET() {
  try {
    await ensureSystemBaseline();
    const userCount = await prisma.user.count();
    const user = await getCurrentSessionUser();

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        needsInitialSetup: userCount === 0,
        user: null,
        permissions: null,
      });
    }

    const permissions = await getRolePermissionsMap(user.role);
    const unreadNotifications = await prisma.notification.count({
      where: {
        isRead: false,
        OR: [
          { userId: user.id },
          {
            userId: null,
            OR: [{ targetRole: null }, { targetRole: user.role }],
          },
        ],
      },
    });

    const settings = await prisma.systemSetting.findUnique({
      where: { id: "default" },
    });

    return NextResponse.json({
      authenticated: true,
      needsInitialSetup: false,
      user,
      permissions,
      unreadNotifications,
      storeName: settings?.storeName ?? "TRASIR Toko Utama",
      toleranceThresholdRp: settings?.toleranceThresholdRp ?? 50000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat sesi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

