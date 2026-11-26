-- Tahap 2A: Tambah tabel BackupLog untuk pencatatan status backup nyata (CRON & MANUAL).
-- Idempoten, tidak menghapus data atau kolom lama.
-- Rollback: jalankan rollback.sql pada direktori yang sama.

CREATE TABLE IF NOT EXISTS "BackupLog" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'CRON',
    "status" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BackupLog_roomId_createdAt_idx"
  ON "BackupLog"("roomId", "createdAt");

CREATE INDEX IF NOT EXISTS "BackupLog_roomId_triggerType_status_createdAt_idx"
  ON "BackupLog"("roomId", "triggerType", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BackupLog_roomId_fkey'
      AND conrelid = '"BackupLog"'::regclass
  ) THEN
    ALTER TABLE "BackupLog"
      ADD CONSTRAINT "BackupLog_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "Room"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

