-- Rollback Tahap 1B: Hapus CHECK constraint stok non-negatif secara idempoten.
ALTER TABLE "Product"
  DROP CONSTRAINT IF EXISTS "Product_currentStock_non_negative_check";

