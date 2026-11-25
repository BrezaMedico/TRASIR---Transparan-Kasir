"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  PaperPlaneTilt,
  ShieldCheck,
} from "@phosphor-icons/react";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devPreviewUrl, setDevPreviewUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal memproses permintaan reset kata sandi.");
        return;
      }
      setSentMessage(
        data.message ||
          "Jika alamat email tersebut terdaftar, tautan reset kata sandi telah dikirim."
      );
      setDevPreviewUrl(typeof data.devPreviewUrl === "string" ? data.devPreviewUrl : null);
    } catch {
      setErrorMsg("Gagal terhubung ke server. Periksa koneksi internet Anda.");
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
                Lupa Kata Sandi
              </h1>
              <p className="text-xs font-medium text-[#525866]">
                Kami akan mengirim email berisi tombol konfirmasi ke akun Anda
              </p>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/35 text-xs font-semibold text-[#D41448]"
            >
              {errorMsg}
            </div>
          )}

          {sentMessage ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#01DAD7]/15 border border-[#008F8C]/35 text-xs text-[#202531] space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <CheckCircle size={20} weight="fill" className="text-[#008F8C] shrink-0" aria-hidden="true" />
                  <span>Email Konfirmasi Terkirim</span>
                </div>
                <p className="leading-relaxed">{sentMessage}</p>
                <p className="text-[11px] text-[#525866]">
                  Buka email dari <strong>TRASIR</strong> di kotak masuk Utama (atau cek Spam jika pengiriman dari server lokal baru pertama kali) lalu klik <strong>tombol konfirmasi</strong> untuk langsung membuat kata sandi baru tanpa kode. Berlaku 30 menit.
                </p>
              </div>

              {devPreviewUrl && (
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#202531]/20 text-xs text-[#202531] space-y-2">
                  <p className="font-bold">Mode Dev Lokal (Email belum dikonfigurasi):</p>
                  <Link
                    href={devPreviewUrl}
                    className="inline-flex items-center justify-center w-full min-h-[44px] px-4 rounded-xl bg-[#202531] text-white font-bold hover:bg-[#2a3140]"
                  >
                    Buka Tautan Reset Kata Sandi
                  </Link>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSentMessage(null);
                    setDevPreviewUrl(null);
                  }}
                  className="px-4 min-h-[44px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
                >
                  Kirim Ulang
                </button>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90"
                >
                  Kembali ke Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-bold text-[#202531] mb-1.5"
                >
                  Email yang Terdaftar di TRASIR
                </label>
                <div className="relative">
                  <EnvelopeSimple
                    size={18}
                    weight="bold"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#525866]"
                    aria-hidden="true"
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contoh: nama@toko.id"
                    className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/25 text-sm text-[#202531] bg-white focus:border-[#202531] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-90 disabled:opacity-60 transition-opacity cursor-pointer"
              >
                <PaperPlaneTilt size={18} weight="bold" aria-hidden="true" />
                <span>{submitting ? "Mengirim Email Konfirmasi..." : "Kirim Email Konfirmasi"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

