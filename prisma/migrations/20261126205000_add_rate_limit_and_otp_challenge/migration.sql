-- Tahap 3: Tabel bersama RateLimitEntry & OtpChallenge untuk rate limit & OTP lockout lintas instance serverless.
-- Idempoten, tidak menghapus data atau kolom lama.
-- Rollback: jalankan rollback.sql pada direktori yang sama.

CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RateLimitEntry_key_key"
  ON "RateLimitEntry"("key");

CREATE INDEX IF NOT EXISTS "RateLimitEntry_resetAt_idx"
  ON "RateLimitEntry"("resetAt");

CREATE TABLE IF NOT EXISTS "OtpChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'email-change',
    "userId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OtpChallenge_tokenHash_key"
  ON "OtpChallenge"("tokenHash");

CREATE INDEX IF NOT EXISTS "OtpChallenge_expiresAt_idx"
  ON "OtpChallenge"("expiresAt");

CREATE INDEX IF NOT EXISTS "OtpChallenge_userId_purpose_idx"
  ON "OtpChallenge"("userId", "purpose");

