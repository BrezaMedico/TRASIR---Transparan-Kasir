"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Copy,
  Check,
  ArrowsClockwise,
  SignOut,
  EnvelopeOpen,
  CheckCircle,
  XCircle,
  Key,
  Storefront,
  ArrowRight,
} from "@phosphor-icons/react";
import { useToast } from "@/components/layout/AppShell";
import { clearAllClientCache } from "@/lib/client-cache";
import { formatRoleLabel, getDefaultRedirectForRole } from "@/lib/rbac-shared";

interface InvitationItem {
  id: string;
  storeName: string;
  code?: string | null;
  assignedRole: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    name: string;
    username: string;
    role: string;
  };
}

interface WaitingUser {
  id: string;
  name: string;
  username: string;
  role: string;
  isAssigned: boolean;
  roomId?: string | null;
}

export default function WaitingInvitationPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [user, setUser] = useState<WaitingUser | null>(null);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Gabung via kode undangan
  const [inviteCode, setInviteCode] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);

  // Buat ruangan baru
  const [roomName, setRoomName] = useState("");
  const [roomAddress, setRoomAddress] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const code = sp.get("invite");
      if (code) setInviteCode(code.trim().toUpperCase());
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = await meRes.json();

      if (!meData.authenticated || !meData.user) {
        router.replace("/login");
        return;
      }

      if (meData.user.isAssigned && meData.user.roomId) {
        router.replace(getDefaultRedirectForRole(meData.user.role, true));
        return;
      }

      setUser(meData.user);

      const invRes = await fetch("/api/invitations", { cache: "no-store" });
      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData.invitations || []);
      }
    } catch {
      showToast("Gagal memuat status ruangan dan undangan.", "error");
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyUsername = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.username);
      setCopied(true);
      showToast(`Username @${user.username} disalin.`, "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Gagal menyalin username.", "error");
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoiningCode(true);
    try {
      const res = await fetch("/api/invitations/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Kode undangan tidak dapat digunakan.", "error");
        return;
      }
      clearAllClientCache();
      showToast(`Berhasil bergabung ke ruangan "${data.room?.name || ""}".`, "success");
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      showToast("Koneksi bermasalah saat bergabung ke ruangan.", "error");
    } finally {
      setJoiningCode(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomName.trim().length < 2) {
      showToast("Nama ruangan minimal 2 karakter.", "error");
      return;
    }
    setCreatingRoom(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomName.trim(),
          roomAddress: roomAddress.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal membuat ruangan baru.", "error");
        return;
      }
      clearAllClientCache();
      showToast(`Ruangan "${data.room?.name || roomName}" berhasil dibuat.`, "success");
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleRespond = async (id: string, action: "ACCEPT" | "DECLINE") => {
    setRespondingId(id);
    try {
      const res = await fetch(`/api/invitations/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses undangan.", "error");
        await loadData();
        return;
      }

      if (action === "ACCEPT") {
        clearAllClientCache();
        showToast("Undangan diterima. Mengarahkan ke ruangan kerja...", "success");
        router.replace(data.redirectTo || "/dashboard");
      } else {
        showToast("Undangan ditolak.", "info");
        await loadData();
      }
    } catch {
      showToast("Koneksi bermasalah saat merespons undangan.", "error");
    } finally {
      setRespondingId(null);
    }
  };

  const handleLogout = async () => {
    clearAllClientCache();
    await fetch("/api/auth/logout", { method: "POST" });
    showToast("Anda telah keluar.", "info");
    router.replace("/login");
  };

  const pendingInvitations = invitations.filter((inv) => inv.status === "PENDING");
  const pastInvitations = invitations.filter((inv) => inv.status !== "PENDING");

  return (
    <div className="min-h-screen bg-[#EBEBEB] text-[#202531]">
      <header className="bg-white border-b border-[#202531]/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 font-extrabold text-[#202531]">
            <span className="w-9 h-9 rounded-xl bg-[#202531] text-[#01DAD7] flex items-center justify-center">
              <ShieldCheck size={20} weight="duotone" aria-hidden="true" />
            </span>
            <span>TRASIR</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <SignOut size={16} weight="bold" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Identitas Akun */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
              Belum Tergabung ke Ruangan Kerja
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Gabung ke Ruangan atau Buat Ruangan Baru
            </h1>
            <p className="text-sm text-slate-600">
              Masukkan kode undangan dari Pemilik/Manajer, terima undangan yang masuk ke username Anda, atau buat ruangan usaha baru.
            </p>
          </div>

          {loading ? (
            <div className="py-4 text-sm text-slate-500">Memuat data akun...</div>
          ) : (
            user && (
              <div className="rounded-xl border border-slate-200 bg-[#EBEBEB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Username Pribadi Anda
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-extrabold text-[#202531]">
                    @{user.username}
                  </p>
                  <p className="text-xs text-slate-600">{user.name}</p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyUsername}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  {copied ? (
                    <Check size={16} weight="bold" aria-hidden="true" />
                  ) : (
                    <Copy size={16} weight="bold" aria-hidden="true" />
                  )}
                  <span>{copied ? "Username Disalin" : "Salin Username"}</span>
                </button>
              </div>
            )
          )}
        </div>

        {/* 2 Pilihan: Gabung dengan Kode vs Buat Ruangan Baru */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form
            onSubmit={handleJoinByCode}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key size={20} weight="duotone" className="text-[#202531]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Gabung dengan Kode Undangan
                </h2>
              </div>
              <p className="text-xs text-slate-600">
                Masukkan kode undangan yang dibagikan Pemilik atau Manajer ruangan.
              </p>
              <div>
                <label htmlFor="join-code-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Kode Undangan
                </label>
                <input
                  id="join-code-input"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="TRS-XXXX-XXXX"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 font-mono text-sm font-bold text-slate-900 uppercase"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={joiningCode}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#01DAD7] px-4 text-xs font-extrabold text-[#202531] hover:opacity-90 disabled:opacity-60 cursor-pointer"
            >
              <span>{joiningCode ? "Memverifikasi..." : "Gabung ke Ruangan"}</span>
              <ArrowRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </form>

          <form
            onSubmit={handleCreateRoom}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Storefront size={20} weight="duotone" className="text-[#202531]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Buat Ruangan Baru
                </h2>
              </div>
              <p className="text-xs text-slate-600">
                Mulai ruang kerja baru dan otomatis menjadi Pemilik ruangan tersebut.
              </p>
              <div>
                <label htmlFor="new-room-name" className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Ruangan / Usaha
                </label>
                <input
                  id="new-room-name"
                  type="text"
                  required
                  minLength={2}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Contoh: Kedai Kopi Nusantara"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="new-room-addr" className="block text-xs font-bold text-slate-700 mb-1">
                  Alamat Singkat (Opsional)
                </label>
                <input
                  id="new-room-addr"
                  type="text"
                  value={roomAddress}
                  onChange={(e) => setRoomAddress(e.target.value)}
                  placeholder="Contoh: Bandung"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creatingRoom}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#202531] px-4 text-xs font-bold text-white hover:bg-[#2a3140] disabled:opacity-60 cursor-pointer"
            >
              <span>{creatingRoom ? "Membuat Ruangan..." : "Buat Ruangan & Jadi Pemilik"}</span>
              <ArrowRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </form>
        </div>

        {/* Kotak Masuk Undangan Username */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <EnvelopeOpen size={22} weight="duotone" className="text-[#202531]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-slate-900">Undangan Masuk ke Akun Anda</h2>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
              <span>Muat Ulang</span>
            </button>
          </div>

          {pendingInvitations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center space-y-1">
              <p className="text-sm font-bold text-slate-800">Belum ada undangan langsung yang aktif</p>
              <p className="text-xs text-slate-600">
                Gunakan formulir Kode Undangan di atas atau bagikan username Anda ke Pemilik/Manajer ruangan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="text-base font-extrabold text-slate-900">{inv.storeName}</p>
                    <p className="text-xs text-slate-600">
                      Diundang oleh <strong className="text-slate-800">{inv.invitedBy.name}</strong> (@
                      {inv.invitedBy.username}) sebagai{" "}
                      <span className="inline-flex items-center rounded-md bg-[#EBEBEB] px-2 py-0.5 font-bold text-[#202531]">
                        {formatRoleLabel(inv.assignedRole)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={respondingId === inv.id}
                      onClick={() => handleRespond(inv.id, "DECLINE")}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle size={16} weight="bold" aria-hidden="true" />
                      <span>Tolak</span>
                    </button>

                    <button
                      type="button"
                      disabled={respondingId === inv.id}
                      onClick={() => handleRespond(inv.id, "ACCEPT")}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-xl bg-[#01DAD7] text-xs font-extrabold text-[#202531] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle size={16} weight="bold" aria-hidden="true" />
                      <span>{respondingId === inv.id ? "Memproses..." : "Terima"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pastInvitations.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Riwayat Undangan Sebelumnya
              </p>
              <div className="space-y-2">
                {pastInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-slate-200/80 px-4 py-3 flex items-center justify-between text-xs text-slate-600"
                  >
                    <span>
                      {inv.storeName} ({formatRoleLabel(inv.assignedRole)})
                    </span>
                    <span className="font-bold text-slate-500">{inv.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
