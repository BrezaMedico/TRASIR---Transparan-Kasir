"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateJakarta, formatRupiah } from "@/lib/format";
import {
  Plus,
  MagnifyingGlass,
  FileText,
  ArrowRight,
} from "@phosphor-icons/react";

interface PurchaseListItem {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  purchaseDate: string;
  fundingSource: string;
  captureMethod: string;
  totalAmount: number;
  aiValidationStatus: string;
  approvalStatus: string;
  ownerNotes: string | null;
  createdAt: string;
  submittedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string; role: string } | null;
}

export default function PembelianListPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [purchases, setPurchases] = useState<PurchaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setPurchases(data.purchases || []);
      }
    } catch {
      showToast("Gagal memuat daftar pengajuan pembelian.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  return (
    <AppShell>
      {(session) => {
        const canCreate = session.permissions.pembelian?.canCreate;
        const q = searchQuery.trim().toLowerCase();

        const filtered = purchases.filter((p) => {
          if (statusFilter === "MENUNGGU_PERSETUJUAN" && p.approvalStatus !== "MENUNGGU_PERSETUJUAN")
            return false;
          if (statusFilter === "PERLU_PERBAIKAN" && p.approvalStatus !== "PERLU_PERBAIKAN")
            return false;
          if (
            statusFilter === "TERINDIKASI_AI" &&
            !["ADA_SELISIH", "NOTA_GANDA", "TERINDIKASI_EDIT"].includes(p.aiValidationStatus)
          )
            return false;
          if (statusFilter === "DISETUJUI" && p.approvalStatus !== "DISETUJUI") return false;
          if (statusFilter === "DITOLAK" && p.approvalStatus !== "DITOLAK") return false;

          if (!q) return true;
          return (
            p.invoiceNumber.toLowerCase().includes(q) ||
            p.supplierName.toLowerCase().includes(q) ||
            p.submittedBy.name.toLowerCase().includes(q)
          );
        });

        return (
          <div className="space-y-6">
            {/* Top Bar: Title, Search, Status Filter Pills & + Catat Pembelian Baru */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Pembelian & Validasi Nota AI
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Daftar pengajuan pembelian barang, lencana hasil pembacaan AI (Gemini OCR), dan gerbang persetujuan Pemilik
                  </p>
                </div>

                {canCreate && (
                  <Link
                    href="/pembelian/input"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-extrabold hover:bg-[#24384E] transition-colors shrink-0"
                  >
                    <Plus size={18} weight="bold" aria-hidden="true" />
                    <span>+ Catat Pembelian Baru</span>
                  </Link>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-200">
                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { id: "ALL", label: "Semua" },
                      { id: "MENUNGGU_PERSETUJUAN", label: "Menunggu Persetujuan" },
                      { id: "PERLU_PERBAIKAN", label: "Perlu Perbaikan" },
                      { id: "TERINDIKASI_AI", label: "Terindikasi AI" },
                      { id: "DISETUJUI", label: "Disetujui" },
                      { id: "DITOLAK", label: "Ditolak" },
                    ] as const
                  ).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        statusFilter === pill.id
                          ? "bg-[#334E6B] text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Search Supplier / Employee */}
                <div className="relative w-full md:w-72">
                  <MagnifyingGlass
                    size={16}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nomor nota, pemasok, pegawai..."
                    aria-label="Cari pembelian"
                    className="w-full pl-9 pr-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Purchases Table / Mobile Card List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-10 text-center text-xs text-slate-600">
                  Memuat daftar pengajuan pembelian...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <FileText
                    size={36}
                    weight="duotone"
                    className="mx-auto text-slate-400"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      Belum ada pengajuan pembelian yang tercatat.
                    </p>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      Catat pembelian barang baru beserta lampiran bukti foto nota untuk divalidasi oleh AI dan disetujui Pemilik.
                    </p>
                  </div>
                  {canCreate && (
                    <Link
                      href="/pembelian/input"
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-xs font-bold"
                    >
                      <Plus size={16} weight="bold" aria-hidden="true" />
                      <span>Catat Pembelian Pertama</span>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                        <th className="py-3.5 px-4">Tanggal & No. Nota</th>
                        <th className="py-3.5 px-4">Pegawai Pengaju</th>
                        <th className="py-3.5 px-4">Pemasok & Sumber Dana</th>
                        <th className="py-3.5 px-4 text-right">Total Nilai Nota</th>
                        <th className="py-3.5 px-4">Validasi AI</th>
                        <th className="py-3.5 px-4">Status Persetujuan</th>
                        <th className="py-3.5 px-4 text-right">Pemeriksaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filtered.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => router.push(`/pembelian/${item.id}`)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <p className="font-mono font-extrabold text-[#334E6B]">
                              #{item.invoiceNumber}
                            </p>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              {formatDateJakarta(item.purchaseDate)}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{item.submittedBy.name}</p>
                            <p className="text-[11px] text-slate-600">{item.submittedBy.role}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{item.supplierName}</p>
                            <p className="text-[11px] text-slate-600">
                              {item.fundingSource === "DANA_TOKO"
                                ? "Belanja Pegawai (Dana Toko)"
                                : "Penerimaan Barang Belanja Pemilik"}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 tabular-nums">
                            {formatRupiah(item.totalAmount)}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={item.aiValidationStatus} />
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge status={item.approvalStatus} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/pembelian/${item.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-xs font-bold text-[#334E6B] hover:bg-slate-100"
                            >
                              <span>Detail</span>
                              <ArrowRight size={14} weight="bold" aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      }}
    </AppShell>
  );
}

