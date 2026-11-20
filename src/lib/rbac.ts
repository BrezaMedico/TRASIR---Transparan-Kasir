import { prisma } from "./prisma";

export type UserRole = "PEMILIK" | "MANAJER" | "KASIR" | "GUDANG";
export type ModuleKey =
  | "dashboard"
  | "kasir"
  | "penjualan"
  | "pembelian"
  | "produk"
  | "inventaris"
  | "laporan"
  | "aktivitas"
  | "pengaturan";
export type PermissionAction = "view" | "create" | "edit" | "approve";

export interface PermissionRow {
  role: UserRole;
  module: ModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

export const ALL_ROLES: UserRole[] = ["PEMILIK", "MANAJER", "KASIR", "GUDANG"];
export const ALL_MODULES: { key: ModuleKey; label: string; path: string }[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "kasir", label: "Kasir (POS)", path: "/kasir" },
  { key: "penjualan", label: "Penjualan & Tutup Shift", path: "/penjualan" },
  { key: "pembelian", label: "Pembelian & Validasi Nota AI", path: "/pembelian" },
  { key: "produk", label: "Produk & Resep", path: "/produk" },
  { key: "inventaris", label: "Inventaris & Audit Stok", path: "/inventaris" },
  { key: "laporan", label: "Laporan Keuangan", path: "/laporan" },
  { key: "aktivitas", label: "Notifikasi & Log Aktivitas", path: "/aktivitas" },
  { key: "pengaturan", label: "Pengaturan Sistem", path: "/pengaturan" },
];

