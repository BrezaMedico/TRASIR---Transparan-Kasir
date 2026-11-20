# TRASIR (Transparan Kasir) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi web full-stack TRASIR (Transparan Kasir) skala produksi yang mencakup 11 halaman inti (Halaman 0–10), RBAC 4 jabatan granular, Kasir (POS) dengan 3 metode stok (Satuan Tetap, Pecah Satuan, Resep/Varian), Validasi Nota Pembelian berbasis Gemini AI (`gemini-3.8-flash`), Stok Opname Blind Count dengan keadilan Area Terbuka vs Area Tertutup, Laporan Keuangan Laba Kotor HPP akurat, serta Audit Trail permanen tanpa data dummy di produksi.

**Architecture:** Aplikasi dibangun menggunakan Next.js App Router (TypeScript strict), Tailwind CSS dengan Design Tokens terverifikasi WCAG AA (`#334E6B`, `#3DC2CA`, `#F5F5F5`, `#FC5086`), Prisma ORM dengan database relasional (kompatibel PostgreSQL Supabase & SQLite local engine untuk verifikasi instan jika `DATABASE_URL` PostgreSQL belum diisi), autentikasi sesi HTTP-only JWT cookie + bcrypt, serta integrasi backend `@google/genai` (`interactions.create` dengan `gemini-3.8-flash`).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Prisma ORM, Zod, `bcryptjs`, `jose`, `@google/genai`, `@phosphor-icons/react`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-trasir-design.md`

## Global Constraints
- **Zero Dummy Data in Production:** Tidak ada transaksi palsu, angka statis, atau mock data di tampilan produksi. Database kosong menampilkan Empty State jujur dan halaman Login menyediakan *First-Time Owner Setup* hanya saat jumlah pengguna di database = 0.
- **No Permanent Delete:** Tidak ada endpoint atau tombol hapus permanen untuk Penjualan, Pembelian, Perubahan Stok, maupun Audit Trail.
- **Segregation of Duties:** Pegawai/Kasir tidak dapat menyetujui pengajuan perubahan transaksi atau pembeliannya sendiri; Manajer tidak memiliki hak `approve` secara default kecuali diaktifkan oleh Pemilik di matriks RBAC.
- **Neutral Audit & AI Language:** Seluruh temuan AI dan selisih stok menggunakan bahasa evaluasi netral ("Perlu Diperiksa", "Ketidaksesuaian", "Hasil pemeriksaan AI merupakan bahan evaluasi, bukan keputusan kecurangan").

## Review Focus
1. **Stok Resep & Pecah Satuan saat Penjualan & Pembatalan:** Penjualan produk `RESEP` memotong stok seluruh bahan baku sesuai varian; saat pembatalan/retur disetujui Pemilik, stok bahan baku dikembalikan secara akurat dalam satu transaksi database.
2. **Pemisahan Wewenang (Self-Approval Prevention):** Request API `POST /api/sales/amendments/[id]/review` atau `POST /api/purchases/[id]/review` oleh pembuat pengajuan yang bukan Pemilik harus ditolak (`403 Forbidden`).
3. **Deteksi Nota Ganda & Selisih AI:** Pengajuan pembelian dengan nomor nota atau hash gambar yang sudah pernah diajukan sebelumnya otomatis ditandai `DUPLICATE` oleh backend + analisis Gemini AI.
4. **Blind Count Stok Opname:** API `GET /api/opname` tidak mengirim `systemStock` untuk sesi opname yang masih berstatus `OPEN` kepada non-Pemilik, sehingga perhitungan fisik murni objektif.
5. **Rumus Laba Kotor Akurat:** $\text{Keuntungan Kotor} = \text{Total Penjualan Bersih} - \text{HPP Barang Terjual}$ (bukan dikurangi total belanja stok yang masih tersimpan di gudang).

---

### Task 1: Project Scaffolding, Prisma Schema, & Environment Configuration
- [ ] Inisialisasi `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.example`, dan `.env`.
- [ ] Buat `prisma/schema.prisma` mencakup seluruh entitas: `User`, `RolePermission`, `Unit`, `Category`, `Warehouse`, `Product`, `ProductVariant`, `RecipeIngredient`, `ProductStock`, `Purchase`, `PurchaseItem`, `Sale`, `SaleItem`, `SaleAmendment`, `ShiftClosing`, `StockAdjustment`, `StockOpnameSession`, `StockOpnameItem`, `Notification`, `AuditLog`, `SystemSetting`.
- [ ] Jalankan `npx prisma db push` dan `npx prisma generate` untuk memverifikasi schema dan menghasilkan Prisma Client.

### Task 2: Security, Authentication, Granular RBAC, & Audit Trail Core
- [ ] Implementasikan `src/lib/prisma.ts`, `src/lib/auth.ts` (JWT HTTP-only cookie + bcryptjs + First-Time Setup), `src/lib/rbac.ts` (matriks 4 role x 9 modul x 4 aksi), `src/lib/audit.ts` (pencatatan `AuditLog` & `Notification` atomik), dan `src/lib/format.ts` (format Rupiah & Zona Waktu `Asia/Jakarta`).
- [ ] Implementasikan API `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.

