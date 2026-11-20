"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Eye,
  EyeSlash,
  WifiHigh,
  WifiSlash,
  LockKey,
  UserPlus,
  SignIn,
} from "@phosphor-icons/react";
import { useToast } from "@/components/layout/AppShell";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Login states
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // First-Time Owner Setup states (only used when database has 0 users)
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

    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          router.replace("/dashboard");
          return;
        }
        setNeedsInitialSetup(Boolean(data.needsInitialSetup));
      })
      .catch(() => {})
      .finally(() => setCheckingSetup(false));

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!isOnline) {
      setErrorMsg("Koneksi internet terputus. Sistem wajib terhubung secara online.");
      return;
    }

    setSubmitting(true);
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

      showToast(`Selamat datang kembali, ${data.user.name}.`, "success");
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      setErrorMsg("Terjadi gangguan koneksi ke server.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
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

      showToast("Akun Pemilik Pertama berhasil dibuat dan sesi aktif.", "success");
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      setErrorMsg("Gagal menghubungi server database.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Header Logo & Online Status */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#334E6B] text-white flex items-center justify-center shadow-sm">
              <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#334E6B]">
                TRASIR
              </h1>
              <p className="text-xs font-medium text-slate-600">
                Transparan Kasir & Pengawasan Keuangan Toko
              </p>
            </div>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 ${
              isOnline
                ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                : "bg-[#FFF1F2] text-[#9F1239] border-[#FECDD3]"
            }`}
          >
            {isOnline ? (
              <>
                <WifiHigh size={14} weight="bold" aria-hidden="true" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiSlash size={14} weight="bold" aria-hidden="true" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-xs font-semibold text-[#9F1239]"
          >
            {errorMsg}
          </div>
        )}

        {checkingSetup ? (
          <div className="py-10 text-center space-y-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#334E6B] border-t-transparent animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              Memeriksa status database...
            </p>
          </div>
        ) : needsInitialSetup ? (
          <form onSubmit={handleInitialSetup} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F0FDFA] border border-[#99F6E4] text-xs text-[#0F766E] space-y-1">
              <p className="font-bold">Inisialisasi Pemilik Toko Pertama</p>
              <p>
                Database saat ini masih kosong (tanpa akun dummy). Buat akun Pemilik utama untuk mengaktifkan sistem RBAC dan pengaturan toko.
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
              className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-sm font-bold hover:bg-[#24384E] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <UserPlus size={18} weight="bold" aria-hidden="true" />
              <span>{submitting ? "Menginisialisasi Sistem..." : "Buat Akun Pemilik & Masuk"}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Email atau Username
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
              <label
                htmlFor="login-password"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Kata Sandi
              </label>
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
              className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#334E6B] text-white text-sm font-bold hover:bg-[#24384E] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <SignIn size={18} weight="bold" aria-hidden="true" />
              <span>{submitting ? "Memverifikasi Akun..." : "Masuk ke Sistem TRASIR"}</span>
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-600">
          <LockKey size={16} weight="duotone" className="text-[#334E6B] shrink-0" aria-hidden="true" />
          <span>
            Setiap pengguna wajib masuk dengan akun pribadi. Seluruh sesi login dan aksi tercatat di Audit Trail.
          </span>
        </div>
      </div>
    </main>
  );
}

