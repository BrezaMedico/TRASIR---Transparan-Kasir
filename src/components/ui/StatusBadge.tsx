import React from "react";

export type BadgeTone = "green" | "amber" | "red" | "cyan" | "navy" | "neutral";

export function resolveStatusTone(status: string): BadgeTone {
  const s = (status || "").toUpperCase();
  if (
    s === "DISETUJUI" ||
    s === "SESUAI" ||
    s === "AMAN" ||
    s === "DALAM_TOLERANSI" ||
    s === "NORMAL" ||
    s === "TERIMA_PENJELASAN"
  ) {
    return "green";
  }
  if (
    s === "MENUNGGU_PERSETUJUAN" ||
    s === "PERLU_PERBAIKAN" ||
    s === "ANOMALI_TERBUKA" ||
    s === "TERBUKA" ||
    s === "MINTA_INFO_TAMBAHAN" ||
    s === "PENDING"
  ) {
    return "amber";
  }
  if (
    s === "DITOLAK" ||
    s === "ADA_SELISIH" ||
    s === "NOTA_GANDA" ||
    s === "TERINDIKASI_EDIT" ||
    s === "ANOMALI_TERTUTUP" ||
    s === "TERTUTUP" ||
    s === "DIBATALKAN" ||
    s === "TANDAI_TINDAK_LANJUT" ||
    s === "PERLU_DIPERIKSA"
  ) {
    return "red";
  }
  if (s === "RESEP" || s === "PECAH" || s === "DIKEMBALIKAN" || s === "DIUBAH") {
    return "cyan";
  }
  return "neutral";
}

export function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan",
    PERLU_PERBAIKAN: "Perlu Perbaikan",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    SESUAI: "Sesuai",
    ADA_SELISIH: "Perlu Diperiksa (Selisih)",
    NOTA_GANDA: "Terindikasi Nota Ganda",
    TERINDIKASI_EDIT: "Perlu Diperiksa (Indikasi Edit)",
    DALAM_TOLERANSI: "Aman (Dalam Toleransi)",
    ANOMALI_TERBUKA: "Anomali Area Terbuka",
    ANOMALI_TERTUTUP: "Anomali Area Tertutup",
    TERBUKA: "Area Terbuka",
    TERTUTUP: "Area Tertutup",
    NORMAL: "Normal",
    DIBATALKAN: "Dibatalkan",
    DIKEMBALIKAN: "Dikembalikan (Retur)",
    DIUBAH: "Diubah",
    PERLU_DIPERIKSA: "Perlu Diperiksa",
    TERIMA_PENJELASAN: "Penjelasan Diterima",
    MINTA_INFO_TAMBAHAN: "Perlu Info Tambahan",
    TANDAI_TINDAK_LANJUT: "Ditandai Tindak Lanjut",
    BELUM_DIEVALUASI: "Menunggu Evaluasi",
    TETAP: "Satuan Tetap (1:1)",
    PECAH: "Pecah Satuan",
    RESEP: "Resep & Varian",
    DANA_TOKO: "Dana Kas Toko",
    BELANJA_PEMILIK: "Belanja Langsung Pemilik",
    TERCATAT: "Tercatat",
    KASIR_GUDANG: "Kasir + Gudang",
  };
  return map[status] || status.replace(/_/g, " ");
}

export function StatusBadge({
  status,
  customLabel,
  tone,
}: {
  status: string;
  customLabel?: string;
  tone?: BadgeTone;
}) {
  const resolved = tone || resolveStatusTone(status);
  const label = customLabel || formatStatusLabel(status);

  const classes: Record<BadgeTone, string> = {
    green: "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]",
    amber: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
    red: "bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]",
    cyan: "bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]",
    navy: "bg-[#E8EEF4] text-[#334E6B] border-[#CBD5E1]",
    neutral: "bg-slate-100 text-slate-700 border-slate-300",
  };

  const dotClasses: Record<BadgeTone, string> = {
    green: "bg-[#166534]",
    amber: "bg-[#B45309]",
    red: "bg-[#9F1239]",
    cyan: "bg-[#0F766E]",
    navy: "bg-[#334E6B]",
    neutral: "bg-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap ${classes[resolved]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[resolved]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