### Task 3: Backend Core Logic — Inventory, 3 Stock Methods, Purchases & Gemini AI OCR
- [ ] Implementasikan logika pemotongan dan pengembalian stok untuk 3 metode (`TETAP`, `PECAH`, `RESEP`) di `src/lib/inventory.ts`.
- [ ] Implementasikan layanan OCR & Validasi Nota AI menggunakan `@google/genai` (`gemini-3.8-flash`) di `src/lib/gemini.ts` beserta fallback aman apabila API mengalami gangguan.
- [ ] Buat API Routes untuk Katalog Produk (`/api/products`), Pembelian & Validasi AI (`/api/purchases`, `/api/purchases/analyze`, `/api/purchases/[id]/review`), Inventaris & Stok Opname (`/api/inventory/adjustments`, `/api/inventory/opname`), Penjualan & Tutup Shift (`/api/sales`, `/api/sales/amendments`, `/api/shifts`), Laporan & Dashboard (`/api/dashboard`, `/api/reports`), Audit & Notifikasi (`/api/audit`), serta Pengaturan & Backup (`/api/settings`, `/api/backup`).

### Task 4: Design System Shell & Halaman 0–3 (Login, Dashboard, Kasir POS, Penjualan & Shift)
- [ ] Bangun komponen UI konsisten: `AppShell` (Collapsible Sidebar, Online Status Indicator, Mobile Bottom Nav, Notification Bell), `StatusBadge`, `SlideDrawer`, `ConfirmDialog`, `CameraCaptureModal`, `BarcodeScannerModal`, `EmptyState`.
- [ ] Bangun Halaman 0 (`/login`), Halaman 1 (`/dashboard`), Halaman 2 (`/kasir`), dan Halaman 3 (`/penjualan`).

### Task 5: Halaman 4–7 (Pembelian & Validasi Nota AI, Katalog & Resep, Inventaris & Blind Count Opname)
- [ ] Bangun Halaman 4 (`/pembelian`), Halaman 5 (`/pembelian/input` & `/pembelian/[id]`), Halaman 6 (`/produk`), dan Halaman 7 (`/inventaris`).

### Task 6: Halaman 8–10 (Laporan Keuangan, Audit Trail & Notifikasi, Pengaturan Sistem & RBAC)
- [ ] Bangun Halaman 8 (`/laporan`), Halaman 9 (`/aktivitas`), dan Halaman 10 (`/pengaturan`), serta dukung alias rute `/pengguna` dan `/api/actions`.

### Task 7: Automated Testing, Build Verification, & Quality Gate
- [ ] Tulis dan jalankan unit & integration tests (Vitest) yang menguji 3 metode pemotongan stok, perhitungan HPP & Laba Kotor, proteksi RBAC & pemisahan wewenang, blind count stok opname, serta audit trail.
- [ ] Jalankan `npm run typecheck`, `npm run lint`, dan `npm run build` hingga lulus 100% tanpa error.

