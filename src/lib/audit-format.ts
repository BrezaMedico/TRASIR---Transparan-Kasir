import { formatNumber, formatRupiah } from "./format";
import { formatRoleLabel } from "./rbac-shared";

export interface FormattedAuditEntry {
  key: string;
  label: string;
  value: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  LOGIN: "Masuk Akun",
  ROOM_CREATED: "Pembuatan Ruangan",
  PEMBELIAN: "Pembelian & Nota",
  PENJUALAN: "Penjualan Kasir",
  PERUBAHAN_TRANSAKSI: "Perubahan Transaksi",
  PERUBAHAN_STOK: "Perubahan Stok",
  STOK_OPNAME: "Stok Opname",
  KATALOG: "Katalog & Produk",
  PRODUCT_REQUEST: "Pengajuan Barang",
  HAK_AKSES: "Hak Akses",
  PENGATURAN: "Pengaturan Toko",
  INVITATION_CREATED: "Undangan Tim",
  INVITATION_ACCEPTED: "Undangan Diterima",
  INVITATION_DECLINED: "Undangan Ditolak",
  INVITATION_REVOKED: "Undangan Dicabut",
  USER_ROLE_CHANGED: "Perubahan Jabatan",
  USER_ACCESS_REVOKED: "Pencabutan Akses",
};

const HIDDEN_KEYS = new Set([
  "id",
  "roomId",
  "batchId",
  "targetUserId",
  "reviewedById",
  "requestedById",
  "approvedProductId",
  "categoryId",
  "productId",
  "warehouseId",
  "createdAt",
  "updatedAt",
  "reviewedAt",
  "passwordHash",
  "variantsJson",
  "proofMimeType",
  "receiptHash",
  "receiptImageData",
  "aiAnalysisJson",
  "isRawMaterial",
]);

const FIELD_LABELS: Record<string, string> = {
  hasReceipt: "Lampiran Nota",
  receiptSource: "Sumber Nota",
  captureMethod: "Cara Input Nota",
  aiValidationStatus: "Status Cek AI",
  itemCount: "Jumlah Barang",
  count: "Jumlah Barang",
  processedCount: "Jumlah Barang",
  names: "Daftar Barang",
  invoiceNumber: "Nomor Nota",
  supplierName: "Toko / Pemasok",
  receiptNumber: "Nomor Struk",
  paymentMethod: "Pembayaran",
  totalAmount: "Total",
  systemGrandTotal: "Total Sistem",
  actualCashTotal: "Uang Tunai",
  actualDigitalTotal: "Pembayaran Non-Tunai",
  recordedGrandTotal: "Total Tercatat",
  discountAmount: "Diskon",
  totalCost: "Modal",
  sellPrice: "Harga Jual",
  costPrice: "Harga Modal",
  toleranceRp: "Batas Toleransi",
  currentStock: "Stok Saat Ini",
  stockBefore: "Stok Sebelumnya",
  systemStock: "Stok Sistem",
  physicalStock: "Stok Fisik",
  quantity: "Jumlah",
  totalCounted: "Barang Dihitung",
  anomalyCount: "Selisih Ditemukan",
  systemTxCount: "Jumlah Transaksi",
  updatedRows: "Aturan Hak Akses Diubah",
  openShiftAnomalyCount: "Transaksi Shift Terbuka",
  status: "Status",
  approvalStatus: "Status Persetujuan",
  decision: "Keputusan",
  saleStatus: "Status Transaksi",
  newSaleStatus: "Status Transaksi Baru",
  ownerDecision: "Keputusan Pemilik",
  rejectionReason: "Alasan",
  ownerNotes: "Catatan",
  reviewNotes: "Catatan",
  reason: "Alasan",
  notes: "Catatan",
  employeeExplanation: "Penjelasan Pegawai",
  stockUpdated: "Stok Diperbarui",
  stockRestored: "Stok Dikembalikan",
  stockSynced: "Stok Disamakan",
  hasProof: "Bukti Foto",
  isActive: "Status Akun",
  isAssigned: "Status Ruangan",
  role: "Jabatan",
  oldRole: "Jabatan Lama",
  newRole: "Jabatan Baru",
  assignedRole: "Jabatan",
  stockMethod: "Jenis Stok",
  adjustmentType: "Jenis Perubahan",
  amendmentType: "Jenis Perubahan",
  name: "Nama",
  sku: "Kode Barang",
  title: "Judul",
  storeName: "Nama Toko",
  roomName: "Nama Toko",
  username: "Username",
  targetUsername: "Username",
  ownerUsername: "Username Pemilik",
  email: "Email",
  code: "Kode Undangan",
  inviteCode: "Kode Undangan",
};

