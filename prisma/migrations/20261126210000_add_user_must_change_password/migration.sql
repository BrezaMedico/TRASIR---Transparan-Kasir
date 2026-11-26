-- Tahap 4: Tambah kolom mustChangePassword pada tabel User untuk memaksa pembaruan kata sandi lama (<10 karakter / sandi umum) pada login berikutnya.
-- Idempoten, tidak menghapus data atau kolom lama.
-- Rollback: jalankan rollback.sql pada direktori yang sama.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

