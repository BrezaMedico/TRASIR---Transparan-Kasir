export type UserRole = "PEMILIK" | "MANAJER" | "KASIR" | "GUDANG" | "KASIR_GUDANG";
export type InvitableRole = "MANAJER" | "KASIR" | "GUDANG" | "KASIR_GUDANG";
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

export const ALL_ROLES: UserRole[] = [
  "PEMILIK",
  "MANAJER",
  "KASIR",
  "GUDANG",
  "KASIR_GUDANG",
];
export const INVITABLE_ROLES: InvitableRole[] = [
  "KASIR",
  "GUDANG",
  "KASIR_GUDANG",
  "MANAJER",
];
export const ADMIN_ROLES: UserRole[] = ["PEMILIK", "MANAJER"];
export const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

export const ROLE_LABELS: Record<UserRole, string> = {
  PEMILIK: "Pemilik",
  MANAJER: "Manajer",
  KASIR: "Kasir",
  GUDANG: "Gudang",
  KASIR_GUDANG: "Kasir + Gudang",
};

export function formatRoleLabel(role?: string | null): string {
  if (!role) return "-";
  return ROLE_LABELS[role as UserRole] || role;
}

export function isStoreAdmin(role?: string | null): boolean {
  return role === "PEMILIK" || role === "MANAJER";
}

export function canViewFinancials(role?: string | null): boolean {
  return role === "PEMILIK" || role === "MANAJER";
}

export function hasKasirAccess(role?: string | null): boolean {
  return role === "PEMILIK" || role === "MANAJER" || role === "KASIR" || role === "KASIR_GUDANG";
}

export function hasGudangAccess(role?: string | null): boolean {
  return role === "PEMILIK" || role === "MANAJER" || role === "GUDANG" || role === "KASIR_GUDANG";
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, normalized: "", error: "Username wajib diisi." };
  }
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed.toLowerCase(),
      error: "Username tidak boleh mengandung spasi.",
    };
  }
  const normalized = trimmed.toLowerCase();
  if (!USERNAME_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error:
        "Username harus 3-32 karakter (huruf kecil, angka, titik, garis bawah, atau tanda hubung).",
    };
  }
  return { valid: true, normalized };
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `TRS-${part1}-${part2}`;
}

export interface RoleManagementCheckResult {
  allowed: boolean;
  status?: number;
  error?: string;
}

/**
 * Validasi otorisasi manajemen pengguna oleh Pemilik atau Manajer.
 * Aturan perlindungan akun Pemilik:
 * - Hanya Pemilik atau Manajer yang berwenang.
 * - Manajer TIDAK BOLEH mengubah, menurunkan, menonaktifkan, atau mencabut akses akun Pemilik.
 * - Manajer TIDAK BOLEH memberikan role Pemilik kepada pengguna lain.
 */