const RUPIAH_KEYS = new Set([
  "totalAmount",
  "systemGrandTotal",
  "actualCashTotal",
  "actualDigitalTotal",
  "recordedGrandTotal",
  "discountAmount",
  "totalCost",
  "sellPrice",
  "costPrice",
  "toleranceRp",
]);

const COUNT_KEYS = new Set([
  "currentStock",
  "stockBefore",
  "systemStock",
  "physicalStock",
  "quantity",
  "totalCounted",
  "anomalyCount",
  "systemTxCount",
  "updatedRows",
  "openShiftAnomalyCount",
]);

const STATUS_VALUE_LABELS: Record<string, string> = {
  MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
  PERLU_PERBAIKAN: "Perlu Perbaikan",
  PENDING: "Menunggu",
  REVOKED: "Dicabut",
  DECLINED: "Ditolak",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  TERIMA_PENJELASAN: "Penjelasan Diterima",
  PERLU_INVESTIGASI: "Perlu Diperiksa",
};

const AI_STATUS_VALUE_LABELS: Record<string, string> = {
  BELUM_DICEK: "Belum dicek",
  TANPA_NOTA: "Tanpa nota",
  SESUAI: "Cocok dengan nota",
  ADA_SELISIH: "Ada yang berbeda",
  NOTA_GANDA: "Nota ganda",
  TERINDIKASI_EDIT: "Perlu cek visual",
  GAGAL_CEK: "AI belum tersambung",
};

const ENUM_VALUE_LABELS: Record<string, string> = {
  FISIK: "Foto nota fisik",
  DIGITAL: "Nota digital",
  LIVE_CAMERA: "Foto kamera",
  DIGITAL_UPLOAD: "Unggah file",
  TANPA_NOTA: "Tanpa nota",
  TUNAI: "Tunai",
  QRIS: "QRIS",
  TRANSFER: "Transfer",
  DEBIT: "Debit",
  TETAP: "Satuan tetap",
  PECAH: "Pecah kemasan",
  RESEP: "Menu resep",
  PINDAH_GUDANG: "Pindah Gudang",
  RUSAK: "Rusak",
  KEDALUWARSA: "Kedaluwarsa",
  HILANG: "Hilang",
  DIKEMBALIKAN: "Dikembalikan",
  PEMBATALAN: "Pembatalan",
  RETUR: "Retur",
  PERUBAHAN: "Perubahan",
};

