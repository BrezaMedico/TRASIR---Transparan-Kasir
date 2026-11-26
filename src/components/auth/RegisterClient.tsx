"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Eye,
  EyeSlash,
  ArrowRight,
  Storefront,
  Key,
  CheckCircle,
  WarningCircle,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useToast } from "@/components/layout/AppShell";
import { TrasirLogo } from "@/components/ui/TrasirLogo";
import { clearAllClientCache } from "@/lib/client-cache";
import { sanitizeInternalRedirect, validateUsername } from "@/lib/rbac-shared";

type RegisterMode = "CREATE_ROOM" | "JOIN_ROOM";

interface VerifiedInvite {
  valid: boolean;
  code?: string;
  roomName?: string;
  assignedRole?: string;
  assignedRoleLabel?: string;
  inviterName?: string;
  targetUsername?: string | null;
  expiresAt?: string;
  error?: string;
}

interface RegisterClientProps {
  initialInviteCode: string | null;
  rawRedirect: string | null;
}

export function RegisterClient({
  initialInviteCode,
  rawRedirect,
}: RegisterClientProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const safeRedirect = sanitizeInternalRedirect(rawRedirect, "/dashboard");

  const [mode, setMode] = useState<RegisterMode>(
    initialInviteCode ? "JOIN_ROOM" : "CREATE_ROOM"
  );
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Mode CREATE_ROOM
  const [roomName, setRoomName] = useState("");
  const [roomAddress, setRoomAddress] = useState("");
  const [counterNames, setCounterNames] = useState<string[]>(["Loket 1"]);

  // Mode JOIN_ROOM
  const [inviteCode, setInviteCode] = useState(initialInviteCode || "");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verifiedInvite, setVerifiedInvite] = useState<VerifiedInvite | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usernameCheck = useMemo(() => {
    if (!username) return null;
    return validateUsername(username);
  }, [username]);

  const verifyInviteCode = useCallback(async (rawCode: string) => {
    const cleaned = rawCode.trim();
    if (!cleaned) {
      setVerifiedInvite(null);
      return;
    }
    setVerifyingCode(true);
    try {
      const res = await fetch(
        `/api/invitations/verify?code=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" }
      );
      const data: VerifiedInvite = await res.json();
      setVerifiedInvite(data);
      if (data.valid && data.targetUsername) {
        setUsername((prev) => prev || data.targetUsername || "");
      }
    } catch {
      setVerifiedInvite({ valid: false, error: "Gagal memverifikasi kode undangan." });
    } finally {
      setVerifyingCode(false);
    }
  }, []);

  useEffect(() => {
    if (initialInviteCode) {
      verifyInviteCode(initialInviteCode);
    }
  }, [initialInviteCode, verifyInviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const check = validateUsername(username);
    if (!check.valid) {
      setErrorMsg(check.error || "Format username tidak valid.");
      return;
    }

    if (mode === "CREATE_ROOM" && roomName.trim().length < 2) {
      setErrorMsg("Nama ruangan / usaha wajib diisi minimal 2 karakter.");
      return;
    }

    if (mode === "JOIN_ROOM" && !inviteCode.trim()) {
      setErrorMsg("Kode undangan wajib diisi untuk bergabung ke ruangan.");
      return;
    }

    let didRedirect = false;
    setSubmitting(true);
    setRedirecting(false);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name: name.trim(),
          username: check.normalized,
          email: email.trim() || undefined,
          password,
          ...(mode === "CREATE_ROOM"
            ? {
                roomName: roomName.trim(),
                roomAddress: roomAddress.trim() || undefined,
                counterNames: counterNames
                  .map((c) => c.trim())
                  .filter((c) => c.length > 0),
              }
            : {
                inviteCode: inviteCode.trim(),
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menyelesaikan pendaftaran.");
        return;
      }

      clearAllClientCache();
      showToast(
        mode === "CREATE_ROOM"
          ? `Ruangan "${data.room?.name || roomName.trim()}" berhasil dibuat. Anda ditetapkan sebagai Pemilik.`
          : `Berhasil bergabung ke ruangan "${data.room?.name || ""}".`,
        "success"
      );

      didRedirect = true;
      setRedirecting(true);
      if (data.redirectTo === "/dashboard" && rawRedirect) {
        router.replace(safeRedirect);
      } else {
        router.replace(data.redirectTo || "/dashboard");
      }
    } catch {
      setErrorMsg("Koneksi jaringan bermasalah. Coba lagi.");
    } finally {
      if (!didRedirect) {
        setSubmitting(false);
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#EBEBEB] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg"
          >
            <TrasirLogo className="h-8 w-auto" priority />
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Daftar Akun &amp; Pilih Ruangan Kerja
          </h1>
          <p className="text-sm text-slate-600">
            Buat ruangan usaha baru sebagai Pemilik, atau gabung ke ruangan tim menggunakan kode undangan.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] px-4 py-3 text-xs font-semibold text-[#D41448]"
              >
                {errorMsg}
              </div>
            )}

            {/* Dua pilihan utama tanpa pemilihan role mandiri */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-700">
                Pilih Tujuan Pendaftaran
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMode("CREATE_ROOM");
                    setErrorMsg(null);
                  }}
                  aria-pressed={mode === "CREATE_ROOM"}
                  className={`text-left p-4 rounded-xl border transition-colors min-h-[44px] cursor-pointer ${
                    mode === "CREATE_ROOM"
                      ? "border-[#202531] bg-[#EBEBEB]/60 text-[#202531] ring-1 ring-[#202531]"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Storefront
                    size={22}
                    weight={mode === "CREATE_ROOM" ? "fill" : "duotone"}
                    className={mode === "CREATE_ROOM" ? "text-[#202531]" : "text-slate-500"}
                    aria-hidden="true"
                  />
                  <span className="block text-sm font-extrabold mt-2">Buat Ruangan Baru</span>
                  <span className="block text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    Siapkan ruang kerja usaha Anda sendiri dan otomatis menjadi Pemilik.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("JOIN_ROOM");
                    setErrorMsg(null);
                  }}
                  aria-pressed={mode === "JOIN_ROOM"}
                  className={`text-left p-4 rounded-xl border transition-colors min-h-[44px] cursor-pointer ${
                    mode === "JOIN_ROOM"
                      ? "border-[#202531] bg-[#EBEBEB]/60 text-[#202531] ring-1 ring-[#202531]"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Key
                    size={22}
                    weight={mode === "JOIN_ROOM" ? "fill" : "duotone"}
                    className={mode === "JOIN_ROOM" ? "text-[#202531]" : "text-slate-500"}
                    aria-hidden="true"
                  />
                  <span className="block text-sm font-extrabold mt-2">
                    Gabung ke Ruangan
                  </span>
                  <span className="block text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    Masukkan kode undangan dari Pemilik atau Manajer ruangan.
                  </span>
                </button>
              </div>
            </fieldset>

            {/* Bagian Khusus Mode Buat Ruangan Baru */}
            {mode === "CREATE_ROOM" && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs font-extrabold text-[#202531]">
                  Informasi Ruangan Baru
                </p>
                <div>
                  <label htmlFor="reg-room-name" className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Ruangan / Toko
                  </label>
                  <input
                    id="reg-room-name"
                    type="text"
                    required
                    minLength={2}
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Contoh: Kopi & Kelontong Sejahtera"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-room-address" className="block text-xs font-bold text-slate-700 mb-1">
                    Lokasi / Alamat Singkat (Opsional)
                  </label>
                  <input
                    id="reg-room-address"
                    type="text"
                    value={roomAddress}
                    onChange={(e) => setRoomAddress(e.target.value)}
                    placeholder="Contoh: Jakarta Selatan"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
                  />
                </div>

                {/* Manajemen Loket Awal Saat Mendaftar Perusahaan */}
                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-[#202531]">
                        Jumlah &amp; Nama Loket Kasir
                      </p>
                      <p className="text-[11px] text-slate-600">
                        Pegawai akan memilih loket ini sebelum membuka shift agar kas tidak tercampur.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setCounterNames(
                              Array.from({ length: preset }, (_, idx) =>
                                counterNames[idx]?.trim() || `Loket ${idx + 1}`
                              )
                            )
                          }
                          className={`px-2.5 min-h-[32px] rounded-lg text-[11px] font-bold border cursor-pointer ${
                            counterNames.length === preset
                              ? "bg-[#202531] text-white border-[#202531]"
                              : "bg-white text-slate-700 border-slate-300"
                          }`}
                        >
                          {preset} Loket
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {counterNames.map((cname, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          minLength={1}
                          maxLength={40}
                          aria-label={`Nama loket ${idx + 1}`}
                          value={cname}
                          onChange={(e) =>
                            setCounterNames((prev) =>
                              prev.map((item, i) => (i === idx ? e.target.value : item))
                            )
                          }
                          placeholder={`Loket ${idx + 1}`}
                          className="flex-1 min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900"
                        />
                        {counterNames.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCounterNames((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`Hapus ${cname || `Loket ${idx + 1}`}`}
                            className="px-3 min-h-[40px] rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] text-[11px] font-bold text-[#D41448] cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    ))}

                    {counterNames.length < 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCounterNames((prev) => [...prev, `Loket ${prev.length + 1}`])
                        }
                        className="text-xs font-extrabold text-[#006B69] hover:underline cursor-pointer"
                      >
                        + Tambah Loket Lainnya
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Bagian Khusus Mode Gabung ke Ruangan */}
            {mode === "JOIN_ROOM" && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label htmlFor="reg-invite-code" className="block text-xs font-extrabold text-[#202531]">
                  Kode Undangan Ruangan
                </label>
                <div className="flex gap-2">
                  <input
                    id="reg-invite-code"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      setVerifiedInvite(null);
                    }}
                    placeholder="TRS-XXXX-XXXX"
                    className="flex-1 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm font-bold text-slate-900 uppercase focus:border-[#202531] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => verifyInviteCode(inviteCode)}
                    disabled={verifyingCode || !inviteCode.trim()}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl border border-[#202531] bg-white text-xs font-bold text-[#202531] hover:bg-slate-100 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <MagnifyingGlass size={15} weight="bold" aria-hidden="true" />
                    <span>{verifyingCode ? "Cek..." : "Verifikasi"}</span>
                  </button>
                </div>

                {verifiedInvite && verifiedInvite.valid && (
                  <div className="rounded-xl border border-[#01DAD7] bg-[#01DAD7]/15 p-3 text-xs text-[#202531] flex items-start gap-2">
                    <CheckCircle size={18} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-0.5">
                      <p className="font-extrabold">
                        Undangan Valid: {verifiedInvite.roomName}
                      </p>
                      <p>
                        Diundang oleh <strong>{verifiedInvite.inviterName}</strong> dengan hak akses{" "}
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-[#01DAD7] font-bold">
                          {verifiedInvite.assignedRoleLabel || verifiedInvite.assignedRole}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {verifiedInvite && !verifiedInvite.valid && (
                  <div className="rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] p-3 text-xs text-[#D41448] flex items-start gap-2">
                    <WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{verifiedInvite.error || "Kode undangan tidak valid."}</span>
                  </div>
                )}

                <p className="text-[11px] text-slate-600">
                  Hak akses Anda ditentukan sepenuhnya oleh Pemilik atau Manajer yang membuat undangan ini.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="reg-name" className="block text-xs font-bold text-slate-700 mb-1.5">
                Nama Lengkap
              </label>
              <input
                id="reg-name"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Rina Wijaya"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="reg-username" className="block text-xs font-bold text-slate-700 mb-1.5">
                Username Unik (tanpa spasi)
              </label>
              <input
                id="reg-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="contoh: rina_wijaya"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 font-mono text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
              />
              {usernameCheck && (
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    usernameCheck.valid ? "text-[#202531]" : "text-[#D41448]"
                  }`}
                >
                  {usernameCheck.valid
                    ? `Akan disimpan sebagai @${usernameCheck.normalized}`
                    : usernameCheck.error}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-bold text-slate-700 mb-1.5">
                Email (Disarankan untuk fitur Lupa Kata Sandi)
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@toko.id"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                Kata Sandi (Min. 6 Karakter)
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-3.5 pr-11 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeSlash size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#01DAD7] px-5 text-sm font-extrabold text-[#202531] hover:opacity-90 active:scale-[0.99] disabled:opacity-70 transition-all cursor-pointer"
            >
              {submitting ? (
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <UserPlus size={18} weight="bold" aria-hidden="true" />
              )}
              <span>
                {redirecting
                  ? "Membuka ruang kerja..."
                  : submitting
                  ? "Memproses Pendaftaran..."
                  : mode === "CREATE_ROOM"
                  ? "Buat Ruangan & Masuk sebagai Pemilik"
                  : "Daftar & Gabung ke Ruangan"}
              </span>
              {!submitting && <ArrowRight size={16} weight="bold" aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-600">
            Sudah punya akun?{" "}
            <Link
              href={rawRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login"}
              className="font-bold text-[#202531] hover:underline"
            >
              Masuk di sini
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
