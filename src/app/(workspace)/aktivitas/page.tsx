"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta } from "@/lib/format";
import { formatRoleLabel, isStoreAdmin } from "@/lib/rbac-shared";
import {
  formatActionTypeLabel,
  formatAuditChangePair,
  formatNotificationText,
} from "@/lib/audit-format";
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

  const cachedAudit = getCachedData<{
    auditLogs?: AuditLogRow[];
    notifications?: NotificationRow[];
  }>("/api/audit?");

  const [activeTab, setActiveTab] = useState<"notifications" | "audit">("audit");
  const [notifications, setNotifications] = useState<NotificationRow[]>(
    cachedAudit?.notifications || []
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>(cachedAudit?.auditLogs || []);
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(!cachedAudit);

  const loadActivity = useCallback(async () => {
    const params = new URLSearchParams();
    if (actionTypeFilter) params.set("actionType", actionTypeFilter);
    if (roleFilter) params.set("role", roleFilter);
    const url = `/api/audit?${params.toString()}`;
    const cached = getCachedData<{
      auditLogs?: AuditLogRow[];
      notifications?: NotificationRow[];
    }>(url);
    if (cached) {
      setAuditLogs(cached.auditLogs || []);
      setNotifications(cached.notifications || []);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { ok, data } = await fetchJsonCached<{
        auditLogs?: AuditLogRow[];
        notifications?: NotificationRow[];
      }>(url, { force: true });
      if (ok) {
        setAuditLogs(data.auditLogs || []);
        setNotifications(data.notifications || []);
      }
    } catch {
      if (!cached) {
        showToast("Gagal memuat riwayat aktivitas.", "error");
      }
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
                    Notifikasi &amp; Riwayat Aktivitas
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Pantau pemberitahuan penting dan catatan lengkap setiap kegiatan toko.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-[#202531]">
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
                        ? "bg-[#202531] text-white"
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
                        ? "bg-[#202531] text-white"
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
                      <option value="PEMBELIAN">Pembelian &amp; Nota</option>
                      <option value="PENJUALAN">Penjualan Kasir</option>
                      <option value="PERUBAHAN_TRANSAKSI">Perubahan Transaksi</option>
                      <option value="PERUBAHAN_STOK">Perubahan Stok</option>
                      <option value="STOK_OPNAME">Stok Opname</option>
                      <option value="KATALOG">Katalog &amp; Resep</option>
                      <option value="PRODUCT_REQUEST">Pengajuan Produk Baru</option>
                      <option value="HAK_AKSES">Hak Akses &amp; Akun</option>
                      <option value="LOGIN">Sesi Login</option>
                    </select>

                    {isStoreAdmin(session.user.role) && (
                      <select
                        aria-label="Filter jabatan pengguna"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="">Semua Jabatan</option>
                        <option value="PEMILIK">Pemilik</option>
                        <option value="MANAJER">Manajer</option>
                        <option value="KASIR_GUDANG">Kasir + Gudang</option>
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
                    {filteredAudit.map((log) => {
                      const isAdmin = isStoreAdmin(session.user.role);
                      const { beforeItems, afterItems } = formatAuditChangePair(
                        log.beforeData,
                        log.afterData,
                        { isAdmin }
                      );

                      return (
                        <div
                          key={log.id}
                          className="p-4 hover:bg-slate-50 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-600">
                                {formatDateTimeJakarta(log.createdAt)}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[#EBEBEB] text-[#202531] text-[11px] font-extrabold">
                                {log.actorName} ({formatRoleLabel(log.actorRole)})
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-bold">
                                {formatActionTypeLabel(log.actionType)}
                              </span>
                              {log.approvalState && (
                                <StatusBadge status={log.approvalState} />
                              )}
                            </div>

                            <p className="text-xs font-bold text-slate-900">
                              {log.actionSummary}
                            </p>

                            {(beforeItems.length > 0 || afterItems.length > 0) && (
                              <div className="space-y-1.5 pt-0.5">
                                {beforeItems.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-bold text-[#525866] mr-0.5">
                                      Sebelum:
                                    </span>
                                    {beforeItems.map((entry) => (
                                      <span
                                        key={`before-${entry.key}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#202531]/10 text-[#525866]"
                                      >
                                        <span className="font-semibold">{entry.label}:</span>
                                        <span className="font-bold text-[#202531]">
                                          {entry.value}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {afterItems.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-bold text-[#202531] mr-0.5">
                                      {beforeItems.length > 0 ? "Sesudah:" : "Detail:"}
                                    </span>
                                    {afterItems.map((entry) => (
                                      <span
                                        key={`after-${entry.key}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#202531]/15 text-[#525866]"
                                      >
                                        <span className="font-semibold">{entry.label}:</span>
                                        <span className="font-bold text-[#202531]">
                                          {entry.value}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {log.linkUrl && (
                            <div className="shrink-0">
                              <Link
                                href={log.linkUrl}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 text-xs font-bold text-[#202531] hover:bg-slate-100"
                              >
                                <span>Lihat Detail Terkait</span>
                                <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                          ? "bg-[#EBEBEB]/40 border-[#202531]"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">
                            {formatNotificationText(n.title)}
                          </span>
                          {!n.isRead && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FF2A63] text-white text-[10px] font-bold">
                              Baru
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700">
                          {formatNotificationText(n.message)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTimeJakarta(n.createdAt)}
                        </p>
                      </div>

                      <Link
                        href={n.linkUrl}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#202531] text-white text-xs font-bold hover:bg-[#2a3140] shrink-0"
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