export const DEFAULT_PERMISSIONS: PermissionRow[] = [
  // PEMILIK: Penuh di seluruh modul
  ...ALL_MODULES.map((m) => ({
    role: "PEMILIK" as UserRole,
    module: m.key,
    canView: true,
    canCreate: true,
    canEdit: true,
    canApprove: true,
  })),
  // MANAJER: Pengawasan sesuai izin, namun canApprove = false secara default (sesuai catatan kewenangan PDF & blueprint)
  { role: "MANAJER", module: "dashboard", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "MANAJER", module: "kasir", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "MANAJER", module: "penjualan", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "MANAJER", module: "pembelian", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "MANAJER", module: "produk", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "MANAJER", module: "inventaris", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "MANAJER", module: "laporan", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "MANAJER", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "MANAJER", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
  // KASIR: Kasir POS Penuh, Riwayat & Shift Sendiri, Lihat Katalog, Stok Opname (Izin), Notifikasi & Profil Pribadi
  { role: "KASIR", module: "dashboard", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "kasir", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR", module: "penjualan", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "KASIR", module: "pembelian", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "produk", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "inventaris", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "KASIR", module: "laporan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
  // GUDANG: Ringkasan Stok di Dashboard, Input & Perbaikan Pembelian, Lihat & Tambah Produk, Inventaris Penuh (Ajukan & Opname), Notifikasi & Profil Pribadi
  { role: "GUDANG", module: "dashboard", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "kasir", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "penjualan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "pembelian", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "GUDANG", module: "produk", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "inventaris", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "GUDANG", module: "laporan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
];

export const DEFAULT_UNITS = [
  // Berat
  { name: "kg", label: "Kilogram (kg)", group: "BERAT" },
  { name: "g", label: "Gram (g)", group: "BERAT" },
  { name: "mg", label: "Miligram (mg)", group: "BERAT" },
  { name: "ton", label: "Ton", group: "BERAT" },
  // Volume
  { name: "liter", label: "Liter (l)", group: "VOLUME" },
  { name: "ml", label: "Mililiter (ml)", group: "VOLUME" },
  // Panjang
  { name: "meter", label: "Meter (m)", group: "PANJANG" },
  { name: "cm", label: "Sentimeter (cm)", group: "PANJANG" },
  // Hitungan
  { name: "pcs", label: "Pcs / Buah", group: "HITUNGAN" },
  { name: "dus", label: "Dus / Karton", group: "HITUNGAN" },
  { name: "pak", label: "Pak / Pack", group: "HITUNGAN" },
  { name: "botol", label: "Botol", group: "HITUNGAN" },
  { name: "bungkus", label: "Bungkus", group: "HITUNGAN" },
  { name: "sachet", label: "Sachet", group: "HITUNGAN" },
  { name: "butir", label: "Butir", group: "HITUNGAN" },
  { name: "ikat", label: "Ikat", group: "HITUNGAN" },
  { name: "renteng", label: "Renteng", group: "HITUNGAN" },
  { name: "lusin", label: "Lusin", group: "HITUNGAN" },
  { name: "kotak", label: "Kotak", group: "HITUNGAN" },
  { name: "kemasan", label: "Kemasan", group: "HITUNGAN" },
  { name: "karung", label: "Karung", group: "HITUNGAN" },
];

export async function ensureSystemBaseline(): Promise<void> {
  const [permCount, unitCount, whCount, catCount, existingSetting] = await Promise.all([
    prisma.rolePermission.count(),
    prisma.unit.count(),
    prisma.warehouse.count(),
    prisma.category.count(),
    prisma.systemSetting.findUnique({ where: { id: "default" } }),
  ]);

  const tasks: Promise<unknown>[] = [];

  if (permCount === 0) {
    tasks.push(
      prisma.rolePermission.createMany({ data: DEFAULT_PERMISSIONS }).catch(() => undefined)
    );
  }

  if (unitCount === 0) {
    tasks.push(
      prisma.unit.createMany({ data: DEFAULT_UNITS }).catch(() => undefined)
    );
  }

  if (whCount === 0) {
    tasks.push(
      prisma.warehouse
        .create({
          data: {
            name: "Gudang & Etalase Utama",
            location: "Toko Utama",
            isDefault: true,
          },
        })
        .catch(() => undefined)
    );
  }

  if (catCount === 0) {
    tasks.push(
      prisma.category
        .createMany({
          data: [
            {
              name: "Area Etalase Pelanggan",
              areaType: "TERBUKA",
              description: "Barang yang dapat diakses langsung oleh pelanggan.",
            },
            {
              name: "Gudang & Bahan Baku Dapur",
              areaType: "TERTUTUP",
              description: "Barang dan bahan baku yang hanya dapat diakses oleh pegawai.",
            },
          ],
        })
        .catch(() => undefined)
    );
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
}

export async function getRolePermissionsMap(role: UserRole): Promise<Record<ModuleKey, PermissionRow>> {
  await ensureSystemBaseline();
  const rows = await prisma.rolePermission.findMany({
    where: { role },
  });

  const map = {} as Record<ModuleKey, PermissionRow>;
  for (const mod of ALL_MODULES) {
    const found = rows.find((r) => r.module === mod.key);
    const fallback = DEFAULT_PERMISSIONS.find((d) => d.role === role && d.module === mod.key)!;
    map[mod.key] = {
      role,
      module: mod.key,
      canView: role === "PEMILIK" ? true : (found?.canView ?? fallback.canView),
      canCreate: role === "PEMILIK" ? true : (found?.canCreate ?? fallback.canCreate),
      canEdit: role === "PEMILIK" ? true : (found?.canEdit ?? fallback.canEdit),
      canApprove: role === "PEMILIK" ? true : (found?.canApprove ?? fallback.canApprove),
    };
  }
  return map;
}

export async function checkUserPermission(
  role: string,
  moduleKey: ModuleKey,
  action: PermissionAction
): Promise<boolean> {
  if (role === "PEMILIK") return true;
  const map = await getRolePermissionsMap(role as UserRole);
  const perm = map[moduleKey];
  if (!perm) return false;
  if (action === "view") return perm.canView;
  if (action === "create") return perm.canCreate;
  if (action === "edit") return perm.canEdit;
  if (action === "approve") return perm.canApprove;
  return false;
}

export function getDefaultRedirectForRole(role: string): string {
  switch (role) {
    case "PEMILIK":
    case "MANAJER":
      return "/dashboard";
    case "KASIR":
      return "/kasir";
    case "GUDANG":
      return "/pembelian";
    default:
      return "/dashboard";
  }
}

