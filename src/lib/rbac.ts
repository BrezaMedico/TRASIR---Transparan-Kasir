import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  canViewFinancials,
  composePermissionsMap,
  DEFAULT_PERMISSIONS,
  DEFAULT_ROOM_ID,
  DEFAULT_UNITS,
  isStoreAdmin,
  type ModuleKey,
  type PermissionAction,
  type PermissionRow,
  type UserRole,
} from "./rbac-shared";

export * from "./rbac-shared";

const globalForRbac = globalThis as unknown as {
  __trasirBaselineDone?: boolean;
  __trasirBaselinePromise?: Promise<void> | null;
  __trasirSeededRooms?: Set<string>;
};

function getSeededRoomsSet(): Set<string> {
  if (!globalForRbac.__trasirSeededRooms) {
    globalForRbac.__trasirSeededRooms = new Set<string>();
  }
  return globalForRbac.__trasirSeededRooms;
}

/**
 * Mengisi kategori dan gudang bawaan untuk sebuah ruangan baru agar langsung siap beroperasi.
 */
export async function seedRoomDefaults(
  tx: Prisma.TransactionClient | typeof prisma,
  roomId: string
): Promise<void> {
  const cacheDisabled = process.env.RBAC_CACHE_DISABLED === "true";
  const seededRooms = getSeededRoomsSet();
  if (!cacheDisabled && tx === prisma && seededRooms.has(roomId)) {
    return;
  }

  const [existingWh, existingCat] = await Promise.all([
    tx.warehouse.findFirst({ where: { roomId }, select: { id: true } }),
    tx.category.findFirst({ where: { roomId }, select: { id: true } }),
  ]);

  if (!existingWh) {
    await tx.warehouse
      .create({
        data: {
          roomId,
          name: "Gudang & Etalase Utama",
          location: "Area Utama",
          isDefault: true,
        },
      })
      .catch(() => undefined);
  }

  if (!existingCat) {
    await tx.category
      .createMany({
        data: [
          {
            roomId,
            name: "Area Etalase Pelanggan",
            areaType: "TERBUKA",
            description: "Barang yang dapat diakses langsung oleh pelanggan.",
          },
          {
            roomId,
            name: "Gudang & Bahan Baku Dapur",
            areaType: "TERTUTUP",
            description: "Barang dan bahan baku yang hanya dapat diakses oleh pegawai.",
          },
        ],
      })
      .catch(() => undefined);
  }

  if (!cacheDisabled && tx === prisma) {
    seededRooms.add(roomId);
  }
}

export function resetBaselineCache(): void {
  globalForRbac.__trasirBaselineDone = false;
  globalForRbac.__trasirBaselinePromise = null;
  globalForRbac.__trasirSeededRooms?.clear();
}

