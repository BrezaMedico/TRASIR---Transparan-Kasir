-- Tahap 6: Skalabilitas — Tambah kolom receiptUrl (nullable) dan indeks paginasi/filter tanggal
-- Idempoten, tanpa penghapusan data maupun kolom lama.

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "receiptUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Purchase_roomId_createdAt_id_idx"
  ON "Purchase"("roomId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "Purchase_roomId_purchaseDate_idx"
  ON "Purchase"("roomId", "purchaseDate");

CREATE INDEX IF NOT EXISTS "Sale_roomId_createdAt_id_idx"
  ON "Sale"("roomId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "Sale_roomId_cashierId_createdAt_idx"
  ON "Sale"("roomId", "cashierId", "createdAt");

