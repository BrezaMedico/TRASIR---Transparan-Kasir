"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  UsersThree,
  EnvelopeSimple,
  WarningCircle,
  Trash,
  ShieldCheck,
  Copy,
  Link as LinkIcon,
  Key,
  LockKey,
} from "@phosphor-icons/react";
import { useToast, type SessionState } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData } from "@/lib/client-cache";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTimeJakarta } from "@/lib/format";
import {
  formatRoleLabel,
  InvitableRole,
  UserRole,
  validateUsername,
} from "@/lib/rbac-shared";

interface TeamMember {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  isAssigned: boolean;
  hasOpenShift: boolean;
  unclosedSalesCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface OutgoingInvitation {
  id: string;
  storeName: string;
  code: string | null;
  targetUsername: string | null;
  assignedRole: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  targetUser: { id: string; name: string; username: string } | null;
  invitedBy: { id: string; name: string; username: string };
}

export function TeamCollaboratorPanel({
  session,
  refreshSession,
}: {
  session: SessionState;
  refreshSession: () => Promise<void>;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const cachedUsers = getCachedData<{
    users?: TeamMember[];
    activeOwnerCount?: number;
    activeAdminCount?: number;
  }>("/api/users");
  const cachedInvs = getCachedData<{ invitations?: OutgoingInvitation[] }>("/api/invitations");

  const [members, setMembers] = useState<TeamMember[]>(cachedUsers?.users || []);
  const [activeOwnerCount, setActiveOwnerCount] = useState(cachedUsers?.activeOwnerCount ?? 0);
  const [activeAdminCount, setActiveAdminCount] = useState(cachedUsers?.activeAdminCount ?? 0);
  const [invitations, setInvitations] = useState<OutgoingInvitation[]>(
    cachedInvs?.invitations || []
  );
  const [loading, setLoading] = useState(!cachedUsers);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteMode, setInviteMode] = useState<"CODE" | "USERNAME">("CODE");
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableRole>("KASIR");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [latestCreatedInvite, setLatestCreatedInvite] = useState<{
    code: string;
    role: string;
    invitePath: string;
  } | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [openShiftConfirm, setOpenShiftConfirm] = useState<{
    member: TeamMember;
    count: number;
  } | null>(null);

  const loadTeamData = useCallback(async () => {
    const hasCached = Boolean(getCachedData("/api/users"));
    if (!hasCached) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const usersRes = await fetchJsonCached<{
        users?: TeamMember[];
        activeOwnerCount?: number;
        activeAdminCount?: number;
        error?: string;
      }>("/api/users", { force: true });

      if (usersRes.ok) {
        setMembers(usersRes.data.users || []);
        setActiveOwnerCount(usersRes.data.activeOwnerCount ?? 0);
        setActiveAdminCount(usersRes.data.activeAdminCount ?? 0);
      } else {
        setLoadError(usersRes.data?.error || "Gagal memuat data anggota tim.");
      }

      const invRes = await fetchJsonCached<{
        invitations?: OutgoingInvitation[];
        error?: string;
      }>("/api/invitations", { force: true });

      if (invRes.ok) {
        setInvitations(invRes.data.invitations || []);
      } else if (usersRes.ok) {
        setLoadError(invRes.data?.error || "Gagal memuat data undangan ruangan.");
      }
    } catch {
      const msg = "Gagal memuat data tim dan undangan. Periksa koneksi Anda.";
      setLoadError(msg);
      if (!hasCached) {
        showToast(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  const usernameValidation = useMemo(() => {
    if (!inviteUsername) return null;
    return validateUsername(inviteUsername);
  }, [inviteUsername]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} berhasil disalin.`, "success");
    } catch {
      showToast(`Gagal menyalin ${label.toLowerCase()}.`, "error");
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteMode === "USERNAME") {
      const check = validateUsername(inviteUsername);
      if (!check.valid) {
        showToast(check.error || "Format username tidak valid.", "error");
        return;
      }
    }

    setSendingInvite(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteType: inviteMode,
          username: inviteMode === "USERNAME" ? inviteUsername.trim().toLowerCase() : undefined,
          assignedRole: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal membuat undangan.", "error");
        return;
      }

      if (data.inviteCode) {
        setLatestCreatedInvite({
          code: data.inviteCode,
          role: inviteRole,
          invitePath: data.invitePath || `/register?invite=${data.inviteCode}`,
        });
      }

      showToast(
        inviteMode === "CODE"
          ? `Kode undangan ${data.inviteCode} (${formatRoleLabel(inviteRole)}) berhasil dibuat.`
          : `Undangan terkirim ke @${inviteUsername.trim().toLowerCase()} (${formatRoleLabel(inviteRole)}).`,
        "success"
      );
      setInviteUsername("");
      await loadTeamData();
    } catch {
      showToast("Koneksi bermasalah saat membuat undangan.", "error");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mencabut undangan.", "error");
        return;
      }
      showToast("Undangan berhasil dicabut.", "info");
      await loadTeamData();
    } catch {
      showToast("Gagal mencabut undangan.", "error");
    }
  };

  const handleChangeRole = async (member: TeamMember, newRole: UserRole) => {
    if (member.role === newRole) return;
    setBusyUserId(member.id);
    try {
      const res = await fetch(`/api/users/${member.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengubah role.", "error");
        return;
      }
      showToast(
        `Role @${member.username} diubah menjadi ${formatRoleLabel(newRole)}.`,
        "success"
      );
      if (data.selfChanged && data.redirectTo) {
        await refreshSession();
        router.replace(data.redirectTo);
        return;
      }
      await loadTeamData();
    } catch {
      showToast("Gagal memproses perubahan role.", "error");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRevokeAccess = async (member: TeamMember, forceWithOpenShift = false) => {
    setBusyUserId(member.id);
    try {
      const res = await fetch(`/api/users/${member.id}/revoke`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceWithOpenShift }),
      });
      const data = await res.json();
      if (res.status === 409 && data.hasOpenShift) {
        setOpenShiftConfirm({ member, count: data.unclosedSalesCount });
        return;
      }
      if (!res.ok) {
        showToast(data.error || "Gagal mencabut akses anggota tim.", "error");
        return;
      }
      setOpenShiftConfirm(null);
      showToast(`Akses ruangan @${member.username} telah dicabut.`, "info");
      if (data.selfRevoked) {
        await refreshSession();
        router.replace("/menunggu-undangan");
        return;
      }
      await loadTeamData();
    } catch {
      showToast("Gagal mencabut akses.", "error");
    } finally {
      setBusyUserId(null);
    }
  };

  const actorIsPemilik = session.user.role === "PEMILIK";

  return (
    <div className="space-y-5">
      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF2A63]/35 bg-[#FFF0F4] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <p className="text-xs font-semibold text-[#D41448]">{loadError}</p>
          <button
            type="button"
            onClick={loadTeamData}
            className="self-start sm:self-auto px-3.5 min-h-[36px] rounded-xl bg-[#202531] text-white text-xs font-bold cursor-pointer shrink-0"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {/* Form Buat Undangan */}
      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#202531]/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
              <UserPlus size={18} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#202531]">
                Undang Pegawai ke Ruangan
              </h2>
              <p className="text-xs text-[#525866] mt-0.5">
                Buat kode undangan atau kirim undangan langsung ke akun pegawai.
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Metode undangan"
            className="inline-flex p-1 rounded-xl bg-[#EBEBEB]/75 border border-[#202531]/10 shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inviteMode === "CODE"}
              onClick={() => setInviteMode("CODE")}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                inviteMode === "CODE"
                  ? "bg-[#202531] text-white"
                  : "text-[#525866] hover:text-[#202531]"
              }`}
            >
              Kode &amp; Tautan Undangan
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inviteMode === "USERNAME"}
              onClick={() => setInviteMode("USERNAME")}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                inviteMode === "USERNAME"
                  ? "bg-[#202531] text-white"
                  : "text-[#525866] hover:text-[#202531]"
              }`}
            >
              Akun Username Terdaftar
            </button>
          </div>
        </div>

        <form onSubmit={handleSendInvite} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
          {inviteMode === "USERNAME" && (
            <div className="md:col-span-4">
              <label htmlFor="invite-username" className="block text-xs font-bold text-slate-700 mb-1.5">
                Username Pegawai
              </label>
              <input
                id="invite-username"
                type="text"
                required
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="contoh: budi_01"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
              />
              {usernameValidation && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    usernameValidation.valid ? "text-[#202531]" : "text-[#D41448]"
                  }`}
                >
                  {usernameValidation.valid
                    ? `Target: @${usernameValidation.normalized}`
                    : usernameValidation.error}
                </p>
              )}
            </div>
          )}

          <div className={inviteMode === "USERNAME" ? "md:col-span-5" : "md:col-span-8"}>
            <label htmlFor="invite-role" className="block text-xs font-bold text-slate-700 mb-1.5">
              Hak Akses yang Ditetapkan
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InvitableRole)}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 focus:border-[#202531] focus:outline-none"
            >
              <option value="KASIR">Kasir (POS &amp; Riwayat Transaksi)</option>
              <option value="GUDANG">Gudang (Produk, Bahan Baku, Resep &amp; Stok)</option>
              <option value="KASIR_GUDANG">Kasir + Gudang (Akses POS dan Gudang)</option>
              <option value="MANAJER">Manajer (Pengelolaan Penuh Setara Pemilik)</option>
            </select>
          </div>

          <div className={inviteMode === "USERNAME" ? "md:col-span-3 md:pt-6" : "md:col-span-4 md:pt-6"}>
            <button
              type="submit"
              disabled={sendingInvite}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#01DAD7] px-4 text-sm font-extrabold text-[#202531] hover:opacity-90 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {inviteMode === "CODE" ? (
                <Key size={17} weight="bold" aria-hidden="true" />
              ) : (
                <UserPlus size={17} weight="bold" aria-hidden="true" />
              )}
              <span>
                {sendingInvite
                  ? "Memproses..."
                  : inviteMode === "CODE"
                  ? "Buat Kode Undangan"
                  : "Kirim Undangan"}
              </span>
            </button>
          </div>
        </form>

        {latestCreatedInvite && (
          <div className="rounded-xl border border-[#01DAD7] bg-[#01DAD7]/15 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#202531]">
                Kode Undangan Siap Dibagikan ({formatRoleLabel(latestCreatedInvite.role)})
              </p>
              <p className="font-mono text-base font-extrabold text-slate-900">
                {latestCreatedInvite.code}
              </p>
              <p className="text-[11px] text-[#202531]">
                Bagikan kode atau tautan ini agar calon anggota langsung bergabung dengan hak akses yang ditetapkan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyText(latestCreatedInvite.code, "Kode undangan")}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl bg-white border border-[#01DAD7] text-xs font-bold text-[#202531] cursor-pointer"
              >
                <Copy size={15} weight="bold" aria-hidden="true" />
                <span>Salin Kode</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const fullUrl =
                    typeof window !== "undefined"
                      ? `${window.location.origin}${latestCreatedInvite.invitePath}`
                      : latestCreatedInvite.invitePath;
                  copyText(fullUrl, "Tautan undangan");
                }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl bg-[#01DAD7] text-xs font-extrabold text-[#202531] hover:opacity-90 cursor-pointer"
              >
                <LinkIcon size={15} weight="bold" aria-hidden="true" />
                <span>Salin Tautan Daftar</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Konfirmasi Shift Terbuka saat Cabut Akses */}
      {openShiftConfirm && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF2A63]/35 bg-[#FFF0F4] p-5 space-y-3"
        >
          <div className="flex items-start gap-3">
            <WarningCircle size={22} weight="fill" className="text-[#D41448] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-[#D41448]">
                Peringatan: Shift Kasir Belum Ditutup (@{openShiftConfirm.member.username})
              </p>
              <p className="text-xs text-[#D41448]">
                Anggota ini masih memiliki {openShiftConfirm.count} transaksi penjualan yang belum ditutup pada tutup shift. Disarankan menutup shift terlebih dahulu, atau lanjutkan pencabutan dengan catatan di Activity Log.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pl-8">
            <button
              type="button"
              onClick={() => setOpenShiftConfirm(null)}
              className="min-h-[40px] px-4 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 cursor-pointer"
            >
              Batal (Tutup Shift Dulu)
            </button>
            <button
              type="button"
              onClick={() => handleRevokeAccess(openShiftConfirm.member, true)}
              className="min-h-[40px] px-4 rounded-xl bg-[#D41448] text-xs font-bold text-white cursor-pointer"
            >
              Tetap Cabut Akses
            </button>
          </div>
        </div>
      )}

      {/* Daftar Anggota Tim Aktif */}
      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#202531]/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
              <UsersThree size={18} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#202531]">
                Anggota Ruangan Aktif ({members.length})
              </h2>
              {!actorIsPemilik ? (
                <p className="text-xs text-[#525866] mt-0.5 inline-flex items-center gap-1.5">
                  <LockKey size={13} weight="bold" aria-hidden="true" />
                  <span>Akun Pemilik terlindungi dan tidak dapat diubah oleh Manajer.</span>
                </p>
              ) : (
                <p className="text-xs text-[#525866] mt-0.5">
                  Kelola jabatan serta akses anggota tim di ruangan ini.
                </p>
              )}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl bg-[#EBEBEB]/60 border border-[#202531]/12 px-3.5 py-2 text-xs font-bold text-[#202531] shrink-0">
            <ShieldCheck size={15} weight="duotone" aria-hidden="true" />
            <span>
              Pemilik: {activeOwnerCount} · Pengelola: {activeAdminCount}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-6 text-sm text-slate-500">Memuat anggota tim...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                  <th className="py-3 pr-4">Anggota</th>
                  <th className="py-3 px-4">Jabatan / Role</th>
                  <th className="py-3 px-4">Status Shift</th>
                  <th className="py-3 pl-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {members.map((member) => {
                  const targetIsPemilik = member.role === "PEMILIK";
                  const protectedFromManager = !actorIsPemilik && targetIsPemilik;
                  const isLastOwner =
                    targetIsPemilik && member.isActive && activeOwnerCount <= 1;

                  return (
                    <tr key={member.id}>
                      <td className="py-3.5 pr-4">
                        <p className="font-bold text-slate-900">
                          {member.name}{" "}
                          {member.id === session.user.id && (
                            <span className="text-[11px] font-semibold text-[#202531]">
                              (Anda)
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-slate-500">@{member.username}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        {protectedFromManager ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EBEBEB] border border-slate-300 text-xs font-extrabold text-[#202531]">
                            <LockKey size={14} weight="bold" aria-hidden="true" />
                            <span>Pemilik (Dilindungi)</span>
                          </span>
                        ) : (
                          <select
                            aria-label={`Ubah role untuk ${member.name}`}
                            disabled={busyUserId === member.id || isLastOwner}
                            title={
                              isLastOwner
                                ? "Satu-satunya Pemilik aktif pada ruangan tidak dapat diturunkan"
                                : "Ubah hak akses anggota"
                            }
                            value={member.role}
                            onChange={(e) => handleChangeRole(member, e.target.value as UserRole)}
                            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 focus:border-[#202531] focus:outline-none disabled:opacity-60"
                          >
                            {actorIsPemilik && <option value="PEMILIK">Pemilik</option>}
                            <option value="MANAJER">Manajer</option>
                            <option value="KASIR_GUDANG">Kasir + Gudang</option>
                            <option value="KASIR">Kasir</option>
                            <option value="GUDANG">Gudang</option>
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {member.hasOpenShift ? (
                          <StatusBadge
                            status="SHIFT_TERBUKA"
                            tone="amber"
                            customLabel={`Shift Aktif (${member.unclosedSalesCount} tx)`}
                          />
                        ) : (
                          <StatusBadge status="AMAN" tone="green" customLabel="Aman" />
                        )}
                      </td>

                      <td className="py-3.5 pl-4 text-right">
                        {protectedFromManager ? (
                          <span className="text-xs font-semibold text-slate-400">
                            Dilindungi
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyUserId === member.id || isLastOwner}
                            title={
                              isLastOwner
                                ? "Satu-satunya Pemilik aktif ruangan tidak dapat dicabut aksesnya"
                                : "Cabut akses ruangan"
                            }
                            onClick={() => handleRevokeAccess(member, false)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] text-xs font-bold text-[#D41448] disabled:opacity-45 cursor-pointer"
                          >
                            <Trash size={15} weight="bold" aria-hidden="true" />
                            <span>Cabut Akses</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tabel Status Undangan Keluar */}
      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
          <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
            <EnvelopeSimple size={18} weight="duotone" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-[#202531]">
              Riwayat &amp; Status Undangan Ruangan ({invitations.length})
            </h2>
            <p className="text-xs text-[#525866] mt-0.5">
              Pantau tautan undangan aktif dan batalkan undangan yang belum diterima.
            </p>
          </div>
        </div>

        {invitations.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada undangan yang dibuat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                  <th className="py-3 pr-4">Kode &amp; Penerima</th>
                  <th className="py-3 px-4">Hak Akses</th>
                  <th className="py-3 px-4">Berlaku Hingga</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 pl-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invitations.map((inv) => {
                  const tone =
                    inv.status === "ACCEPTED"
                      ? "green"
                      : inv.status === "PENDING"
                      ? "amber"
                      : "red";
                  return (
                    <tr key={inv.id}>
                      <td className="py-3 pr-4">
                        <p className="font-mono text-xs font-extrabold text-[#202531]">
                          {inv.code || "-"}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {inv.targetUser
                            ? `${inv.targetUser.name} (@${inv.targetUser.username})`
                            : inv.targetUsername
                            ? `@${inv.targetUsername}`
                            : "Kode Terbuka (Siapa saja dengan kode)"}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-bold text-xs text-slate-800">
                        {formatRoleLabel(inv.assignedRole)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {formatDateTimeJakarta(inv.expiresAt)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={inv.status} tone={tone} customLabel={inv.status} />
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {inv.status === "PENDING" ? (
                          <div className="inline-flex items-center gap-2">
                            {inv.code && (
                              <button
                                type="button"
                                onClick={() => {
                                  const url =
                                    typeof window !== "undefined"
                                      ? `${window.location.origin}/register?invite=${encodeURIComponent(
                                          inv.code || ""
                                        )}`
                                      : `/register?invite=${inv.code}`;
                                  copyText(url, "Tautan undangan");
                                }}
                                className="min-h-[38px] px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#202531] cursor-pointer"
                              >
                                Salin Tautan
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCancelInvitation(inv.id)}
                              className="min-h-[38px] px-3 rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] text-xs font-bold text-[#D41448] cursor-pointer"
                            >
                              Cabut
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Selesai</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

