"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeSlash,
  Key,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";

export function ResetPasswordClient({
  token,
  initialValid,
  initialEmailMasked = null,
  initialError = null,
}: {
  token: string;
  initialValid?: boolean;
  initialEmailMasked?: string | null;
  initialError?: string | null;
}) {
  const hasServerResult = typeof initialValid === "boolean";
  const [checking, setChecking] = useState(!hasServerResult);
  const [tokenValid, setTokenValid] = useState(hasServerResult ? initialValid : false);
  const [tokenError, setTokenError] = useState<string | null>(
    hasServerResult ? initialError : null
  );
  const [emailMasked, setEmailMasked] = useState<string | null>(
    hasServerResult ? initialEmailMasked : null
  );

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (hasServerResult) return;

    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    async function verify() {
      if (!token) {
        if (active) {
          setChecking(false);
          setTokenValid(false);
          setTokenError("Tautan reset kata sandi tidak lengkap atau tidak ditemukan.");
        }
        return;
      }
      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.valid) {
          setTokenValid(true);
          setEmailMasked(data.emailMasked || null);
        } else {
          setTokenValid(false);
          setTokenError(data.error || "Tautan sudah kedaluwarsa atau tidak valid.");
        }
      } catch {
        if (active) {
          setTokenValid(false);
          setTokenError("Gagal memeriksa keabsahan tautan. Muat ulang halaman.");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setChecking(false);
      }
    }
    verify();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasServerResult, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (newPassword.length < 6) {
      setSubmitError("Kata sandi baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Konfirmasi kata sandi tidak sama dengan kata sandi baru.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Gagal memperbarui kata sandi.");
        return;
      }
      setSuccessMsg(
        data.message || "Kata sandi berhasil diperbarui. Silakan masuk kembali."
      );
    } catch {
      setSubmitError("Gagal menghubungi server.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EBEBEB] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-[#525866] hover:text-[#202531] transition-colors"
        >
          <ArrowLeft size={15} weight="bold" aria-hidden="true" />
          <span>Kembali ke Halaman Masuk</span>
        </Link>

        <div className="bg-white rounded-2xl border border-[#202531]/10 p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#202531] text-[#01DAD7] flex items-center justify-center shrink-0">
              <ShieldCheck size={28} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#202531]">
                Buat Kata Sandi Baru
              </h1>
              <p className="text-xs font-medium text-[#525866]">
                {emailMasked ? `Untuk akun ${emailMasked}` : "Pengaturan ulang kata sandi TRASIR"}
              </p>
            </div>
          </div>

          {checking ? (
            <div className="py-8 text-center text-xs font-semibold text-[#525866]">
              Memeriksa keabsahan tautan atur ulang kata sandi...
            </div>
          ) : successMsg ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#01DAD7]/15 border border-[#008F8C]/35 text-xs text-[#202531] space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <CheckCircle size={20} weight="fill" className="text-[#008F8C] shrink-0" aria-hidden="true" />
                  <span>Kata Sandi Diperbarui</span>
                </div>
                <p className="leading-relaxed">{successMsg}</p>
              </div>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center px-5 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90"
              >
                Masuk Sekarang
              </Link>
            </div>
          ) : !tokenValid ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="p-4 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs text-[#D41448] flex items-start gap-2.5"
              >
                <WarningCircle size={18} weight="fill" className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{tokenError || "Tautan tidak valid atau sudah kedaluwarsa."}</span>
              </div>
              <Link
                href="/lupa-password"
                className="w-full inline-flex items-center justify-center px-5 min-h-[48px] rounded-xl bg-[#202531] text-white text-sm font-extrabold hover:bg-[#2a3140]"
              >
                Minta Tautan Reset Baru
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-[#01DAD7]/15 border border-[#008F8C]/35 text-xs text-[#202531] flex items-center gap-2 font-bold">
                <CheckCircle size={18} weight="fill" className="text-[#008F8C] shrink-0" aria-hidden="true" />
                <span>
                  Email {emailMasked ? `(${emailMasked}) ` : ""}berhasil dikonfirmasi. Silakan buat kata sandi baru.
                </span>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs font-semibold text-[#D41448]"
                >
                  {submitError}
                </div>
              )}

              <div>
                <label
                  htmlFor="reset-new-pw"
                  className="block text-xs font-bold text-[#202531] mb-1.5"
                >
                  Kata Sandi Baru (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    id="reset-new-pw"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className="w-full pl-3.5 pr-12 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/25 text-sm text-[#202531]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#525866] hover:text-[#202531] rounded-lg cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeSlash size={18} weight="bold" aria-hidden="true" />
                    ) : (
                      <Eye size={18} weight="bold" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="reset-confirm-pw"
                  className="block text-xs font-bold text-[#202531] mb-1.5"
                >
                  Ulangi Kata Sandi Baru
                </label>
                <input
                  id="reset-confirm-pw"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/25 text-sm text-[#202531]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 disabled:opacity-60 cursor-pointer"
              >
                <Key size={18} weight="bold" aria-hidden="true" />
                <span>{submitting ? "Menyimpan..." : "Simpan Kata Sandi Baru"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

