import { cache } from "react";
import { prisma, withDbRetry } from "./prisma";
import { getCurrentSessionUser, type SessionUser } from "./auth";
import {
  composePermissionsMap,
  ensureSystemBaseline,
  isStoreAdmin,
  type ModuleKey,
  type PermissionRow,
} from "./rbac";

export interface ServerSessionPayload {
  authenticated: boolean;
  needsInitialSetup: boolean;
  hasAnyUser: boolean;
  user: SessionUser | null;
  permissions: Record<ModuleKey, PermissionRow> | null;
  pendingInvitationsCount: number;
  unreadNotifications: number;
  roomId: string | null;
  storeName: string;
  toleranceThresholdRp: number;
}

/**
 * Mengambil snapshot sesi + RBAC + ruangan aktif secara efisien (minim round-trip DB).
 * Digunakan bersama oleh SSR layout, SSR auth pages, dan GET /api/auth/me.
 */
async function computeServerSessionSnapshot(): Promise<ServerSessionPayload> {
  await withDbRetry(() => ensureSystemBaseline());

  const user = await getCurrentSessionUser();

  if (!user) {
    const hasAssignedAdmin = await withDbRetry(() =>
      prisma.user.findFirst({
        where: {
          role: { in: ["PEMILIK", "MANAJER"] },
          isActive: true,
          isAssigned: true,
          roomId: { not: null },
        },
        select: { id: true },
      })
    );
    const hasAnyUser = hasAssignedAdmin
      ? true
      : Boolean(await withDbRetry(() => prisma.user.findFirst({ select: { id: true } })));

    return {
      authenticated: false,
      needsInitialSetup: !hasAssignedAdmin,
      hasAnyUser,
      user: null,
      permissions: null,
      pendingInvitationsCount: 0,
      unreadNotifications: 0,
      roomId: null,
      storeName: "TRASIR",
      toleranceThresholdRp: 50000,
    };
  }

  const now = new Date();

  if (!user.isAssigned || !user.roomId) {
    const [pendingInvitationsCount, hasAssignedAdmin] = await withDbRetry(() =>
      Promise.all([
        prisma.storeInvitation.count({
          where: {
            targetUserId: user.id,
            status: "PENDING",
            expiresAt: { gt: now },
          },
        }),
        prisma.user.findFirst({
          where: {
            role: { in: ["PEMILIK", "MANAJER"] },
            isActive: true,
            isAssigned: true,
            roomId: { not: null },
          },
          select: { id: true },
        }),
      ])
    );

    return {
      authenticated: true,
      needsInitialSetup: !hasAssignedAdmin,
      hasAnyUser: true,
      user,
      permissions: null,
      pendingInvitationsCount,
      unreadNotifications: pendingInvitationsCount,
      roomId: null,
      storeName: "Belum Tergabung ke Ruangan",
      toleranceThresholdRp: 50000,
    };
  }

  const activeRoomId = user.roomId;

  const adminRolesFilter = isStoreAdmin(user.role)
    ? [{ targetRole: null }, { targetRole: "PEMILIK" }, { targetRole: "MANAJER" }]
    : [{ targetRole: user.role }];

  const targetPermRoles =
    user.role === "KASIR_GUDANG" ? ["KASIR", "GUDANG", "KASIR_GUDANG"] : [user.role];

  const [room, permRows, unreadNotifications] = await withDbRetry(() =>
    Promise.all([
      prisma.room.findUnique({ where: { id: activeRoomId } }),
      isStoreAdmin(user.role)
        ? Promise.resolve([])
        : prisma.rolePermission.findMany({ where: { role: { in: targetPermRoles } } }),
      prisma.notification.count({
        where: {
          roomId: activeRoomId,
          isRead: false,
          OR: [
            { userId: user.id },
            {
              userId: null,
              OR: adminRolesFilter,
            },
          ],
        },
      }),
    ])
  );

  const permissions = composePermissionsMap(user.role, permRows);

  return {
    authenticated: true,
    needsInitialSetup: false,
    hasAnyUser: true,
    user,
    permissions,
    pendingInvitationsCount: 0,
    unreadNotifications,
    roomId: activeRoomId,
    storeName: room?.name ?? "TRASIR Ruangan Kerja",
    toleranceThresholdRp: room?.toleranceThresholdRp ?? 50000,
  };
}

const cachedServerSessionSnapshot =
  typeof cache === "function"
    ? cache(computeServerSessionSnapshot)
    : computeServerSessionSnapshot;

export async function getServerSessionSnapshot(): Promise<ServerSessionPayload> {
  if (process.env.SESSION_REQUEST_CACHE_DISABLED === "true") {
    return computeServerSessionSnapshot();
  }
  return cachedServerSessionSnapshot();
}