function toTitleCaseFromSnake(raw: string): string {
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function humanizeFieldKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isHiddenKey(key: string, isAdmin: boolean): boolean {
  if (HIDDEN_KEYS.has(key)) return true;
  if (!isAdmin && key === "aiValidationStatus") return true;
  if (
    key.endsWith("Id") ||
    key.endsWith("Hash") ||
    key.endsWith("Json") ||
    key.endsWith("Token") ||
    key.endsWith("Password") ||
    key.endsWith("ImageData")
  ) {
    return true;
  }
  return false;
}

function formatFieldValue(key: string, rawVal: unknown): string | null {
  if (rawVal === null || rawVal === undefined) return null;

  if (typeof rawVal === "string") {
    const trimmed = rawVal.trim();
    if (!trimmed) return null;

    if (key === "role" || key === "oldRole" || key === "newRole" || key === "assignedRole") {
      return formatRoleLabel(trimmed);
    }
    if (key === "aiValidationStatus") {
      return AI_STATUS_VALUE_LABELS[trimmed] || trimmed;
    }
    if (
      key === "status" ||
      key === "approvalStatus" ||
      key === "decision" ||
      key === "saleStatus" ||
      key === "newSaleStatus" ||
      key === "ownerDecision"
    ) {
      return STATUS_VALUE_LABELS[trimmed] || trimmed;
    }
    if (ENUM_VALUE_LABELS[trimmed]) {
      return ENUM_VALUE_LABELS[trimmed];
    }
    return trimmed;
  }

  if (typeof rawVal === "number") {
    if (!Number.isFinite(rawVal)) return null;
    if (key === "openShiftAnomalyCount" && rawVal === 0) return null;
    if (key === "itemCount" || key === "count" || key === "processedCount") {
      return `${formatNumber(rawVal)} barang`;
    }
    if (RUPIAH_KEYS.has(key)) {
      return formatRupiah(rawVal);
    }
    if (COUNT_KEYS.has(key)) {
      return formatNumber(rawVal);
    }
    return formatNumber(rawVal);
  }

  if (typeof rawVal === "boolean") {
    if (key === "hasReceipt") return rawVal ? "Ada" : "Tanpa nota";
    if (key === "hasProof") return rawVal ? "Ada" : "Tidak ada";
    if (key === "stockUpdated") return rawVal ? "Ya" : "Belum";
    if (key === "stockRestored" || key === "stockSynced") return rawVal ? "Ya" : "Tidak";
    if (key === "isActive") return rawVal ? "Aktif" : "Nonaktif";
    if (key === "isAssigned") return rawVal ? "Tergabung" : "Belum tergabung";
    return rawVal ? "Ya" : "Tidak";
  }

  if (Array.isArray(rawVal)) {
    const items = rawVal
      .map((v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : ""))
      .filter(Boolean);
    if (items.length === 0) return null;
    if (items.length <= 4) return items.join(", ");
    return `${items.slice(0, 4).join(", ")} (+${items.length - 4} lainnya)`;
  }

  // Sembunyikan objek bersarang agar tidak memunculkan dump teknis
  return null;
}

export function formatActionTypeLabel(actionType: string): string {
  if (!actionType) return "-";
  return ACTION_TYPE_LABELS[actionType] || toTitleCaseFromSnake(actionType);
}

export function formatAuditSnapshot(
  rawJson: string | null | undefined,
  options?: { isAdmin?: boolean }
): FormattedAuditEntry[] {
  if (!rawJson) return [];
  const trimmed = rawJson.trim();
  if (!trimmed) return [];

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return [{ key: "_text", label: "Keterangan", value: trimmed }];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }

    const isAdmin = options?.isAdmin ?? true;
    const entries: FormattedAuditEntry[] = [];
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (isHiddenKey(key, isAdmin)) continue;
      const formattedVal = formatFieldValue(key, val);
      if (formattedVal === null) continue;
      entries.push({
        key,
        label: humanizeFieldKey(key),
        value: formattedVal,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export function formatAuditChangePair(
  beforeJson: string | null | undefined,
  afterJson: string | null | undefined,
  options?: { isAdmin?: boolean }
): { beforeItems: FormattedAuditEntry[]; afterItems: FormattedAuditEntry[] } {
  const beforeAll = formatAuditSnapshot(beforeJson, options);
  const afterAll = formatAuditSnapshot(afterJson, options);

  if (beforeAll.length === 0 || afterAll.length === 0) {
    return { beforeItems: beforeAll, afterItems: afterAll };
  }

  // Jika keduanya berupa snapshot objek lengkap (misal 6+ field), tampilkan hanya yang berubah + konteks nama
  if (beforeAll.length + afterAll.length > 8) {
    const beforeMap = new Map(beforeAll.map((item) => [item.key, item]));
    const afterMap = new Map(afterAll.map((item) => [item.key, item]));

    const changedBefore: FormattedAuditEntry[] = [];
    const changedAfter: FormattedAuditEntry[] = [];

    for (const item of beforeAll) {
      const next = afterMap.get(item.key);
      if (next && next.value !== item.value) {
        changedBefore.push(item);
      } else if (!next) {
        changedBefore.push(item);
      }
    }

    for (const item of afterAll) {
      const prev = beforeMap.get(item.key);
      if ((prev && prev.value !== item.value) || !prev) {
        changedAfter.push(item);
      }
    }

    if (changedBefore.length > 0 || changedAfter.length > 0) {
      const nameItem = afterMap.get("name") || beforeMap.get("name");
      if (nameItem && !changedAfter.some((i) => i.key === "name")) {
        changedAfter.unshift(nameItem);
      }
      return { beforeItems: changedBefore, afterItems: changedAfter };
    }
  }

  return { beforeItems: beforeAll, afterItems: afterAll };
}

export function formatNotificationText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\bKASIR_GUDANG\b/g, "Kasir + Gudang")
    .replace(/\bPINDAH_GUDANG\b/g, "Pindah Gudang")
    .replace(/\bKEDALUWARSA\b/g, "Kedaluwarsa")
    .replace(/\bDIKEMBALIKAN\b/g, "Dikembalikan")
    .replace(/\bPERLU_PERBAIKAN\b/g, "Perlu Perbaikan")
    .replace(/\bPERLU PERBAIKAN\b/g, "Perlu Perbaikan")
    .replace(/\bDISETUJUI\b/g, "Disetujui")
    .replace(/\bDITOLAK\b/g, "Ditolak")
    .replace(/\bPEMBATALAN\b/g, "Pembatalan")
    .replace(/\bRETUR\b/g, "Retur")
    .replace(/\bPERUBAHAN\b/g, "Perubahan")
    .replace(/\bRUSAK\b/g, "Rusak")
    .replace(/\bHILANG\b/g, "Hilang")
    .replace(/\bPEMILIK\b/g, "Pemilik")
    .replace(/\bMANAJER\b/g, "Manajer")
    .replace(/\bKASIR\b/g, "Kasir")
    .replace(/\bGUDANG\b/g, "Gudang");
}
