# Rencana Migrasi Penyimpanan Nota Pembelian (Base64 → Vercel Blob)

Dokumen ini menjelaskan langkah migrasi bertahap tanpa downtime untuk memindahkan bukti nota pembelian dari kolom `Purchase.receiptImageData` (base64 inline di PostgreSQL) ke object storage **Vercel Blob** (`Purchase.receiptUrl`).

## Arsitektur Dual-Read (Aktif Sekarang)
1. **Endpoint daftar (`GET /api/purchases`)** tidak lagi memilih maupun mengirim `receiptImageData`. Daftar hanya mengembalikan metadata ringan (`hasReceipt`, `receiptUrl`, `captureMethod`, `aiValidationStatus`).
2. **Endpoint detail lampiran (`GET /api/purchases/[id]/receipt`)** mengembalikan `receiptUrl` terlebih dahulu jika sudah dimigrasi (`storageType: "OBJECT_STORAGE"`), atau fallback ke `receiptImageData` (`storageType: "INLINE_BASE64"`) untuk data historis.
3. Kolom `receiptImageData` ditandai `@deprecated` pada `prisma/schema.prisma` dan **tidak dihapus** hingga fase verifikasi selesai.

## Prosedur Migrasi Aman & Idempoten

### Tahap A — Dry Run (Audit Kandidat)
Jalankan pemindaian tanpa mengubah database maupun mengunggah file:
```bash
npm run db:migrate-receipts -- --dry-run
```
Catat jumlah `scanned`, `migrated` (kandidat valid), dan `skippedInvalid`.

### Tahap B — Migrasi Dual-Write (Tanpa Menghapus Base64)
Pastikan `BLOB_READ_WRITE_TOKEN` (Vercel Blob) sudah terpasang pada environment, lalu jalankan:
```bash
npm run db:migrate-receipts -- --batch-size=25
```
- Script bersifat **idempoten**: hanya memproses baris dengan `receiptUrl IS NULL` dan `receiptImageData != ''`.
- Path file deterministik (`receipts/<roomId>/<purchaseId>-<sha256>.<ext>`), sehingga eksekusi ulang setelah gangguan jaringan tidak menggandakan objek.
- Nilai `receiptImageData` tetap dipertahankan sebagai cadangan rollback.

### Tahap C — Verifikasi Sampel & Monitoring
1. Periksa bahwa `GET /api/purchases/[id]/receipt` mengembalikan `storageType: "OBJECT_STORAGE"` dan `receiptUrl` dapat diakses dari `ReceiptViewer`.
2. Pastikan `report.failed === 0` dan tidak ada baris `receiptUrl IS NULL` yang masih memiliki base64 valid.

### Tahap D — Pembersihan Base64 (Opsional, Setelah Verifikasi ≥ 7 Hari)
Setelah seluruh pembacaan produksi terkonfirmasi stabil dari object storage dan backup database terbaru tersimpan:
```bash
npm run db:migrate-receipts -- --clear-base64 --batch-size=25
```
(atau bersihkan `receiptImageData = ''` hanya pada baris yang sudah memiliki `receiptUrl IS NOT NULL`).

## Langkah Rollback
- **Selama Tahap B (sebelum pembersihan base64):** cukup jalankan `UPDATE "Purchase" SET "receiptUrl" = NULL;` (atau rollback migrasi pada `prisma/migrations/20261126220000_tahap6_pagination_indexes_and_receipt_url/rollback.sql`). Seluruh nota otomatis kembali terbaca dari `receiptImageData`.
- **Setelah Tahap D:** restore snapshot database pra-pembersihan atau unduh ulang file dari Vercel Blob berdasarkan `receiptUrl`.

