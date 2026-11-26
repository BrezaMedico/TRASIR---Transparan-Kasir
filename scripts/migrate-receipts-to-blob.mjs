import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function parseDataUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const match = raw.trim().match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) return null;
  return { mimeType, ext, buffer };
}

async function defaultVercelBlobUploader({ pathname, buffer, mimeType, token }) {
  const res = await fetch(`https://blob.vercel-storage.com/${encodeURI(pathname)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
      "x-content-type": mimeType,
      "x-add-random-suffix": "0",
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Upload Vercel Blob gagal (HTTP ${res.status}): ${errText.slice(0, 160)}`);
  }
  const data = await res.json();
  if (!data?.url) {
    throw new Error("Respon Vercel Blob tidak menyertakan URL.");
  }
  return data.url;
}

/**
 * Memigrasikan lampiran nota base64 (`Purchase.receiptImageData`) ke object storage (`Purchase.receiptUrl`)
 * secara idempoten per batch.
 *
 * - Default (`clearBase64 = false`): menyimpan `receiptUrl` tanpa menghapus `receiptImageData`
 *   sehingga rollback 100% aman sebelum fase pembersihan.
 * - `dryRun = true`: hanya memindai dan menghitung kandidat migrasi tanpa menulis ke storage/DB.
 */
export async function migratePurchaseReceiptsToStorage(
  prisma,
  options = {}
) {
  const {
    dryRun = false,
    batchSize = 25,
    clearBase64 = false,
    blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() || "",
    localStorageDir = process.env.RECEIPT_STORAGE_DIR?.trim() || "",
    uploader,
  } = options;

  const report = {
    dryRun,
    clearBase64,
    scanned: 0,
    migrated: 0,
    skippedInvalid: 0,
    clearedBase64: 0,
    failed: 0,
    errors: [],
  };

  let cursorId = null;

  while (true) {
    const candidates = await prisma.purchase.findMany({
      where: {
        receiptUrl: null,
        NOT: { receiptImageData: "" },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      select: {
        id: true,
        roomId: true,
        receiptImageData: true,
        receiptHash: true,
      },
      orderBy: { id: "asc" },
      take: Math.max(1, Math.min(batchSize, 100)),
    });

    if (candidates.length === 0) break;
    cursorId = candidates[candidates.length - 1].id;

    for (const row of candidates) {
      report.scanned += 1;
      const parsed = parseDataUrl(row.receiptImageData);
      if (!parsed) {
        report.skippedInvalid += 1;
        continue;
      }

      if (dryRun) {
        report.migrated += 1;
        continue;
      }

      const contentHash =
        row.receiptHash ||
        crypto.createHash("sha256").update(parsed.buffer).digest("hex").slice(0, 32);
      const pathname = `receipts/${row.roomId}/${row.id}-${contentHash}.${parsed.ext}`;

      try {
        let storageUrl;
        if (typeof uploader === "function") {
          storageUrl = await uploader({
            pathname,
            buffer: parsed.buffer,
            mimeType: parsed.mimeType,
            purchaseId: row.id,
          });
        } else if (blobToken) {
          storageUrl = await defaultVercelBlobUploader({
            pathname,
            buffer: parsed.buffer,
            mimeType: parsed.mimeType,
            token: blobToken,
          });
        } else if (localStorageDir) {
          const fullPath = path.join(localStorageDir, pathname);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, parsed.buffer);
          storageUrl = `file://${fullPath.replace(/\\/g, "/")}`;
        } else {
          throw new Error(
            "Storage belum dikonfigurasi. Atur BLOB_READ_WRITE_TOKEN (Vercel Blob) atau RECEIPT_STORAGE_DIR."
          );
        }

        await prisma.purchase.update({
          where: { id: row.id },
          data: {
            receiptUrl: storageUrl,
            receiptHash: contentHash,
            ...(clearBase64 ? { receiptImageData: "" } : {}),
          },
        });
        report.migrated += 1;
        if (clearBase64) {
          report.clearedBase64 += 1;
        }
      } catch (err) {
        report.failed += 1;
        report.errors.push({
          purchaseId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const clearBase64 = args.has("--clear-base64");
  const batchArg = process.argv.find((a) => a.startsWith("--batch-size="));
  const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1], 10) || 25 : 25;

  const prisma = new PrismaClient();
  migratePurchaseReceiptsToStorage(prisma, { dryRun, clearBase64, batchSize })
    .then((report) => {
      console.log(JSON.stringify({ ok: report.failed === 0, report }, null, 2));
      if (report.failed > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error("Migrasi foto nota gagal:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

