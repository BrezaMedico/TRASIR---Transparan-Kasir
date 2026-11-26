-- Tahap 1B: Tambah CHECK constraint agar stok produk tidak pernah negatif.
-- Idempoten, tidak menghapus data apa pun.
-- Rollback: jalankan rollback.sql pada direktori yang sama:
--   ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_currentStock_non_negative_check";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_currentStock_non_negative_check'
      AND conrelid = '"Product"'::regclass
  ) THEN
    -- Pastikan baris historis yang telanjur < 0 (jika ada) tidak menggagalkan pemasangan constraint
    UPDATE "Product"
    SET "currentStock" = 0
    WHERE "currentStock" < 0;

    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_currentStock_non_negative_check"
      CHECK ("currentStock" >= 0);
  END IF;
END $$;

