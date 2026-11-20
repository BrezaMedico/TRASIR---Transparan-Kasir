# Design Specification — TRASIR (Transparan Kasir)

## 1. Intent & Why
Pemilik toko yang mendelegasikan operasional harian kepada pegawai sering menghadapi risiko kebocoran dana (transaksi tidak dicatat, manipulasi nota pembelian, selisih kas akhir shift, atau penyusutan stok tanpa keterangan) sekaligus risiko menuduh pegawai jujur tanpa bukti. **TRASIR (Transparan Kasir)** menyatukan Kasir (POS), Pengadaan & Validasi Nota berbasis AI, Katalog Multi-Satuan/Resep, Audit Stok (*Blind Count* & *Area Terbuka/Tertutup*), Laporan Keuangan HPP Akurat, serta Audit Trail Permanen dalam satu arsitektur data real-time.

## 2. Goals, Non-Goals, & Anti-Goals
- **Goals:**
  - Membangun seluruh 11 halaman inti (Halaman 0–10) dengan fungsi nyata dan koneksi database penuh melalui Prisma ORM.
  - Menerapkan RBAC ketat untuk 4 jabatan (`PEMILIK`, `MANAJER`, `KASIR`, `GUDANG`) dengan matriks izin granular per modul (`view`, `create`, `edit`, `approve`) yang ditegakkan di backend API dan UI.
  - Mengimplementasikan 3 metode stok (`TETAP` 1:1, `PECAH` rasio konversi, `RESEP` komposisi bahan baku & varian) yang memotong stok secara atomik saat transaksi POS dan mengembalikan stok saat pembatalan/retur disetujui Pemilik.
  - Mengintegrasikan Google Gemini API (`@google/genai` dengan model `gemini-3.8-flash`) di backend untuk mengekstraksi informasi nota pembelian, mendeteksi ketidaksesuaian item/harga, nomor nota ganda, atau indikasi editan dengan bahasa evaluasi yang netral.
  - Menyediakan *Blind Count* Stok Opname (menyembunyikan stok sistem saat pegawai menghitung fisik) dan alur penjelasan + bukti untuk selisih yang melewati batas toleransi Rupiah (`Area Terbuka` vs `Area Tertutup`).
- **Non-Goals:**
  - Mode offline (sistem mewajibkan koneksi online real-time dengan indikator status koneksi aktif di header).
  - Akuntansi biaya operasional non-HPP (laporan keuangan berfokus pada Laba Kotor = Total Penjualan - HPP Barang Terjual, dilengkapi catatan eksplisit sesuai dokumen).
- **Anti-Goals (Mutlak Dilarang):**
  - **Zero Dummy/Mock Data di Produksi:** Dilarang menampilkan angka statis, transaksi palsu, atau fallback mock data di tampilan produksi. Jika tabel database kosong, tampilkan *empty state* yang jelas beserta tindakan pertama yang relevan.
  - **Zero Permanent Delete:** Tidak ada tombol hapus permanen untuk transaksi penjualan, pengajuan pembelian, perubahan stok, maupun log audit. Semua koreksi harus melalui pengajuan perubahan dan persetujuan Pemilik.

## 3. Architecture & Technical Approaches
Kami mempertimbangkan 3 pendekatan arsitektur:
1. **Approach A (Selected): Next.js App Router Full-Stack + Prisma ORM + Custom Session Auth (HTTP-only JWT Cookie + Bcrypt) + Server API Routes.**
   - *Trade-off:* Memberikan kontrol penuh atas matriks RBAC granular di database, transaksi atomik Prisma (`prisma.$transaction`) untuk pemotongan stok resep & audit trail dalam satu round-trip, serta kemudahan konfigurasi `DATABASE_URL` Supabase PostgreSQL.
2. **Approach B: Client-Side Supabase SDK langsung dari komponen browser.**
   - *Mengapa ditolak:* Berisiko mengekspos logika perhitungan keuangan dan pemotongan stok resep ke sisi klien, menyulitkan penegakan audit trail atomik dan menyalahi prinsip bahwa seluruh perhitungan keuangan wajib berada di backend.
3. **Approach C: Backend terpisah (Express/NestJS) + Frontend SPA.**
   - *Mengapa ditolak:* Menambah kompleksitas deployment dua layanan terpisah tanpa manfaat tambahan dibanding Next.js App Router API Routes.

## 4. Database Strategy & Environment Setup
- Menggunakan **Prisma ORM** dengan schema yang kompatibel penuh untuk PostgreSQL (`DATABASE_URL` & `DIRECT_URL` Supabase) serta mendukung koneksi database lokal terisolasi selama verifikasi build/tes otomatis hingga pengguna mengisi string koneksi PostgreSQL Supabase (`DATABASE_URL`).
- Menyediakan alur **Inisialisasi Pemilik Pertama (First-Time Owner Setup)** pada Halaman 0 (`/login`) yang hanya aktif ketika jumlah pengguna di database masih `0`, sehingga sistem dapat langsung digunakan dari database kosong tanpa memerlukan data dummy.
- Menyediakan indikator kesehatan koneksi database & konfigurasi di halaman Pengaturan Sistem.

## 5. Security & Anti-Fraud Controls
- Password di-hash menggunakan `bcryptjs` (cost factor 12).
- Sesi menggunakan HTTP-only signed JWT cookie (`trasir_session`) yang diverifikasi di setiap API route.
- Pengecekan RBAC granular di sisi server (`requirePermission(user, module, action)`).
- Pemisahan wewenang (*Segregation of Duties*): Pembuat pengajuan perubahan transaksi atau pembelian tanpa hak `approve` tidak dapat menyetujui pengajuannya sendiri.
- Setiap mutasi data penting mencatat `AuditLog` secara atomik dengan nilai `beforeData` dan `afterData`.

