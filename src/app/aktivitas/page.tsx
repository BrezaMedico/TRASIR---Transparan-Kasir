"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta } from "@/lib/format";
import {
  BellRinging,
  ClockCounterClockwise,
  CheckCircle,
  ArrowUpRight,
  LockKey,
} from "@phosphor-icons/react";

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  severity: string;
  category: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  actionType: string;
  actionSummary: string;
  entityType: string;
  entityId: string | null;
  beforeData: string | null;
  afterData: string | null;
  approvalState: string | null;
  linkUrl: string | null;
  createdAt: string;
}

export default function AktivitasPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"notifications" | "audit">("audit");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionTypeFilter) params.set("actionType", actionTypeFilter);
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/audit?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.auditLogs || []);
        setNotifications(data.notifications || []);
      }
    } catch {
      showToast("Gagal memuat riwayat aktivitas.", "error");
    } finally {
      setLoading(false);
    }
  }, [actionTypeFilter, roleFilter, showToast]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_ALL_READ" }),
      });
      showToast("Seluruh notifikasi ditandai sudah dibaca.", "info");
      await loadActivity();
    } catch {
      showToast("Gagal memperbarui notifikasi.", "error");
    }
  };

  return (
    <AppShell>
      {(session, refreshSession) => {
        const filteredAudit = auditLogs.filter((log) => {
          if (dateFilter && !log.createdAt.startsWith(dateFilter)) return false;
          return true;
        });

        return (
          <div className="space-y-6">
            {/* Header & 2 Separation Tabs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Notifikasi & Log Aktivitas (Audit Trail Permanen)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Pusat tindak lanjut peringatan penting dan rekam jejak seluruh aktivitas pengguna yang permanen (tidak dapat dihapus)
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-[#334E6B]">
                  <LockKey size={15} weight="bold" aria-hidden="true" />
                  <span>Dilindungi dari Penghapusan</span>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <div
                  role="tablist"
                  aria-label="Tab Notifikasi dan Audit Trail"
                  className="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "audit"}
                    onClick={() => setActiveTab("audit")}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "audit"
                        ? "bg-[#334E6B] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <ClockCounterClockwise size={16} weight="bold" aria-hidden="true" />
                    <span>Log Aktivitas Lengkap ({filteredAudit.length})</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "notifications"}
                    onClick={() => setActiveTab("notifications")}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeTab === "notifications"
                        ? "bg-[#334E6B] text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <BellRinging size={16} weight="bold" aria-hidden="true" />
                    <span>
                      Pusat Notifikasi ({notifications.filter((n) => !n.isRead).length} Baru)
                    </span>
                  </button>
                </div>

                {/* Filters for Audit Log */}
                {activeTab === "audit" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter jenis aktivitas"
                      value={actionTypeFilter}
                      onChange={(e) => setActionTypeFilter(e.target.value)}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                    >
                      <option value="">Semua Jenis Aktivitas</option>
                      <option value="PEMBELIAN">Pembelian & Validasi AI</option>
                      <option value="PENJUALAN">Penjualan & Tutup Shift</option>
                      <option value="PERUBAHAN_TRANSAKSI">Perubahan Transaksi</option>
                      <option value="PERUBAHAN_STOK">Perubahan Stok</option>
                      <option value="STOK_OPNAME">Stok Opname</option>
                      <option value="KATALOG">Katalog & Resep</option>
                      <option value="HAK_AKSES">Hak Akses & Akun</option>
                      <option value="LOGIN">Sesi Login</option>
                    </select>

                    {session.user.role !== "KASIR" && session.user.role !== "GUDANG" && (
                      <select
                        aria-label="Filter jabatan pengguna"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="">Semua Jabatan</option>
                        <option value="PEMILIK">Pemilik</option>
                        <option value="MANAJER">Manajer / Pengawas</option>
                        <option value="KASIR">Kasir</option>
                        <option value="GUDANG">Bagian Gudang</option>
                      </select>
                    )}

                    <input
                      type="date"
                      aria-label="Filter tanggal kejadian"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                    />
                  </div>
                )}

                {activeTab === "notifications" && notifications.some((n) => !n.isRead) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleMarkAllRead();
                      await refreshSession();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <CheckCircle size={15} weight="bold" aria-hidden="true" />
                    <span>Tandai Semua Sudah Dibaca</span>
                  </button>
                )}
              </div>
            </div>

            {/* TAB 1: AUDIT TRAIL LENGKAP */}
            {activeTab === "audit" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-10 text-center text-xs text-slate-600">
                    Memuat catatan Audit Trail dari database...
                  </div>
                ) : filteredAudit.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-600">
                    Belum ada catatan aktivitas yang sesuai dengan filter.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredAudit.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 hover:bg-slate-50 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-600">
                              {formatDateTimeJakarta(log.createdAt)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#E8EEF4] text-[#334E6B] text-[11px] font-extrabold">
                              {log.actorName} ({log.actorRole})
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-bold">
                              {log.actionType}
                            </span>
                            {log.approvalState && (
                              <StatusBadge status={log.approvalState} />
                            )}
                          </div>

                          <p className="text-xs font-bold text-slate-900">
                            {log.actionSummary}
                          </p>

                          {(log.beforeData || log.afterData) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
                              {log.beforeData && (
                                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 truncate">
                                  <strong>Sebelum:</strong> {log.beforeData}
                                </div>
                              )}
                              {log.afterData && (
                                <div className="p-2 rounded-lg bg-[#F0FDFA] text-[#0F766E] truncate">
                                  <strong>Sesudah:</strong> {log.afterData}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {log.linkUrl && (
                          <div className="shrink-0">
                            <Link
                              href={log.linkUrl}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-[#334E6B] hover:bg-slate-100"
                            >
                              <span>Lihat Detail Terkait</span>
                              <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PUSAT NOTIFIKASI */}
            {activeTab === "notifications" && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-600">
                    Belum ada notifikasi peringatan atau tindakan menunggu.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !n.isRead
                          ? "bg-[#E8EEF4]/40 border-[#334E6B]"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">{n.title}</span>
                          {!n.isRead && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FC5086] text-white text-[10px] font-bold">
                              Baru
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">{n.message}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTimeJakarta(n.createdAt)}
                        </p>
                      </div>

                      <Link
                        href={n.linkUrl}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#334E6B] text-white text-xs font-bold hover:bg-[#24384E] shrink-0"
                      >
                        <span>Tindak Lanjuti</span>
                        <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                      </Link>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      }}
    </AppShell>
  );
}

