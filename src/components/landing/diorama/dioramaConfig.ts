export type SceneId = 0 | 1 | 2;

export interface ChatBubbleItem {
  sender: string;
  time: string;
  text: string;
  hasDoubleCheck?: boolean;
}

export interface DioramaSceneMeta {
  id: SceneId;
  shortLabel: string;
  title: string;
  summary: string;
  accentHex: string;
  /** Durasi jeda sebelum gelembung chat pertama (kanan) muncul, dalam ms */
  chatStartDelayMs: number;
  /** Durasi tahan saat kedua chat tampil sebelum mulai transisi, dalam ms */
  chatHoldDurationMs: number;
  rightBubble: ChatBubbleItem;
  bottomBubble: ChatBubbleItem;
}

/**
 * Parameter koreografi animasi (mudah disesuaikan dari satu tempat)
 */
export const DIORAMA_TIMING = {
  /** Jeda antar-gelembung chat (kanan -> bawah) */
  secondBubbleDelayMs: 600,
  /** Durasi fade-out chat sebelum kubik mulai berputar */
  chatExitLeadMs: 220,
  /** Durasi satu putaran penuh 360 derajat untuk berganti layout (detik) */
  rotationDurationSec: 1.65,
  /** Jeda stagger pengisian item katalog di Adegan 1 (detik) */
  catalogStaggerSec: 0.095,
} as const;

/**
 * Palet Soft Matte Clay selaras dengan token design-system/trasir/MASTER.md
 */
export const DIORAMA_PALETTE = {
  wallBase: "#F7F8F7",
  wallTrim: "#E5EAE8",
  wallOuter: "#EAEFED",
  floorWarm: "#F1ECE2",
  floorWarehouse: "#E8ECEB",
  floorCafe: "#EFE8DC",
  woodLight: "#D7B48A",
  woodMedium: "#B98B5E",
  woodDark: "#7C583B",
  tealPrimary: "#0F766E",
  tealSoft: "#3DC2CA",
  tealDeep: "#115E59",
  slateDark: "#334E6B",
  slateMid: "#64748B",
  slateLight: "#CBD5E1",
  cardboard: "#D4A876",
  cardboardDark: "#B88958",
  cream: "#FAF7F2",
  terracotta: "#D97757",
  amberSoft: "#EAB308",
  sage: "#6EE7B7",
  metalLight: "#94A3B8",
  metalDark: "#475569",
} as const;

export const DIORAMA_SCENES: readonly DioramaSceneMeta[] = [
  {
    id: 0,
    shortLabel: "Toko",
    title: "Kasir Toko Bahan Baku",
    summary:
      "Miniatur rak toko bahan baku yang terisi otomatis bersama meja kasir POS, QRIS, dan validasi nota AI.",
    accentHex: "#0F766E",
    chatStartDelayMs: 1500,
    chatHoldDurationMs: 4000,
    rightBubble: {
      sender: "Gudang",
      time: "09.14",
      text: "Nota 20 kg gula & 2 dus minyak valid AI ✓",
    },
    bottomBubble: {
      sender: "Sistem",
      time: "09.14",
      text: "Stok rak terisi otomatis. Siap jual eceran & grosir.",
      hasDoubleCheck: true,
    },
  },
  {
    id: 1,
    shortLabel: "Gudang",
    title: "Layout Gudang & Audit Stok",
    summary:
      "Miniatur gudang area tertutup dengan rak stok besi, palet kardus, papan audit, dan pemindai stok.",
    accentHex: "#0F766E",
    chatStartDelayMs: 950,
    chatHoldDurationMs: 4000,
    rightBubble: {
      sender: "Audit Stok",
      time: "14.30",
      text: "Cek fisik gudang selesai: 48 item sesuai catatan.",
    },
    bottomBubble: {
      sender: "Pemilik",
      time: "14.31",
      text: "Aman, selisih Rp0. Semua bukti tercatat rapi.",
      hasDoubleCheck: true,
    },
  },
  {
    id: 2,
    shortLabel: "Kafe",
    title: "Layout Kasir Kafe",
    summary:
      "Miniatur meja bar kafe dengan mesin espresso, grinder, kasir tablet POS, dan pemotongan bahan baku otomatis per resep.",
    accentHex: "#0F766E",
    chatStartDelayMs: 800,
    chatHoldDurationMs: 4000,
    rightBubble: {
      sender: "Kasir",
      time: "16.05",
      text: "1x Kopi Susu Large dibayar via QRIS.",
    },
    bottomBubble: {
      sender: "Sistem",
      time: "16.05",
      text: "Resep terpotong otomatis: susu, gula cair & kopi.",
      hasDoubleCheck: true,
    },
  },
] as const;

