-- Tahap 5: Desain data — Model Counter & Shift sungguhan, relasi Sale.shiftId/counterId,
-- backfill idempoten data historis, dan penegakan roomId NOT NULL pada tabel multi-tenant.
-- AMAN: Tidak menghapus kolom atau data lama (ShiftClosing & SystemSetting.openAreaPolicy dipertahankan).
-- Rollback: jalankan rollback.sql pada direktori yang sama.

-- 1. Buat tabel Counter
CREATE TABLE IF NOT EXISTS "Counter" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Counter_roomId_slug_key" ON "Counter"("roomId", "slug");
CREATE INDEX IF NOT EXISTS "Counter_roomId_isActive_idx" ON "Counter"("roomId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Counter_roomId_fkey' AND conrelid = '"Counter"'::regclass
  ) THEN
    ALTER TABLE "Counter"
      ADD CONSTRAINT "Counter_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Buat tabel Shift
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counterId" TEXT,
    "counterSlug" TEXT NOT NULL DEFAULT 'loket-1',
    "counterName" TEXT NOT NULL DEFAULT 'Loket 1',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "openingCashTotal" INTEGER NOT NULL DEFAULT 0,
    "closingCashTotal" INTEGER,
    "actualDigitalTotal" INTEGER NOT NULL DEFAULT 0,
    "operationalExpenseTotal" INTEGER NOT NULL DEFAULT 0,
    "expectedCashAtClose" INTEGER,
    "cashDifference" INTEGER NOT NULL DEFAULT 0,
    "systemTxCount" INTEGER NOT NULL DEFAULT 0,
    "systemCashTotal" INTEGER NOT NULL DEFAULT 0,
    "systemQrisTotal" INTEGER NOT NULL DEFAULT 0,
    "systemTransferTotal" INTEGER NOT NULL DEFAULT 0,
    "systemCardTotal" INTEGER NOT NULL DEFAULT 0,
    "systemGrandTotal" INTEGER NOT NULL DEFAULT 0,
    "openingDenominationsJson" TEXT,
    "closingDenominationsJson" TEXT,
    "operationalExpensesJson" TEXT,
    "openingNote" TEXT,
    "closingNote" TEXT,
    "previousShiftId" TEXT,
    "previousShiftClosingCash" INTEGER,
    "handoverSyncStatus" TEXT NOT NULL DEFAULT 'SHIFT_PERTAMA',
    "handoverDifference" INTEGER NOT NULL DEFAULT 0,
    "legacyShiftClosingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Shift_legacyShiftClosingId_key" ON "Shift"("legacyShiftClosingId");
CREATE INDEX IF NOT EXISTS "Shift_roomId_status_openedAt_idx" ON "Shift"("roomId", "status", "openedAt");
CREATE INDEX IF NOT EXISTS "Shift_roomId_userId_status_idx" ON "Shift"("roomId", "userId", "status");
CREATE INDEX IF NOT EXISTS "Shift_roomId_counterId_status_idx" ON "Shift"("roomId", "counterId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Shift_roomId_fkey' AND conrelid = '"Shift"'::regclass) THEN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Shift_userId_fkey' AND conrelid = '"Shift"'::regclass) THEN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Shift_counterId_fkey' AND conrelid = '"Shift"'::regclass) THEN
    ALTER TABLE "Shift" ADD CONSTRAINT "Shift_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Tambahkan shiftId & counterId (nullable) pada Sale
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "counterId" TEXT;

CREATE INDEX IF NOT EXISTS "Sale_shiftId_idx" ON "Sale"("shiftId");
CREATE INDEX IF NOT EXISTS "Sale_counterId_idx" ON "Sale"("counterId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sale_shiftId_fkey' AND conrelid = '"Sale"'::regclass) THEN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sale_counterId_fkey' AND conrelid = '"Sale"'::regclass) THEN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Pastikan default-room tersedia untuk backfill baris yatim sebelum SET NOT NULL
INSERT INTO "Room" ("id", "name", "address", "createdAt", "updatedAt")
SELECT 'default-room', 'TRASIR Toko Utama', 'Indonesia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Room" WHERE "id" = 'default-room')
  AND (
    EXISTS (SELECT 1 FROM "StoreInvitation" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Category" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Warehouse" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Product" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Purchase" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Sale" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "SaleAmendment" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "ShiftClosing" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "StockAdjustment" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "StockOpnameSession" WHERE "roomId" IS NULL) OR
    EXISTS (SELECT 1 FROM "Notification" WHERE "roomId" IS NULL)
  );

UPDATE "StoreInvitation" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Category" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Warehouse" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Product" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Purchase" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Sale" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "SaleAmendment" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "ShiftClosing" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "StockAdjustment" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "StockOpnameSession" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;
UPDATE "Notification" SET "roomId" = 'default-room' WHERE "roomId" IS NULL;

-- 5. Tegakkan NOT NULL pada roomId seluruh tabel operasional multi-tenant
ALTER TABLE "StoreInvitation" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Warehouse" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "SaleAmendment" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "ShiftClosing" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "StockAdjustment" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "StockOpnameSession" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "roomId" SET NOT NULL;

-- 6. Jalankan juga `npm run db:backfill-tahap5` untuk memindahkan seluruh konfigurasi loket
--    dari SystemSetting.openAreaPolicy -> Counter, ShiftClosing.notes -> Shift, dan menautkan
--    Sale.shiftId & Sale.counterId secara idempoten beserta laporan verifikasi.

