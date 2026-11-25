"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Eye,
  EyeSlash,
  WifiSlash,
  LockKey,
  UserPlus,
  SignIn,
  ArrowLeft,
} from "@phosphor-icons/react";
import { useToast } from "@/components/layout/AppShell";
import { clearAllClientCache } from "@/lib/client-cache";
import {
  getDefaultRedirectForRole,
  isStoreAdmin,
  sanitizeInternalRedirect,
} from "@/lib/rbac-shared";

interface LoginClientProps {
  initialShowInitialSetup: boolean;
  rawRedirect: string | null;
}

export function LoginClient({
  initialShowInitialSetup,
  rawRedirect,
}: LoginClientProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const safeRedirect = sanitizeInternalRedirect(rawRedirect, "/dashboard");
  const registerHref = rawRedirect
    ? `/register?redirect=${encodeURIComponent(safeRedirect)}`
    : "/register";

  const [isOnline, setIsOnline] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [ownerName, setOwnerName] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isOnline) {
      setErrorMsg("Koneksi internet terputus. Sistem wajib terhubung secara online.");
      return;
    }

    let didRedirect = false;
    setSubmitting(true);
    setRedirecting(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal masuk ke sistem.");
        return;
      }

      clearAllClientCache();
      showToast(`Selamat datang kembali, ${data.user.name}.`, "success");
      const destination =
        data.user.isAssigned && rawRedirect && isStoreAdmin(data.user.role)
          ? safeRedirect
          : data.redirectTo || getDefaultRedirectForRole(data.user.role, data.user.isAssigned);
      didRedirect = true;
      setRedirecting(true);
      router.replace(destination);
    } catch {
      setErrorMsg("Terjadi gangguan koneksi ke server.");
    } finally {
      if (!didRedirect) {
        setSubmitting(false);
      }
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    let didRedirect = false;
    setSubmitting(true);
    setRedirecting(false);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ownerName,
          username: ownerUsername,
          email: ownerEmail,
          password: ownerPassword,
          storeName: storeName || "TRASIR Toko Utama",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menginisialisasi akun Pemilik.");
        return;
      }

      clearAllClientCache();
      showToast("Akun Pemilik Pertama berhasil dibuat dan sesi aktif.", "success");
      didRedirect = true;
      setRedirecting(true);
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      setErrorMsg("Gagal menghubungi server database.");
    } finally {
      if (!didRedirect) {
        setSubmitting(false);
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#EBEBEB] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-[#525866] hover:text-[#202531] transition-colors"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden="true" />
          <span>Kembali ke Beranda</span>
        </Link>

        <div className="bg-white rounded-2xl border border-[#202531]/10 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#202531] text-[#01DAD7] flex items-center justify-center">
                <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#202531]">
                  TRASIR
                </h1>
                <p className="text-xs font-medium text-[#525866]">
                  Transparan Kasir &amp; Pengawasan Keuangan Toko
                </p>
              </div>
            </div>

            {!isOnline && (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border shrink-0 bg-[#FFF0F4] text-[#D41448] border-[#FF2A63]/35"
              >
                <WifiSlash size={14} weight="bold" aria-hidden="true" />
                <span>Offline</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs font-semibold text-[#D41448]"
            >
              {errorMsg}
            </div>
          )}

          {initialShowInitialSetup ? (
            <form onSubmit={handleInitialSetup} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs text-[#202531] space-y-1">
                <p className="font-bold">Inisialisasi Pemilik Toko Pertama</p>
                <p>
                  Belum ada akun toko terdaftar. Buat akun Pemilik utama untuk mengaktifkan sistem dan mengundang tim melalui username.
                </p>
              </div>

              <div>
                <label htmlFor="setup-store" className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Toko / Usaha
                </label>
                <input
                  id="setup-store"
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Masukkan nama toko Anda"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="setup-name" className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap Pemilik
                </label>
                <input
                  id="setup-name"
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nama lengkap Anda"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="setup-username"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Username Login
                  </label>
                  <input
                    id="setup-username"
                    type="text"
                    required
                    value={ownerUsername}
                    onChange={(e) => setOwnerUsername(e.target.value)}
                    placeholder="pemilik"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="setup-email"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Alamat Email
                  </label>
                  <input
                    id="setup-email"
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="nama@toko.id"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="setup-password"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Kata Sandi Pemilik (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    id="setup-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Buat kata sandi yang kuat"
                    className="w-full pl-3.5 pr-12 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeSlash size={18} weight="bold" aria-hidden="true" />
                    ) : (
                      <Eye size={18} weight="bold" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !isOnline}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 active:scale-[0.99] disabled:opacity-70 transition-all cursor-pointer"
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
                    ? "Menginisialisasi Sistem..."
                    : "Buat Akun Pemilik & Masuk"}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Username atau Email
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Masukkan username atau email pribadi"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Kata Sandi
                  </label>
                  <Link
                    href="/lupa-password"
                    className="text-xs font-bold text-[#202531] hover:underline py-1"
                  >
                    Lupa kata sandi?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi akun"
                    className="w-full pl-3.5 pr-12 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeSlash size={18} weight="bold" aria-hidden="true" />
                    ) : (
                      <Eye size={18} weight="bold" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !isOnline}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 active:scale-[0.99] disabled:opacity-70 transition-all cursor-pointer"
              >
                {submitting ? (
                  <span
                    className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <SignIn size={18} weight="bold" aria-hidden="true" />
                )}
                <span>
                  {redirecting
                    ? "Membuka ruang kerja..."
                    : submitting
                    ? "Memverifikasi Akun..."
                    : "Masuk ke Sistem TRASIR"}
                </span>
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">Belum punya akun TRASIR?</span>
              <Link
                href={registerHref}
                className="inline-flex min-h-[44px] items-center font-bold text-[#202531] hover:underline"
              >
                Daftar akun baru
              </Link>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <LockKey size={16} weight="duotone" className="text-[#202531] shrink-0" aria-hidden="true" />
              <span>
                Setiap pengguna masuk dengan akun pribadi dan tercatat di Audit Trail.
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

