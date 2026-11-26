-- Rollback Tahap 5: Kembalikan kolom roomId ke nullable, lepas relasi Sale.shiftId/counterId,
-- dan hapus tabel baru Shift & Counter secara idempoten.
-- Seluruh data historis pada ShiftClosing dan SystemSetting tetap utuh karena tidak pernah dihapus.

ALTER TABLE "StoreInvitation" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Warehouse" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "SaleAmendment" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "ShiftClosing" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "StockAdjustment" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "StockOpnameSession" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "roomId" DROP NOT NULL;

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_shiftId_fkey";
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_counterId_fkey";
DROP INDEX IF EXISTS "Sale_shiftId_idx";
DROP INDEX IF EXISTS "Sale_counterId_idx";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "shiftId";
ALTER TABLE "Sale" DROP COLUMN IF EXISTS "counterId";

DROP TABLE IF EXISTS "Shift";
DROP TABLE IF EXISTS "Counter";

