-- Rollback Tahap 4: Hapus kolom mustChangePassword secara idempoten.
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "mustChangePassword";

