# TRASIR---Transparan-Kasir

# TRASIR (Transparan Kasir)

**Sistem POS Multi-Loket, Inventaris Multi-Satuan/Resep, Validasi Nota AI, dan Pengawasan Operasional Toko Berbasis Audit Transparan.**

[![Next.js](https://img.shields.io/badge/Next.js-15.5.29-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.5.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini_AI-@google/genai_3.6.1-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Vitest](https://img.shields.io/badge/Tests-30_Passed_(Vitest)-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

[Live Demo]([LENGKAPI: URL Live Demo aplikasi yang sudah di-deploy]) · [Video Presentasi]([LENGKAPI: URL Video Demo / Presentasi Lomba]) · [Panduan Instalasi](#panduan-instalasi--menjalankan-secara-lokal)

---

## Ringkasan Eksekutif

### Latar Belakang Masalah
Usaha ritel dan F&B skala UMKM kerap menghadapi kebocoran operasional yang sulit dilacak: selisih kas saat pergantian shift kasir, manipulasi pembatalan transaksi atau perubahan harga produk oleh staf, ketidakcocokan nota belanja pemasok dengan stok masuk, serta stok bahan baku racikan yang tidak sinkron dengan porsi terjual. [LENGKAPI: 1–2 data statistik/survei terverifikasi terkait tingkat kebocoran kas atau operasional UMKM di Indonesia beserta sumbernya].

### Solusi & Keunggulan Kompetitif (UVP)
**TRASIR (Transparan Kasir)** menyatukan operasional kasir harian dengan mekanisme kontrol internal (*maker-checker*) dan audit berbasis bukti dalam satu workspace multi-ruangan (*multi-tenant*):

- **Blind Shift Closing & Multi-Loket Eksklusif:** Satu loket kasir hanya dapat dikunci oleh satu kasir aktif hingga tutup shift. Saat tutup shift, kasir menghitung pecahan uang fisik tanpa melihat angka target sistem sehingga potensi rekayasa setoran ditekan.
- **Validasi Nota Belanja Berbasis AI (Netral):** Integrasi Google Gemini Vision (`@google/genai`) membandingkan foto/PDF nota pemasok terhadap rincian input pegawai, mendeteksi duplikasi nota berbasis hash (`receiptHash`), dan menyertakan *disclaimer* objektif sebagai bahan evaluasi Pemilik/Manajer.
- **3 Metode Inventaris Terintegrasi & Snapshot HPP Historis:** Mendukung barang `TETAP` (1:1), `PECAH` (konversi kemasan ke satuan jual), dan `RESEP` (pemotongan bahan baku otomatis per varian). Setiap transaksi menyimpan snapshot HPP (`unitCost`) agar laporan laba kotor tetap akurat meski harga bahan baku berubah.
- **Tata Kelola Persetujuan Berjenjang:** Pegawai non-admin tidak dapat langsung mengubah harga produk, membatalkan transaksi, atau mengurangi stok secara sepihak. Perubahan diajukan secara batch (`ProductRequest`, `SaleAmendment`, `StockAdjustment`) dan baru aktif setelah disetujui Pemilik/Manajer.

---

## Fitur Utama & Alur Pengguna (*User Flow*)

TRASIR menerapkan *Role-Based Access Control* (RBAC) berbasis ruangan (`Room`) dengan 5 peran terdiferensiasi:

| Peran (*Role*) | Cakupan Akses & Tanggung Jawab Utama |
| :--- | :--- |
| **Pemilik (`PEMILIK`)** | Akses penuh seluruh modul: ringkasan finansial & laba kotor, persetujuan pengajuan barang/perubahan harga, validasi nota AI, persetujuan pembatalan/retur transaksi, evaluasi Stock Opname, manajemen loket kasir, undangan & hak akses tim (terlindungi dari modifikasi Manajer), serta ekspor cadangan data JSON. |
| **Manajer (`MANAJER`)** | Hak kelola operasional setara Pemilik untuk pengawasan harian, persetujuan batch produk, pembelian, dan evaluasi stok, namun dibatasi secara sistem agar tidak dapat mengubah, menurunkan, atau mencabut akun `PEMILIK`. |
| **Kasir (`KASIR`)** | Membuka/menutup shift pada loket kasir (*blind denomination count*), memproses penjualan POS (Tunai, QRIS, Transfer, Kartu) beserta pemindaian barcode kamera, melihat riwayat transaksi, dan mengajukan pembatalan/retur/perubahan transaksi (*amendment*). Dilarang menambah atau mengubah harga katalog produk. |
| **Gudang (`GUDANG`)** | Mengelola katalog bahan baku & produk, mengumpulkan pengajuan barang baru maupun usulan perubahan harga secara *batch* ke Daftar Pengajuan, mencatat pembelian stok dengan bukti nota, serta mengajukan penyesuaian stok & Stock Opname. Tidak memiliki akses ke modul Kasir/POS dan laporan laba. |
| **Kasir + Gudang (`KASIR_GUDANG`)** | Gabungan hak operasional peran Kasir dan Gudang untuk toko dengan staf merangkap tugas, tetap tunduk pada persetujuan Pemilik/Manajer untuk aksi sensitif (perubahan harga, pembatalan transaksi, persetujuan pembelian). |

### Alur Inti Operasional & Persetujuan

```mermaid
flowchart TD
    A[Pemilik Buat Ruangan Kerja] --> B[Buat Kode Undangan TRS-XXXX-XXXX]
    B --> C[Pegawai Gabung Sesuai Role: Kasir / Gudang / Manajer]

    C --> D{Aktivitas Operasional}

    D -->|Gudang / Kasir+Gudang| E[Antrekan Barang Baru & Usulan Ubah Harga ke Daftar Pengajuan]
    E --> F[Kirim Paket Batch + Opsional Lampiran Nota]
    F --> G[Pemilik / Manajer Tinjau & Cek Nota AI]
    G -->|Disetujui| H[Katalog & Harga Aktif Otomatis di POS]
    G -->|Ditolak| I[Tercatat di Audit Log & Notifikasi Pegawai]

    D -->|Kasir / Kasir+Gudang| J[Pilih Loket Tersedia & Buka Shift]
    J --> K[Transaksi POS & Potong Stok Otomatis: TETAP / PECAH / RESEP]
    K --> L{Ada Koreksi Transaksi?}
    L -->|Ya| M[Ajukan SaleAmendment + Bukti ke Pemilik/Manajer]
    L -->|Tidak| N[Tutup Shift: Hitung Pecahan Kas Fisik Blind Count]
    M --> N
    N --> O[Rekonsiliasi Laba Kotor, Audit Log & Notifikasi 1x Baca]
```

---

## Arsitektur Sistem & Tech Stack

### Diagram Arsitektur

```mermaid
flowchart LR
    subgraph Client ["Client Layer (Browser / Mobile PWA-Ready)"]
        UI[Next.js App Router UI\nReact 19 + Tailwind CSS]
        R3F[Hero 3D Diorama\nThree.js + R3F]
        Cam[Kamera Nota & Barcode\nClient Compression]
        Cache[Client Cache & UI Prefs\nTema / Font / Ukuran]
    end

    subgraph Server ["Application Layer (Next.js 15.5 Route Handlers)"]
        Auth[Auth & Session Guard\nJWT HS256 HttpOnly + tokenVersion]
        RBAC[RBAC & Room Isolation\n5 Role + Tenant Scope]
        Val[Zod Schema + Magic-Byte\nAttachment & Rate Limiter]
        Domain[Domain Services\nInventory / Profit / Shift / Audit]
    end

    subgraph Data ["Data & External Services"]
        Prisma[Prisma ORM 6.5\nSerializable TX + Retry]
        DB[(PostgreSQL / Supabase\nPgBouncer 6543 + Direct 5432\natau SQLite Lokal)]
        Gemini[Google Gemini Vision API\nValidasi Nota & OCR]
        Email[Resend API / SMTP Nodemailer\nReset Sandi & OTP Email]
    end

    UI & Cam --> Auth
    Auth --> RBAC --> Val --> Domain
    Domain --> Prisma --> DB
    Domain -->|Backend Only| Gemini
    Domain -->|Backend Only| Email
```

### Tech Stack

| Kategori | Teknologi & Versi | Alasan Teknis Pemilihan |
| :--- | :--- | :--- |
| **Framework Full-Stack** | Next.js `15.5.29` (App Router), React `19.0.0` | Menyatukan *Server Components*, *Route Handlers* API, optimasi *package imports*, dan konfigurasi HTTP security headers dalam satu repositori terpadu. |
| **Bahasa Pemrograman** | TypeScript `5.8.2` | Menjamin *type safety* menyeluruh dari skema Prisma, payload API, hingga komponen antarmuka (`tsc --noEmit`). |
| **Styling & Ikonografi** | Tailwind CSS `3.4.17`, `@phosphor-icons/react 2.1.7`, `lucide-react 1.77.0` | Konsistensi desain responsif, dukungan 3 mode tema (`light`/`dark`/`system`) bebas FOUC, serta preferensi ukuran dan 5 jenis font. |
| **Visualisasi 3D & Animasi** | `three 0.187.0`, `@react-three/fiber 9.8.2`, `@react-three/drei 10.7.9`, `framer-motion 14.14.0` | Merender diorama interaktif 3D pada halaman *landing* publik secara terisolasi tanpa membebani bundel halaman workspace POS. |
| **Database & ORM** | Prisma `6.5.0`, PostgreSQL (Supabase PgBouncer) / SQLite | Mendukung transaksi `Serializable`, migrasi skema terstruktur (24 model), retry otomatis gangguan pooler (`withDbRetry`), dan *provider switching* untuk pengujian lokal cepat. |
| **Autentikasi & Validasi** | `jose 6.0.10`, `bcryptjs 3.0.2`, `zod 4.6.7` | JWT `HS256` pada cookie `HttpOnly` dengan isolasi `purpose` token, hashing sandi bcrypt (cost 12), dan validasi skema ketat di sisi server. |
| **AI & Layanan Email** | `@google/genai 3.6.1`, `nodemailer 10.6.1`, Resend REST API | Analisis multimodal nota belanja (dengan *fallback* multi-model Gemini Flash/Lite) serta pengiriman email reset sandi & OTP verifikasi perubahan email. |
| **Pengujian & Linting** | Vitest `5.1.2`, ESLint `9.22.0` (`eslint-config-next 15.5.29`) | Menjalankan 18 *unit test* inti dan 12 *integration test suite* (34 skenario alur penuh) pada database SQLite terisolasi. |

---

## Struktur Direktori Inti

```text
TRASIR/
├── prisma/
│   ├── schema.prisma                   # Skema 24 model relational (Multi-Room, POS, Resep, AI, Audit)
│   └── migrations/                     # Riwayat migrasi SQL PostgreSQL
├── scripts/
│   ├── setup-test-db.mjs               # Generator skema & database SQLite terisolasi untuk Vitest
│   └── switch-db-provider.mjs          # Utilitas switch provider Prisma (postgresql <-> sqlite)
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Halaman Landing publik dengan Diorama 3D
│   │   ├── (workspace)/                # Modul aplikasi terproteksi sesi:
│   │   │   ├── dashboard/              # Ringkasan finansial, grafik penjualan & perbandingan loket
│   │   │   ├── kasir/                  # Terminal POS, pemindai barcode & alur buka/tutup shift
│   │   │   ├── produk/                 # Katalog, bahan baku, resep & persetujuan batch produk
│   │   │   ├── pembelian/              # Input & tinjauan pembelian stok berbasis nota AI
│   │   │   ├── penjualan/              # Riwayat transaksi & pengajuan pembatalan/retur
│   │   │   ├── inventaris/             # Penyesuaian stok & evaluasi Stock Opname
│   │   │   ├── laporan/                # Laporan keuangan, laba kotor & ekspor data
│   │   │   ├── aktivitas/              # Pusat notifikasi 1x baca & jejak Audit Log
│   │   │   └── pengaturan/             # Profil usaha, tampilan UI, loket kasir & manajemen tim
│   │   └── api/                        # 36 Next.js Route Handlers (REST JSON API)
│   ├── components/
│   │   ├── layout/AppShell.tsx         # Kerangka navigasi responsif, sidebar & session context
│   │   ├── kasir/                      # KasirClient, CashDenominationCounter, ShiftWorkflowPanel
│   │   ├── produk/                     # ProdukClient, ProductDrawer, ProposalCartDrawer, BatchReview
│   │   ├── settings/                   # CounterManagementPanel & TeamCollaboratorPanel
│   │   └── landing/diorama/            # Komponen diorama 3D landing page (Three.js / R3F)
│   └── lib/
│       ├── auth.ts                     # JWT HS256, tokenVersion check, email-change & reset token
│       ├── rbac.ts & rbac-shared.ts    # Matriks 5 peran, isolasi ruangan & proteksi Pemilik
│       ├── inventory.ts                # Pemotongan stok TETAP/PECAH/RESEP & aktivasi batch produk
│       ├── gemini.ts                   # Engine validasi nota Gemini Vision + fallback multi-model
│       ├── attachment.ts               # Validasi magic bytes (JPG/PNG/WEBP/PDF) maks 2 MB
│       ├── rate-limit.ts               # Sliding-window rate limiter & OTP brute-force lockout
│       ├── prisma.ts                   # Singleton PrismaClient, tuning PgBouncer & withDbRetry
│       └── queries/                    # Query server-side teroptimasi (dashboard, catalog, profit)
└── tests/
    ├── core.test.ts                    # 18 unit tests: finansial, RBAC, timezone WIB & keamanan
    └── api-flow.test.ts                # 12 suite integrasi (34 skenario end-to-end API & DB)
```

---

## Skema Database, API & Integrasi

### Ringkasan Entitas Database (24 Model Prisma)
Seluruh data operasional diisolasi per ruangan melalui kunci relasi `roomId` (`Room`):

- **Akses & Organisasi:** `Room`, `User` (dengan `tokenVersion` untuk invalidasi sesi), `StoreInvitation`, `RolePermission`, `SystemSetting`.
- **Katalog & Inventaris:** `Unit`, `Category` (area `TERBUKA`/`TERTUTUP`), `Warehouse`, `Product`, `ProductVariant`, `RecipeIngredient`, `ProductStock`, `ProductRequest` (mendukung *envelope* batch `CREATE`/`UPDATE` pada `variantsJson`).
- **Transaksi & Pengawasan:** `Purchase`, `PurchaseItem`, `Sale`, `SaleItem` (snapshot HPP `unitCost`), `SaleAmendment`, `ShiftClosing`, `StockAdjustment`, `StockOpnameSession`, `StockOpnameItem`.
- **Jejak Audit:** `Notification` (scoped per role/user) dan `AuditLog` (menyimpan `beforeData`/`afterData`).

### Endpoint API Inti (36 Route Handlers)

| Method | Endpoint | Deskripsi | Auth & RBAC |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register`, `/login`, `/logout`, `/forgot-password`, `/reset-password` | Registrasi (buat ruangan / gabung kode undangan), autentikasi sesi, dan pemulihan sandi satu kali pakai. | Publik (Rate-limited) |
| `GET` | `/api/auth/me` | Memuat profil sesi aktif, peran, daftar ruangan, dan jumlah notifikasi belum dibaca. | Session Cookie |
| `POST` | `/api/account/change-email` | Alur ganti email dua tahap berbasis kode OTP 6 digit dengan proteksi lockout 5 percobaan. | Assigned User |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/products` | Katalog produk & bahan baku. `POST`/`PUT` oleh staf non-admin otomatis dialihkan menjadi `ProductRequest` (`202 Accepted`). | `produk` RBAC |
| `GET`, `POST`, `DELETE` | `/api/product-requests` | Pengajuan batch barang baru maupun perubahan harga/data (`targetProductId`) beserta pengelolaan visibilitas paket. | `produk` (`create`/`edit`) |
| `POST` | `/api/product-requests/[id]/review`, `/batch-review`, `/analyze` | Persetujuan/penolakan satuan atau batch (transaksi `Serializable`) dan pemeriksaan nota batch via Gemini AI. | `PEMILIK` / `MANAJER` |
| `GET`, `POST` | `/api/sales`, `/api/sales/amendments` | Pencatatan transaksi POS + pemotongan stok otomatis, serta pengajuan & persetujuan pembatalan/retur/perubahan. | `kasir` / `penjualan` RBAC |
| `GET`, `POST` | `/api/shifts` | Buka shift (kunci loket eksklusif) dan tutup shift (*blind denomination count* + serah terima modal). | `kasir` RBAC |
| `GET`, `POST`, `DELETE` | `/api/counters` | Pengelolaan daftar loket kasir dan pemantauan status loket yang sedang aktif dipakai. | `PEMILIK` / `MANAJER` |
| `GET`, `POST` | `/api/purchases`, `/analyze`, `/review` | Pencatatan pembelian stok berbukti nota, analisis OCR/validasi nota Gemini AI, dan persetujuan masuk stok. | `pembelian` RBAC |
| `GET`, `POST` | `/api/inventory` | Pengajuan penyesuaian stok (`RUSAK`, `HILANG`, `PINDAH_GUDANG`) dan sesi evaluasi Stock Opname. | `inventaris` RBAC |
| `GET` | `/api/dashboard`, `/api/profit`, `/api/reports` | Agregasi omzet, laba kotor historis, tren harian WIB, dan perbandingan performa antar-loket. | `PEMILIK` / `MANAJER` |
| `GET`, `POST` | `/api/audit` | Pengambilan log aktivitas & notifikasi; aksi `MARK_READ`, `MARK_IDS_READ` (notifikasi 1x baca), dan `MARK_ALL_READ`. | Assigned User |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/invitations`, `/api/users`, `/api/settings`, `/api/backup` | Manajemen undangan tim, ubah role/cabut akses, pengaturan identitas toko, dan unduh cadangan JSON. | `PEMILIK` / `MANAJER` |

### Integrasi Eksternal
1. **Google Gemini Vision (`@google/genai`):** Dipanggil khusus di sisi server (`src/lib/gemini.ts`) dengan *structured JSON schema*, rantai *fallback* model (`gemini-3-flash-preview` -> `gemini-3.5-flash-lite` -> `gemini-flash-lite-latest` -> `gemini-3.1-flash-lite`), serta deteksi duplikasi hash nota.
2. **Email Transaksional (`src/lib/email.ts`):** Mendukung dua opsi konfigurasi secara otomatis: **Resend API** (rekomendasi *serverless*) atau **SMTP via Nodemailer** (termasuk Gmail App Password) untuk tautan reset sandi dan OTP ganti email.

---

## Panduan Instalasi & Menjalankan Secara Lokal

### Prasyarat
- **Node.js** versi `20.x` atau `22.x` (disarankan LTS; tipe target `@types/node ^22`)
- **npm** versi `10+`
- Database **PostgreSQL** (mis. Supabase) **atau** mode lokal **SQLite** tanpa instalasi server database tambahan

### Langkah Instalasi

```bash
# 1. Clone repositori
git clone [LENGKAPI: URL repositori GitHub proyek]
cd TRASIR

# 2. Instal seluruh dependensi
npm install

# 3. Salin template variabel lingkungan
cp .env.example .env
# (Windows PowerShell: Copy-Item .env.example .env)
```

**Opsi A: Menggunakan PostgreSQL / Supabase (Default `prisma/schema.prisma`)**
```bash
# Pastikan DATABASE_URL, DIRECT_URL, dan AUTH_SECRET sudah diisi di .env
npm run db:generate
npm run db:push
npm run dev
```

**Opsi B: Mode Cepat Lokal Menggunakan SQLite (Tanpa Server Database)**
```bash
# Ubah provider Prisma ke SQLite dan atur DATABASE_URL="file:./dev.db" di .env
npm run db:use-sqlite
npm run db:generate
npm run db:push
npm run dev
```

Buka browser di `http://localhost:3000`.

### Perintah Verifikasi Kualitas & Pengujian
```bash
npm run typecheck   # Pemeriksaan tipe TypeScript (tsc --noEmit)
npm run lint        # Pemeriksaan ESLint (next lint)
npm test            # Menjalankan 30 test case (18 unit + 12 integration suite) di SQLite terisolasi
npm run build       # Kompilasi production build Next.js
```

### Variabel Lingkungan (`.env`)

| Nama Variabel | Wajib / Opsional | Deskripsi | Contoh Nilai |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Wajib** | Koneksi database utama Prisma (PostgreSQL PgBouncer port `6543` atau `file:./dev.db` jika SQLite). | `postgresql://user:pass@host:6543/postgres?pgbouncer=true&sslmode=require` |
| `DIRECT_URL` | **Wajib** *(PostgreSQL)* | Koneksi langsung PostgreSQL (port `5432`) untuk `prisma db push` / migrasi. | `postgresql://user:pass@host:5432/postgres?sslmode=require` |
| `AUTH_SECRET` | **Wajib** *(Produksi min. 32 karakter)* | Kunci penandatanganan JWT `HS256` untuk sesi, OTP email, dan reset sandi. | `ganti_dengan_random_hex_minimal_32_karakter` |
| `NEXT_PUBLIC_APP_URL` | **Wajib** *(Produksi)* | URL publik aplikasi untuk membangun tautan email reset kata sandi secara aman (mencegah *Host Header Poisoning*). | `https://trasir-anda.vercel.app` |
| `GEMINI_API_KEY` | Opsional *(Wajib untuk AI)* | Kunci API Google Gemini (hanya diakses backend) untuk validasi nota pembelian & batch produk. | `AIzaSy...` |
| `RESEND_API_KEY` | Opsional *(Pilih A atau B)* | Kunci API Resend untuk pengiriman email reset sandi & OTP (Opsi A). | `re_xxxxxxxxx` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Opsional *(Pilih A atau B)* | Konfigurasi server SMTP / Gmail App Password via Nodemailer (Opsi B). | `smtp.gmail.com` / `465` / `true` |
| `EMAIL_FROM` | Opsional | Alamat pengirim yang tampil pada email verifikasi & reset sandi. | `TRASIR <noreply@domain.com>` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Opsional | Konfigurasi proyek Supabase (tersedia pada template `.env.example`, runtime saat ini terhubung via Prisma). | `https://<project>.supabase.co` |

---

## Keamanan, Performa & Standar Rekayasa

Praktik rekayasa berikut terverifikasi langsung pada kode sumber:

- **Autentikasi & Isolasi Sesi Ketat:** Cookie `HttpOnly`, `SameSite=Lax`, `Secure` di produksi; `verifySessionToken()` menolak token dengan klaim `purpose` (mencegah token reset sandi/ganti email dipakai sebagai sesi); `getCurrentSessionUser()` memvalidasi `tokenVersion` langsung ke database sehingga perubahan sandi atau pencabutan akses langsung memutus sesi lama.
- **Fail-Closed & Proteksi Brute-Force:** `resolveSecretString()` melempar *error* saat produksi jika `AUTH_SECRET` kosong atau `< 32` karakter. Endpoint autentikasi & OTP dilindungi *sliding-window rate limiter* serta penguncian token setelah 5 percobaan gagal (`src/lib/rate-limit.ts`).
- **Validasi Lampiran Magic-Bytes:** `validateProofAttachment()` memverifikasi *header* biner (*magic bytes*) untuk `JPEG`, `PNG`, `WEBP`, dan `PDF` (batas 2 MB) guna memblokir file HTML/SVG/skrip yang menyamar sebagai gambar.
- **Anti-IDOR & Konsistensi Transaksi:** Seluruh query terikat pada `roomId` pengguna, redirect internal disaring oleh `sanitizeInternalRedirect()`, dan operasi persetujuan kritis menggunakan transaksi Prisma `Serializable` dengan klaim atomik untuk mencegah *race condition* atau persetujuan ganda.
- **HTTP Security Headers & Optimasi UX:** `next.config.ts` menerapkan `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, dan `Permissions-Policy`. Skrip inline anti-FOUC di `src/app/layout.tsx` mencegah kedipan tema saat muat awal, sementara `optimizePackageImports` dan `staleTimes` mempercepat navigasi antar-halaman.

---

## Pratinjau Antarmuka, Tim & Lisensi

### Pratinjau Antarmuka Utama

| Modul | Pratinjau | Keterangan Singkat |
| :--- | :--- | :--- |
| **Landing Page & Diorama 3D** | ![Landing Page]([LENGKAPI: path/URL screenshot landing page]) | Presentasi produk interaktif dengan diorama 3D dan akses masuk/daftar ruangan. |
| **Dashboard & Perbandingan Loket** | ![Dashboard]([LENGKAPI: path/URL screenshot dashboard]) | Ringkasan omzet, laba kotor historis, grafik penjualan WIB, dan status loket kasir. |
| **Kasir (POS) & Blind Shift** | ![Kasir POS]([LENGKAPI: path/URL screenshot kasir & tutup shift]) | Keranjang transaksi, scan barcode, dan penghitungan pecahan uang tutup shift. |
| **Validasi Nota AI & Persetujuan Batch** | ![Validasi Nota AI]([LENGKAPI: path/URL screenshot review batch & AI nota]) | Tinjauan pengajuan produk/perubahan harga serta perbandingan nota otomatis Gemini AI. |

### Tim Pengembang

| Nama Lengkap | Peran | Institusi / Afiliasi |
| :--- | :--- | :--- |
| [LENGKAPI: Nama Anggota 1] | [LENGKAPI: Peran, mis. Full-Stack Engineer] | [LENGKAPI: Nama Universitas / Sekolah / Tim] |
| [LENGKAPI: Nama Anggota 2] | [LENGKAPI: Peran, mis. UI/UX & Frontend Engineer] | [LENGKAPI: Nama Universitas / Sekolah / Tim] |
| [LENGKAPI: Nama Anggota 3] | [LENGKAPI: Peran, mis. System Architect & QA] | [LENGKAPI: Nama Universitas / Sekolah / Tim] |

### Lisensi
[LENGKAPI: Jenis lisensi proyek, mis. MIT License, dan tambahkan file `LICENSE` di root repositori karena saat ini file `LICENSE` belum tersedia di arsip kode].