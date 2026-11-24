"use client";

import React from "react";
import Link from "next/link";
import { WarningCircle, ArrowsClockwise, House } from "@phosphor-icons/react";

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] text-[#9F1239] border border-[#FECDD3] flex items-center justify-center mx-auto">
          <WarningCircle size={26} weight="duotone" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-extrabold text-slate-900">
            Halaman Gagal Dimuat Sementara
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Terjadi gangguan saat memuat halaman atau menghubungkan server database. Silakan coba muat ulang.
          </p>
          {process.env.NODE_ENV === "development" && error?.message && (
            <p className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-left font-mono text-[11px] text-slate-700 break-words">
              {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-[#2563EB] text-white text-xs font-bold hover:bg-[#1D4ED8] transition-colors cursor-pointer"
          >
            <ArrowsClockwise size={16} weight="bold" aria-hidden="true" />
            <span>Coba Lagi</span>
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            <House size={16} weight="bold" aria-hidden="true" />
            <span>Kembali ke Beranda</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
