"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta, formatNumber, formatRupiah } from "@/lib/format";
import { ClipboardText, EyeSlash } from "@phosphor-icons/react";
import type { BlindCountProd, OpnameItemRow, OpnameSessionRow } from "./types";

interface InventoryOpnameTabProps {
  canCreate: boolean;
  opnameSchedule: string;
  toleranceThresholdRp: number;
  blindModeActive: boolean;
  opnameTitle: string;
  blindProducts: BlindCountProd[];
  physicalInputs: Record<string, string>;
  submittingOpname: boolean;
  opnameSessions: OpnameSessionRow[];
  onStartBlindOpname: () => void;
  onCancelBlindOpname: () => void;
  onOpnameTitleChange: (val: string) => void;
  onPhysicalInputChange: (productId: string, val: string) => void;
  onSubmitBlindOpname: (e: React.FormEvent) => void;
  onOpenAnomaly: (item: OpnameItemRow) => void;
}

export function InventoryOpnameTab({
  canCreate,
  opnameSchedule,
  toleranceThresholdRp,
  blindModeActive,
  opnameTitle,
  blindProducts,
  physicalInputs,
  submittingOpname,
  opnameSessions,
  onStartBlindOpname,
  onCancelBlindOpname,
  onOpnameTitleChange,
  onPhysicalInputChange,
  onSubmitBlindOpname,
  onOpenAnomaly,
}: InventoryOpnameTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <EyeSlash size={20} weight="duotone" className="text-[#334E6B]" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-slate-900">
              Stok Opname &amp; Audit Fisik Objektif (Blind Count)
            </h2>
          </div>
          <p className="text-xs text-slate-600">
            Jadwal Aktif: <strong>{opnameSchedule}</strong> • Batas Toleransi Kerugian:{" "}
            <strong className="font-mono text-[#334E6B]">
              {formatRupiah(toleranceThresholdRp)}
            </strong>
            . Saat pegawai menghitung fisik, angka stok sistem disembunyikan agar perhitungan objektif.
          </p>
        </div>

        {canCreate && !blindModeActive && (
          <button
            type="button"
            onClick={onStartBlindOpname}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] cursor-pointer shrink-0"
          >
            <ClipboardText size={18} weight="bold" aria-hidden="true" />
            <span>Mulai Sesi Hitung Fisik Baru</span>
          </button>
        )}
      </div>

      {blindModeActive && (
        <form
          onSubmit={onSubmitBlindOpname}
          className="bg-white rounded-2xl border-2 border-[#334E6B] p-5 shadow-md space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E8EEF4] text-[#334E6B] text-xs font-extrabold">
                <EyeSlash size={14} weight="bold" aria-hidden="true" />
                Mode Blind Count Aktif (Stok Sistem Disembunyikan)
              </span>
              <p className="text-xs text-slate-600 mt-1">
                Hitung jumlah fisik nyata di rak/gudang dan masukkan angkanya di bawah ini.
              </p>
            </div>
            <input
              type="text"
              required
              value={opnameTitle}
              onChange={(e) => onOpnameTitleChange(e.target.value)}
              aria-label="Judul sesi stok opname"
              className="px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
            />
          </div>

          {blindProducts.length === 0 ? (
            <p className="text-xs text-slate-600 py-6 text-center">
              Belum ada barang fisik di katalog untuk dihitung.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                    <th className="py-3 px-4">SKU &amp; Nama Barang</th>
                    <th className="py-3 px-4">Kategori &amp; Area</th>
                    <th className="py-3 px-4">Stok Sistem</th>
                    <th className="py-3 px-4 w-56">Input Jumlah Fisik Nyata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {blindProducts.map((bp) => (
                    <tr key={bp.id}>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{bp.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{bp.sku}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700 mr-2">{bp.categoryName}</span>
                        <StatusBadge status={bp.areaType} />
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-slate-500 italic">
                          <EyeSlash size={14} aria-hidden="true" />
                          Disembunyikan (Blind Count)
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={physicalInputs[bp.id] ?? ""}
                            onChange={(e) => onPhysicalInputChange(bp.id, e.target.value)}
                            placeholder="0"
                            aria-label={`Jumlah fisik ${bp.name}`}
                            className="w-32 px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900"
                          />
                          <span className="font-mono text-slate-600">{bp.sellUnit}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancelBlindOpname}
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingOpname}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] disabled:opacity-50 cursor-pointer"
            >
              {submittingOpname
                ? "Memproses Perbandingan..."
                : "Kirim Hasil Fisik & Tampilkan Perbandingan Sistem"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {opnameSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-xs text-slate-600">
            Belum ada riwayat sesi Stok Opname yang dikirim. Klik &ldquo;Mulai Sesi Hitung Fisik Baru&rdquo; untuk memulai pencocokan stok.
          </div>
        ) : (
          opnameSessions.map((sess) => (
            <div
              key={sess.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{sess.title}</h3>
                  <p className="text-[11px] text-slate-600">
                    Oleh: {sess.createdBy.name} ({sess.createdBy.role}) •{" "}
                    {formatDateTimeJakarta(sess.createdAt)} • Batas Toleransi:{" "}
                    <strong className="font-mono">{formatRupiah(sess.toleranceThreshold)}</strong>
                  </p>
                </div>
                <StatusBadge
                  status={sess.items.some((i) => i.exceedsTolerance) ? "PERLU_DIPERIKSA" : "SESUAI"}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-[11px] font-bold uppercase text-slate-600">
                      <th className="py-3 px-4">Barang &amp; Area</th>
                      <th className="py-3 px-4 text-right">Stok Sistem</th>
                      <th className="py-3 px-4 text-right">Stok Fisik</th>
                      <th className="py-3 px-4 text-right">Selisih Unit</th>
                      <th className="py-3 px-4 text-right">Nilai Selisih (Rp)</th>
                      <th className="py-3 px-4">Status Toleransi</th>
                      <th className="py-3 px-4">Evaluasi Pemilik</th>
                      <th className="py-3 px-4 text-right">Penyelesaian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sess.items.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          item.exceedsTolerance
                            ? "bg-[#FFF1F2]/40 hover:bg-[#FFF1F2]/80"
                            : "hover:bg-slate-50"
                        }
                      >
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{item.product.name}</p>
                          <div className="mt-1">
                            <StatusBadge status={item.areaType} />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {formatNumber(item.systemStock)} {item.product.sellUnit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {formatNumber(item.physicalStock)} {item.product.sellUnit}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-extrabold ${
                            item.differenceUnit === 0 ? "text-[#166534]" : "text-[#9F1239]"
                          }`}
                        >
                          {item.differenceUnit > 0
                            ? `+${formatNumber(item.differenceUnit)}`
                            : formatNumber(item.differenceUnit)}{" "}
                          {item.product.sellUnit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {formatRupiah(item.lossValueRp)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={item.toleranceStatus} />
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={item.ownerDecision} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {item.differenceUnit !== 0 && (
                            <button
                              type="button"
                              onClick={() => onOpenAnomaly(item)}
                              className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] cursor-pointer"
                            >
                              {item.exceedsTolerance
                                ? "Penyelesaian Anomali"
                                : "Lihat / Penjelasan"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

