-- Rollback Tahap 3: Hapus tabel RateLimitEntry dan OtpChallenge secara idempoten.
DROP TABLE IF EXISTS "OtpChallenge";
DROP TABLE IF EXISTS "RateLimitEntry";

