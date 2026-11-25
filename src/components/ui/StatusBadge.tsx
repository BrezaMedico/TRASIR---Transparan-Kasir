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
    return "cyan";
  }
  if (
    s === "MENUNGGU_PERSETUJUAN" ||
    s === "PERLU_PERBAIKAN" ||
    s === "ANOMALI_TERBUKA" ||
    s === "TERBUKA" ||
    s === "MINTA_INFO_TAMBAHAN" ||
    s === "ADA_SELISIH" ||
    s === "GAGAL_CEK"
  ) {
    return "amber";
  }
  if (
    s === "DITOLAK" ||
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
    return "navy";
  }
  return "neutral";
}

export function formatStatusLabel(status: string): string {
  const map: Record<string, string> = {
    MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan",
    PERLU_PERBAIKAN: "Perlu Perbaikan",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    TANPA_NOTA: "Tanpa Nota",
    BELUM_DICEK: "Belum Dicek AI",
    PENDING: "Belum Dicek AI",
    GAGAL_CEK: "AI Belum Tersambung",
    SESUAI: "Cocok dengan Nota",
    ADA_SELISIH: "Ada yang Berbeda",
    NOTA_GANDA: "Nota Pernah Dipakai",
    TERINDIKASI_EDIT: "Perlu Cek Visual",
    DALAM_TOLERANSI: "Aman",
    ANOMALI_TERBUKA: "Area Terbuka",
    ANOMALI_TERTUTUP: "Area Tertutup",
    TERBUKA: "Area Terbuka",
    TERTUTUP: "Area Tertutup",
    NORMAL: "Berhasil",
    DIBATALKAN: "Dibatalkan",
    DIKEMBALIKAN: "Dikembalikan",
    DIUBAH: "Diubah",
    PERLU_DIPERIKSA: "Perlu Diperiksa",
    TERIMA_PENJELASAN: "Diterima",
    MINTA_INFO_TAMBAHAN: "Perlu Info Tambahan",
    TANDAI_TINDAK_LANJUT: "Ditandai Tindak Lanjut",
    BELUM_DIEVALUASI: "Menunggu Evaluasi",
    TETAP: "Satuan Tetap",
    PECAH: "Pecah Satuan",
    RESEP: "Menu Resep",
    DANA_TOKO: "Uang Kas Toko",
    BELANJA_PEMILIK: "Uang Pemilik",
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
    green: "bg-[#E6FBFB] text-[#006B69] border-[#01DAD7]",
    amber: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
    red: "bg-[#FFF0F4] text-[#D41448] border-[#FF2A63]/35",
    cyan: "bg-[#E6FBFB] text-[#006B69] border-[#01DAD7]",
    navy: "bg-[#202531] text-white border-[#202531]",
    neutral: "bg-[#EBEBEB] text-[#202531] border-[#202531]/15",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${classes[resolved]}`}
    >
      {label}
    </span>
  );
}
