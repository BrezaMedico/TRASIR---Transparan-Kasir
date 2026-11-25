"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateJakarta, formatRupiah } from "@/lib/format";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { isStoreAdmin } from "@/lib/rbac-shared";
import {
  Plus,
  MagnifyingGlass,
  FileText,
  ArrowRight,
  Receipt,
} from "@phosphor-icons/react";

interface PurchaseListItem {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  purchaseDate: string;
  fundingSource: string;
  captureMethod: string;
  receiptImageData?: string;
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

  const cachedInitial = getCachedData<{ purchases?: PurchaseListItem[] }>("/api/purchases");
  const [purchases, setPurchases] = useState<PurchaseListItem[]>(cachedInitial?.purchases || []);
  const [loading, setLoading] = useState(!cachedInitial);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadPurchases = useCallback(async () => {
    const cached = getCachedData<{ purchases?: PurchaseListItem[] }>("/api/purchases");
    if (!cached) {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<{ purchases?: PurchaseListItem[] }>("/api/purchases", {
        force: true,
      });
      if (ok) {
        setPurchases(data.purchases || []);
      }
    } catch {
      if (!cached) {
        showToast("Gagal memuat daftar pengajuan pembelian.", "error");
      }
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
        const isAdmin = isStoreAdmin(session.user.role);
        const q = searchQuery.trim().toLowerCase();

        const filtered = purchases.filter((p) => {
          if (statusFilter === "MENUNGGU_PERSETUJUAN" && p.approvalStatus !== "MENUNGGU_PERSETUJUAN")
            return false;
          if (statusFilter === "PERLU_PERBAIKAN" && p.approvalStatus !== "PERLU_PERBAIKAN")
            return false;
          if (
            isAdmin &&
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

        const filterPills = isAdmin
          ? ([
              { id: "ALL", label: "Semua" },
              { id: "MENUNGGU_PERSETUJUAN", label: "Menunggu Persetujuan" },
              { id: "PERLU_PERBAIKAN", label: "Perlu Perbaikan" },
              { id: "TERINDIKASI_AI", label: "Ada Selisih AI" },
              { id: "DISETUJUI", label: "Disetujui" },
            ] as const)
          : ([
              { id: "ALL", label: "Semua" },
              { id: "MENUNGGU_PERSETUJUAN", label: "Menunggu Persetujuan" },
              { id: "PERLU_PERBAIKAN", label: "Perlu Perbaikan" },
              { id: "DISETUJUI", label: "Disetujui" },
            ] as const);

        return (
          <div className="space-y-6">
            {/* Top Bar */}
            <div className="bg-white rounded-2xl border border-[#202531]/15 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-[#202531]">
                    Daftar Pembelian
                  </h1>
                  <p className="text-xs text-[#525866] mt-1">
                    {isAdmin
                      ? "Tinjau pengajuan pembelian barang, baca lampiran nota dengan jelas, dan jalankan cek kesesuaian AI Gemini."
                      : "Catat pembelian barang dan lampirkan foto atau dokumen nota secara opsional."}
                  </p>
                </div>

                {canCreate && (
                  <Link
                    href="/pembelian/input"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 transition-opacity shrink-0"
                  >
                    <Plus size={18} weight="bold" aria-hidden="true" />
                    <span>Catat Pembelian Baru</span>
                  </Link>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-[#202531]/10">
                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {filterPills.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      className={`px-3 py-1.5 min-h-[40px] rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        statusFilter === pill.id
                          ? "bg-[#202531] text-white"
                          : "bg-[#EBEBEB] text-[#202531] hover:bg-[#202531]/10"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative w-full md:w-72">
                  <MagnifyingGlass
                    size={16}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#525866]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nomor nota, pemasok, pegawai..."
                    aria-label="Cari pembelian"
                    className="w-full pl-9 pr-3.5 py-2 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-medium text-[#202531] bg-[#F8FAFC] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Purchases List */}
            <div className="bg-white rounded-2xl border border-[#202531]/15 overflow-hidden">
              {loading ? (
                <div className="p-10 text-center text-xs text-[#525866]">
                  Memuat daftar pengajuan pembelian...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <FileText
                    size={36}
                    weight="duotone"
                    className="mx-auto text-[#525866]"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#202531]">
                      Belum ada pengajuan pembelian yang tercatat.
                    </p>
                    <p className="text-xs text-[#525866] max-w-md mx-auto">
                      Catat pembelian barang baru beserta lampiran nota (opsional) untuk ditinjau Manajer atau Pemilik.
                    </p>
                  </div>
                  {canCreate && (
                    <Link
                      href="/pembelian/input"
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-bold"
                    >
                      <Plus size={16} weight="bold" aria-hidden="true" />
                      <span>Catat Pembelian Pertama</span>
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#202531]/10 bg-[#F8FAFC] text-[11px] font-bold uppercase text-[#525866]">
                          <th className="py-3.5 px-4">Tanggal &amp; No. Nota</th>
                          <th className="py-3.5 px-4">Pegawai Pengaju</th>
                          <th className="py-3.5 px-4">Pemasok &amp; Sumber Dana</th>
                          <th className="py-3.5 px-4 text-right">Total Nilai Nota</th>
                          <th className="py-3.5 px-4">
                            {isAdmin ? "Nota & Cek AI" : "Lampiran Nota"}
                          </th>
                          <th className="py-3.5 px-4">Status Persetujuan</th>
                          <th className="py-3.5 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#202531]/10 text-xs">
                        {filtered.map((item) => {
                          const hasReceipt =
                            item.captureMethod !== "TANPA_NOTA" &&
                            item.aiValidationStatus !== "TANPA_NOTA";

                          return (
                            <tr
                              key={item.id}
                              onClick={() => router.push(`/pembelian/${item.id}`)}
                              className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                            >
                              <td className="py-3.5 px-4">
                                <p className="font-mono font-extrabold text-[#202531]">
                                  #{item.invoiceNumber}
                                </p>
                                <p className="text-[11px] text-[#525866] mt-0.5">
                                  {formatDateJakarta(item.purchaseDate)}
                                </p>
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-bold text-[#202531]">{item.submittedBy.name}</p>
                                <p className="text-[11px] text-[#525866]">{item.submittedBy.role}</p>
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-bold text-[#202531]">{item.supplierName}</p>
                                <p className="text-[11px] text-[#525866]">
                                  {item.fundingSource === "DANA_TOKO"
                                    ? "Belanja Pegawai (Dana Toko)"
                                    : "Penerimaan Barang Belanja Pemilik"}
                                </p>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-extrabold text-[#202531] tabular-nums">
                                {formatRupiah(item.totalAmount)}
                              </td>
                              <td className="py-3.5 px-4">
                                {isAdmin ? (
                                  <StatusBadge status={item.aiValidationStatus} />
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                                    <Receipt size={12} weight="bold" aria-hidden="true" />
                                    <span>{hasReceipt ? "Ada Nota" : "Tanpa Nota"}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <StatusBadge status={item.approvalStatus} />
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <Link
                                  href={`/pembelian/${item.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB]"
                                >
                                  <span>Detail</span>
                                  <ArrowRight size={14} weight="bold" aria-hidden="true" />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-[#202531]/10">
                    {filtered.map((item) => {
                      const hasReceipt =
                        item.captureMethod !== "TANPA_NOTA" &&
                        item.aiValidationStatus !== "TANPA_NOTA";

                      return (
                        <Link
                          key={item.id}
                          href={`/pembelian/${item.id}`}
                          className="block p-4 space-y-2.5 hover:bg-[#F8FAFC]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-xs font-extrabold text-[#202531]">
                                #{item.invoiceNumber}
                              </p>
                              <p className="text-sm font-bold text-[#202531] mt-0.5">
                                {item.supplierName}
                              </p>
                            </div>
                            <span className="font-mono text-sm font-extrabold tabular-nums text-[#202531]">
                              {formatRupiah(item.totalAmount)}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#525866]">
                            {item.submittedBy.name} • {formatDateJakarta(item.purchaseDate)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={item.approvalStatus} />
                            {isAdmin ? (
                              <StatusBadge status={item.aiValidationStatus} />
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#EBEBEB] border border-[#202531]/15 text-[11px] font-bold text-[#202531]">
                                {hasReceipt ? "Ada Nota" : "Tanpa Nota"}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }}
    </AppShell>
  );
}