export async function ensureSystemBaseline(): Promise<void> {
  const cacheDisabled = process.env.RBAC_CACHE_DISABLED === "true";
  if (!cacheDisabled && globalForRbac.__trasirBaselineDone) {
    return;
  }
  if (!cacheDisabled && globalForRbac.__trasirBaselinePromise) {
    return globalForRbac.__trasirBaselinePromise;
  }

  const run = async () => {
    // Batch ringan (maks 2 query paralel) agar aman terhadap pool koneksi PgBouncer
    const [permRows, existingRoom] = await Promise.all([
      prisma.rolePermission.findMany({
        select: {
          role: true,
          module: true,
          canView: true,
          canCreate: true,
          canEdit: true,
          canApprove: true,
        },
      }),
      prisma.room.findFirst({ select: { id: true } }),
    ]);

    const [existingUnit, existingSetting] = await Promise.all([
      prisma.unit.findFirst({ select: { id: true } }),
      prisma.systemSetting.findUnique({ where: { id: "default" } }),
    ]);

    const [legacyAssignedUser] = await Promise.all([
      prisma.user.findFirst({ where: { isAssigned: true, roomId: null }, select: { id: true } }),
    ]);

    const existingKeys = new Set(permRows.map((p) => `${p.role}::${p.module}`));
    const missingPerms = DEFAULT_PERMISSIONS.filter(
      (d) => !existingKeys.has(`${d.role}::${d.module}`)
    );
    const managerNeedsSync = permRows.some(
      (p) =>
        p.role === "MANAJER" &&
        (!p.canView || !p.canCreate || !p.canEdit || !p.canApprove)
    );
    const kasirProductRow = permRows.find(
      (p) => p.role === "KASIR" && p.module === "produk"
    );
    const kasirNeedsSync = Boolean(
      kasirProductRow && (kasirProductRow.canCreate || kasirProductRow.canEdit)
    );
    const gudangNeedsSync = permRows.some(
      (p) =>
        p.role === "GUDANG" &&
        (p.module === "kasir" || p.module === "penjualan") &&
        (p.canView || p.canCreate || p.canEdit || p.canApprove)
    );

    const tasks: Promise<unknown>[] = [];

    if (missingPerms.length > 0) {
      tasks.push(
        prisma.rolePermission.createMany({ data: missingPerms }).catch(() => undefined)
      );
    }

    if (managerNeedsSync) {
      tasks.push(
        prisma.rolePermission
          .updateMany({
            where: {
              role: "MANAJER",
              OR: [
                { canView: false },
                { canCreate: false },
                { canEdit: false },
                { canApprove: false },
              ],
            },
            data: {
              canView: true,
              canCreate: true,
              canEdit: true,
              canApprove: true,
            },
          })
          .catch(() => undefined)
      );
    }

    if (kasirNeedsSync) {
      tasks.push(
        prisma.rolePermission
          .updateMany({
            where: {
              role: "KASIR",
              module: "produk",
              OR: [{ canCreate: true }, { canEdit: true }],
            },
            data: { canCreate: false, canEdit: false },
          })
          .catch(() => undefined)
      );
    }

    if (gudangNeedsSync) {
      tasks.push(
        prisma.rolePermission
          .updateMany({
            where: {
              role: "GUDANG",
              module: { in: ["kasir", "penjualan"] },
            },
            data: {
              canView: false,
              canCreate: false,
              canEdit: false,
              canApprove: false,
            },
          })
          .catch(() => undefined)
      );
    }

    if (!existingUnit) {
      tasks.push(prisma.unit.createMany({ data: DEFAULT_UNITS }).catch(() => undefined));
    }

    if (!existingSetting) {
      tasks.push(
        prisma.systemSetting
          .upsert({
            where: { id: "default" },
            update: {},
            create: {
              id: "default",
              storeName: "TRASIR Toko Utama",
              storeAddress: "Indonesia",
              toleranceThresholdRp: 50000,
              opnameSchedule: "MINGGUAN",
            },
          })
          .catch(() => undefined)
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    // Migrasi aman data pengguna lama (sebelum sistem multi-ruangan) agar akun historis tetap terjaga
    const hasLegacyData = Boolean(legacyAssignedUser);
    const needsDefaultRoom = hasLegacyData || !existingRoom;

    if (needsDefaultRoom) {
      const settingNow =
        existingSetting || (await prisma.systemSetting.findUnique({ where: { id: "default" } }));
      const defaultRoom = await prisma.room.upsert({
        where: { id: DEFAULT_ROOM_ID },
        update: {},
        create: {
          id: DEFAULT_ROOM_ID,
          name: settingNow?.storeName || "TRASIR Toko Utama",
          address: settingNow?.storeAddress || "Indonesia",
          toleranceThresholdRp: settingNow?.toleranceThresholdRp ?? 50000,
          opnameSchedule: settingNow?.opnameSchedule ?? "MINGGUAN",
          openAreaPolicy:
            settingNow?.openAreaPolicy ??
            "Evaluasi faktor eksternal (pelanggan/kerusakan fisik) sebelum tindak lanjut internal.",
          closedAreaPolicy:
            settingNow?.closedAreaPolicy ??
            "Evaluasi ketat berbasis log akses pegawai, bukti foto, dan kronologi shift.",
          autoBackupInterval: settingNow?.autoBackupInterval ?? "HARIAN",
          lastBackupAt: settingNow?.lastBackupAt ?? null,
        },
      });

      if (hasLegacyData) {
        const roomData = { roomId: defaultRoom.id };
        await prisma.user.updateMany({ where: { isAssigned: true, roomId: null }, data: roomData });
        await prisma.auditLog.updateMany({ where: { roomId: null }, data: roomData });
      }

      await seedRoomDefaults(prisma, defaultRoom.id);
    }

    if (!cacheDisabled) {
      globalForRbac.__trasirBaselineDone = true;
    }
  };

  if (cacheDisabled) {
    await run();
    return;
  }

  const promise = run()
    .catch((err) => {
      globalForRbac.__trasirBaselineDone = false;
      globalForRbac.__trasirBaselinePromise = null;
      throw err;
    })
    .finally(() => {
      if (globalForRbac.__trasirBaselineDone) {
        globalForRbac.__trasirBaselinePromise = null;
      }
    });

  globalForRbac.__trasirBaselinePromise = promise;
  return promise;
}

export async function getRolePermissionsMap(
  role: UserRole
): Promise<Record<ModuleKey, PermissionRow>> {
  await ensureSystemBaseline();
  if (isStoreAdmin(role)) {
    return composePermissionsMap(role, []);
  }

  const targetRoles = role === "KASIR_GUDANG" ? ["KASIR", "GUDANG", "KASIR_GUDANG"] : [role];
  const rows = await prisma.rolePermission.findMany({
    where: { role: { in: targetRoles } },
  });

  return composePermissionsMap(role, rows);
}

export async function checkUserPermission(
  role: string,
  moduleKey: ModuleKey,
  action: PermissionAction
): Promise<boolean> {
  if (isStoreAdmin(role)) return true;
  if ((moduleKey === "dashboard" || moduleKey === "laporan") && !canViewFinancials(role)) {
    return false;
  }
  const map = await getRolePermissionsMap(role as UserRole);
  const perm = map[moduleKey];
  if (!perm) return false;
  if (action === "view") return perm.canView;
  if (action === "create") return perm.canCreate;
  if (action === "edit") return perm.canEdit;
  if (action === "approve") return perm.canApprove;
  return false;
}
