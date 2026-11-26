-- Rollback Tahap 6: Hapus indeks baru dan kolom receiptUrl (hanya jika tidak lagi dipakai)
-- Catatan: Pastikan receiptImageData belum dibersihkan sebelum menjalankan DROP COLUMN.

DROP INDEX IF EXISTS "Sale_roomId_cashierId_createdAt_idx";
DROP INDEX IF EXISTS "Sale_roomId_createdAt_id_idx";
DROP INDEX IF EXISTS "Purchase_roomId_purchaseDate_idx";
DROP INDEX IF EXISTS "Purchase_roomId_createdAt_id_idx";

ALTER TABLE "Purchase"
  DROP COLUMN IF EXISTS "receiptUrl";