export function validateRoleManagementAction(params: {
  actorRole: string;
  targetCurrentRole?: string | null;
  targetNextRole?: string | null;
  action: "CHANGE_ROLE" | "REVOKE" | "DEACTIVATE" | "CREATE_USER";
}): RoleManagementCheckResult {
  if (!isStoreAdmin(params.actorRole)) {
    return {
      allowed: false,
      status: 403,
      error: "Hanya Pemilik atau Manajer yang berwenang mengelola hak akses anggota ruangan.",
    };
  }

  if (params.actorRole === "MANAJER") {
    if (params.targetCurrentRole === "PEMILIK") {
      return {
        allowed: false,
        status: 403,
        error:
          "Manajer tidak diizinkan mengubah, menurunkan, menonaktifkan, atau mencabut akses akun Pemilik.",
      };
    }
    if (params.targetNextRole === "PEMILIK") {
      return {
        allowed: false,
        status: 403,
        error: "Manajer tidak diizinkan memberikan role Pemilik kepada pengguna lain.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Mencegah hilangnya satu-satunya akun Pemilik aktif dalam sebuah ruangan.
 */
export function hasMinimumRemainingOwners(
  activeOwnerCount: number,
  targetIsActiveOwner: boolean,
  nextIsActiveOwner: boolean
): boolean {
  if (!targetIsActiveOwner || nextIsActiveOwner) {
    return true;
  }
  return activeOwnerCount - 1 >= 1;
}

export function hasMinimumRemainingAdmins(
  activeAdminCount: number,
  targetIsActiveAdmin: boolean,
  nextIsActiveAdmin: boolean
): boolean {
  if (!targetIsActiveAdmin || nextIsActiveAdmin) {
    return true;
  }
  return activeAdminCount - 1 >= 1;
}

export function sanitizeInternalRedirect(
  redirectParam: string | null | undefined,
  fallback: string
): string {
  if (!redirectParam) return fallback;
  const trimmed = redirectParam.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  return trimmed;
}

export const ALL_MODULES: { key: ModuleKey; label: string; path: string }[] = [
  { key: "dashboard", label: "Dashboard & Keuntungan", path: "/dashboard" },
  { key: "kasir", label: "Kasir (POS)", path: "/kasir" },
  { key: "penjualan", label: "Riwayat Transaksi", path: "/penjualan" },
  { key: "pembelian", label: "Pembelian & Validasi Nota AI", path: "/pembelian" },
  { key: "produk", label: "Produk & Stok", path: "/produk" },
  { key: "inventaris", label: "Inventaris & Audit Stok", path: "/inventaris" },
  { key: "laporan", label: "Laporan Keuangan", path: "/laporan" },
  { key: "aktivitas", label: "Notifikasi & Log Aktivitas", path: "/aktivitas" },
  { key: "pengaturan", label: "Pengaturan Sistem", path: "/pengaturan" },
];

export const DEFAULT_PERMISSIONS: PermissionRow[] = [
  // PEMILIK: Akses penuh 100% di seluruh modul
  ...ALL_MODULES.map((m) => ({
    role: "PEMILIK" as UserRole,
    module: m.key,
    canView: true,
    canCreate: true,
    canEdit: true,
    canApprove: true,
  })),
  // MANAJER: Disetarakan 100% secara operasional dengan PEMILIK (perlindungan akun Pemilik ditegakkan khusus di backend)
  ...ALL_MODULES.map((m) => ({
    role: "MANAJER" as UserRole,
    module: m.key,
    canView: true,
    canCreate: true,
    canEdit: true,
    canApprove: true,
  })),
  // KASIR: Kasir POS, Riwayat & Tutup Shift, Lihat Katalog Produk (tanpa tambah/ubah barang), Inventaris Opname, Aktivitas, Pengaturan Pribadi
  { role: "KASIR", module: "dashboard", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "kasir", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR", module: "penjualan", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "KASIR", module: "pembelian", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "produk", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "inventaris", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "KASIR", module: "laporan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
  // GUDANG: Pembelian, Katalog Produk & Ajukan Produk Baru, Inventaris Penuh, Aktivitas, Pengaturan Pribadi
  { role: "GUDANG", module: "dashboard", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "kasir", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "penjualan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "pembelian", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "GUDANG", module: "produk", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "GUDANG", module: "inventaris", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "GUDANG", module: "laporan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "GUDANG", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
  // KASIR_GUDANG: Gabungan penuh hak akses KASIR + GUDANG (tetap tanpa akses dashboard/laporan keuangan atau persetujuan admin)
  { role: "KASIR_GUDANG", module: "dashboard", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR_GUDANG", module: "kasir", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR_GUDANG", module: "penjualan", canView: true, canCreate: true, canEdit: false, canApprove: false },
  { role: "KASIR_GUDANG", module: "pembelian", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR_GUDANG", module: "produk", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR_GUDANG", module: "inventaris", canView: true, canCreate: true, canEdit: true, canApprove: false },
  { role: "KASIR_GUDANG", module: "laporan", canView: false, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR_GUDANG", module: "aktivitas", canView: true, canCreate: false, canEdit: false, canApprove: false },
  { role: "KASIR_GUDANG", module: "pengaturan", canView: true, canCreate: false, canEdit: false, canApprove: false },
];

export const DEFAULT_UNITS = [
  { name: "kg", label: "Kilogram (kg)", group: "BERAT" },
  { name: "g", label: "Gram (g)", group: "BERAT" },
  { name: "mg", label: "Miligram (mg)", group: "BERAT" },
  { name: "ton", label: "Ton", group: "BERAT" },
  { name: "liter", label: "Liter (l)", group: "VOLUME" },
  { name: "ml", label: "Mililiter (ml)", group: "VOLUME" },
  { name: "meter", label: "Meter (m)", group: "PANJANG" },
  { name: "cm", label: "Sentimeter (cm)", group: "PANJANG" },
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

export const DEFAULT_ROOM_ID = "default-room";

export function composePermissionsMap(
  role: UserRole,
  rows: { role: string; module: string; canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean }[]
): Record<ModuleKey, PermissionRow> {
  const admin = isStoreAdmin(role);
  const map = {} as Record<ModuleKey, PermissionRow>;

  for (const mod of ALL_MODULES) {
    if (admin) {
      map[mod.key] = {
        role,
        module: mod.key,
        canView: true,
        canCreate: true,
        canEdit: true,
        canApprove: true,
      };
      continue;
    }

    // Keuangan (dashboard & laporan) dan persetujuan admin selalu tertutup untuk role non-admin
    const isFinancialModule = mod.key === "dashboard" || mod.key === "laporan";

    if (role === "KASIR_GUDANG") {
      const kasirRow =
        rows.find((r) => r.role === "KASIR" && r.module === mod.key) ||
        DEFAULT_PERMISSIONS.find((d) => d.role === "KASIR" && d.module === mod.key)!;
      const gudangRow =
        rows.find((r) => r.role === "GUDANG" && r.module === mod.key) ||
        DEFAULT_PERMISSIONS.find((d) => d.role === "GUDANG" && d.module === mod.key)!;
      const directRow = rows.find((r) => r.role === "KASIR_GUDANG" && r.module === mod.key);

      map[mod.key] = {
        role,
        module: mod.key,
        canView: isFinancialModule
          ? false
          : Boolean(kasirRow.canView || gudangRow.canView || directRow?.canView),
        canCreate: isFinancialModule
          ? false
          : Boolean(kasirRow.canCreate || gudangRow.canCreate || directRow?.canCreate),
        canEdit: isFinancialModule
          ? false
          : Boolean(kasirRow.canEdit || gudangRow.canEdit || directRow?.canEdit),
        canApprove: false,
      };
      continue;
    }

    const found = rows.find((r) => r.role === role && r.module === mod.key);
    const fallback =
      DEFAULT_PERMISSIONS.find((d) => d.role === role && d.module === mod.key) || {
        role,
        module: mod.key,
        canView: false,
        canCreate: false,
        canEdit: false,
        canApprove: false,
      };

    map[mod.key] = {
      role,
      module: mod.key,
      canView: isFinancialModule ? false : (found?.canView ?? fallback.canView),
      canCreate: isFinancialModule ? false : (found?.canCreate ?? fallback.canCreate),
      canEdit: isFinancialModule ? false : (found?.canEdit ?? fallback.canEdit),
      canApprove: false,
    };
  }

  return map;
}

export function getDefaultRedirectForRole(role: string, isAssigned = true): string {
  if (!isAssigned) {
    return "/menunggu-undangan";
  }
  switch (role) {
    case "PEMILIK":
    case "MANAJER":
      return "/dashboard";
    case "KASIR":
    case "KASIR_GUDANG":
      return "/kasir";
    case "GUDANG":
      return "/inventaris";
    default:
      return "/dashboard";
  }
}
