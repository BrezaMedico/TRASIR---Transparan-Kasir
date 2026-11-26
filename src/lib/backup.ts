import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { prisma } from "@/lib/prisma";

export const BACKUP_RETENTION_LIMIT = 30;
export const BACKUP_STALE_HOURS = 36;

export interface ExportedRoomBackup {
  backupVersion: string;
  exportedAt: string;
  exportedBy: { id: string; name: string; role: string };
  room: unknown;
  data: Record<string, unknown>;
}

/**
 * Mengambil seluruh data inti sebuah ruangan untuk backup (batch <= 4 query paralel
 * agar aman terhadap PgBouncer pool limit).
 */
export async function exportRoomBackupPayload(
  roomId: string,
  exportedBy: { id: string; name: string; role: string }
): Promise<{ payload: ExportedRoomBackup; now: Date }> {
  const [room, users, rolePermissions, units] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.user.findMany({
      where: { roomId, isAssigned: true },
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
    prisma.category.findMany({ where: { roomId } }),
    prisma.warehouse.findMany({ where: { roomId } }),
    prisma.product.findMany({
      where: { roomId },
      include: { variants: { include: { ingredients: true } } },
    }),
    prisma.productRequest.findMany({ where: { roomId } }),
  ]);

  const [purchases, sales, amendments, shiftClosings] = await Promise.all([
    prisma.purchase.findMany({
      where: { roomId },
      include: { items: true },
    }),
    prisma.sale.findMany({
      where: { roomId },
      include: { items: true },
    }),
    prisma.saleAmendment.findMany({ where: { roomId } }),
    prisma.shiftClosing.findMany({
      where: { roomId },
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

  const [stockAdjustments, opnameSessions, auditLogs, counters, shifts] = await Promise.all([
    prisma.stockAdjustment.findMany({ where: { roomId } }),
    prisma.stockOpnameSession.findMany({
      where: { roomId },
      include: { items: true },
    }),
    prisma.auditLog.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.counter.findMany({ where: { roomId } }),
    prisma.shift.findMany({ where: { roomId }, orderBy: { openedAt: "desc" }, take: 500 }),
  ]);

  const now = new Date();
  return {
    now,
    payload: {
      backupVersion: "2.2.0",
      exportedAt: now.toISOString(),
      exportedBy,
      room,
      data: {
        users,
        rolePermissions,
        units,
        categories,
        warehouses,
        counters,
        products,
        productRequests,
        purchases,
        sales,
        amendments,
        shifts,
        shiftClosings,
        stockAdjustments,
        opnameSessions,
        auditLogs,
      },
    },
  };
}

export function compressBackupJson(payload: ExportedRoomBackup): Buffer {
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
}

async function uploadToVercelBlob(
  pathname: string,
  body: Buffer,
  token: string
): Promise<string> {
  const res = await fetch(`https://blob.vercel-storage.com/${encodeURI(pathname)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/gzip",
      "x-content-type": "application/gzip",
      "x-add-random-suffix": "1",
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Upload Vercel Blob gagal (HTTP ${res.status}): ${errText.slice(0, 160)}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Respon Vercel Blob tidak menyertakan URL file.");
  }
  return data.url;
}

async function deleteFromVercelBlob(urls: string[], token: string): Promise<void> {
  if (urls.length === 0) return;
  await fetch("https://blob.vercel-storage.com/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls }),
  }).catch(() => undefined);
}

/**
 * Menyimpan file backup terkompresi (.json.gz) ke Vercel Blob (jika BLOB_READ_WRITE_TOKEN diatur)
 * atau direktori lokal (jika BACKUP_STORAGE_DIR diatur). Fail-closed jika belum dikonfigurasi.
 */
export async function storeCompressedBackup(params: {
  roomId: string;
  timestampIso: string;
  compressed: Buffer;
}): Promise<{ storageUrl: string; provider: "VERCEL_BLOB" | "LOCAL_DIR" }> {
  const safeTs = params.timestampIso.replace(/[:.]/g, "-");
  const filename = `backups/${params.roomId}/trasir-backup-${safeTs}.json.gz`;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (blobToken) {
    const url = await uploadToVercelBlob(filename, params.compressed, blobToken);
    return { storageUrl: url, provider: "VERCEL_BLOB" };
  }

  const localDir = process.env.BACKUP_STORAGE_DIR?.trim();
  if (localDir) {
    const roomDir = path.join(localDir, params.roomId);
    fs.mkdirSync(roomDir, { recursive: true });
    const fullPath = path.join(roomDir, `trasir-backup-${safeTs}.json.gz`);
    fs.writeFileSync(fullPath, params.compressed);
    return { storageUrl: fullPath, provider: "LOCAL_DIR" };
  }

  throw new Error(
    "Penyimpanan backup belum dikonfigurasi (atur BLOB_READ_WRITE_TOKEN atau BACKUP_STORAGE_DIR)."
  );
}

/**
 * Mempertahankan maksimal `BACKUP_RETENTION_LIMIT` (30) backup cron sukses terbaru per ruangan.
 */
export async function enforceBackupRetention(roomId: string): Promise<number> {
  const allSuccess = await prisma.backupLog.findMany({
    where: { roomId, triggerType: "CRON", status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { id: true, storageUrl: true },
  });

  if (allSuccess.length <= BACKUP_RETENTION_LIMIT) return 0;

  const obsolete = allSuccess.slice(BACKUP_RETENTION_LIMIT);
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  const blobUrls: string[] = [];
  for (const row of obsolete) {
    if (!row.storageUrl) continue;
    if (row.storageUrl.startsWith("https://")) {
      blobUrls.push(row.storageUrl);
    } else if (fs.existsSync(row.storageUrl)) {
      try {
        fs.unlinkSync(row.storageUrl);
      } catch {
        // abaikan jika file lokal sudah dihapus
      }
    }
  }

  if (blobToken && blobUrls.length > 0) {
    await deleteFromVercelBlob(blobUrls, blobToken);
  }

  await prisma.backupLog.deleteMany({
    where: { id: { in: obsolete.map((o) => o.id) } },
  });

  return obsolete.length;
}

