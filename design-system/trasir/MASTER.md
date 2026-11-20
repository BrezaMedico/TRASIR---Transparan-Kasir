# Design System Master — TRASIR (Transparan Kasir)

## 1. Visual Identity & Philosophy
- **Product:** TRASIR (Transparan Kasir) — Sistem Pengawasan Operasional, Kasir (POS), Validasi Nota AI, Inventaris, dan Keuangan Toko.
- **Anchor & References:** Swiss-inspired Clean Modern Financial Interface (menggabungkan struktur kartu bersih dan hero-card ala *Donezo*, hierarki pil navigasi ala *Crextio* & *Youcare*, serta ikonografi duotone frosted ala *Frosted Blue Icons*).
- **Dials (`antislop` Part 3):**
  - `ENERGY: 2` (Balanced, tegas, bersih, fokus pada kejelasan angka dan bukti audit).
  - `RHYTHM: 2` (Konsisten dengan variasi kartu hero `#334E6B` dan panel komparasi 2-kolom).
  - `MOTION: 1` (Transisi mikro 150-200ms pada hover/active, drawer slide-over halus, patuh pada `prefers-reduced-motion: reduce`).
- **One-Line Reasons (`antislop` R-31):**
  - **Mengapa palet ini?** Berasal langsung dari gambar palet warna resmi pengguna (`#334E6B`, `#3DC2CA`, `#F5F5F5`, `#FC5086`) dengan seluruh kontras teks terverifikasi WCAG AA (`>= 4.84:1`).
  - **Mengapa layout ini?** Menggunakan sidebar kiri yang dapat diciutkan (otomatis ciut di halaman Kasir POS) + Tab Horizontal + Side Drawer kanan agar pengguna memeriksa detail transaksi, resep, atau selisih opname tanpa kehilangan konteks halaman utama.
  - **Mengapa tipografi ini?** Plus Jakarta Sans memberikan keterbacaan modern untuk antarmuka Bahasa Indonesia, dipadukan JetBrains Mono (`tabular-nums`) untuk nominal Rupiah, kuantitas stok, dan kode struk agar sejajar vertikal saat dibandingkan.
  - **Mengapa kartu?** Kartu putih (`#FFFFFF`) di atas kanvas `#F5F5F5` dengan satu kartu hero utama `#334E6B` memisahkan metrik utama dari data pendukung secara instan seperti pada referensi *Donezo*.
  - **Mengapa ikon ini?** Ikon SVG vektor duotone (`@phosphor-icons/react` / SVG kustom) memberikan penanda visual cepat pada modul keuangan dan stok tanpa emoji.

## 2. Color Tokens (Verified WCAG AA)
- **Primary Brand (`--color-primary`):** `#334E6B` (Deep Slate Navy) — Text `#FFFFFF` di atas `#334E6B` = **8.60:1 (PASS AAA)**.
- **Secondary Accent (`--color-secondary`):** `#3DC2CA` (Cyan Teal) — Digunakan untuk aksen grafik, badge informasi, dan indikator aktif; teks pendamping pada latar terang menggunakan `#0F766E` di atas `#F0FDFA` = **5.25:1 (PASS AA)**.
- **Canvas Background (`--color-canvas`):** `#F5F5F5` (Light Neutral Off-White) — Text `#334E6B` di atas `#F5F5F5` = **7.89:1 (PASS AAA)**.
- **Card Surface (`--color-surface`):** `#FFFFFF` (Pure White) — Text utama `#1E293B` di atas `#FFFFFF` = **14.63:1 (PASS AAA)**; Text sekunder `#475569` = **7.58:1 (PASS AAA)**.
- **Highlight / Alert Accent (`--color-rose`):** `#FC5086` (Vibrant Rose Pink) — Digunakan untuk penanda anomali kritis; teks badge menggunakan `#9F1239` di atas `#FFF1F2` = **7.30:1 (PASS AAA)**.
- **Status Badges (Core Guardrail 1.A):**
  - **Hijau Lembut (Disetujui / Sesuai / Aman Dalam Toleransi):** Background `#F0FDF4`, Border `#BBF7D0`, Text `#166534` (**6.81:1 PASS AA**).
  - **Kuning / Amber Lembut (Menunggu Persetujuan / Perlu Perbaikan / Anomali Area Terbuka):** Background `#FFFBEB`, Border `#FDE68A`, Text `#B45309` (**4.84:1 PASS AA**).
  - **Merah / Rose Lembut (Ditolak / Terindikasi AI / Anomali Area Tertutup / Melewati Toleransi):** Background `#FFF1F2`, Border `#FECDD3`, Text `#9F1239` (**7.30:1 PASS AAA**).

## 3. Responsive Architecture
- **Desktop (`>= 1024px`):** Fixed left sidebar (`260px`, atau `76px` collapsed) + sticky top header (`64px`) + main content container + right slide-over drawer (`480px`–`600px`).
- **Tablet (`768px` – `1023px`):** Collapsible sidebar (default collapsed di POS & Pemeriksaan Nota) + 2-column grid.
- **Mobile (`< 768px`):** Top compact header + Bottom Navigation Bar + Hamburger Drawer untuk menu penuh; tabel otomatis memiliki tampilan kartu responsif; keranjang POS berupa Bottom Sheet dengan tombol aksi minimal `44x44px`.
