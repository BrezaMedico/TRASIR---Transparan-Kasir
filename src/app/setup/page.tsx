"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Storefront, ArrowRight } from "@phosphor-icons/react";
import { useToast } from "@/components/layout/AppShell";
import { TrasirLogo } from "@/components/ui/TrasirLogo";
import { isStoreAdmin } from "@/lib/rbac-shared";

export default function StoreSetupPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [checking, setChecking] = useState(true);
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || !data.user) {
          router.replace("/login");
          return;
        }
        if (data.user.isAssigned) {
          router.replace("/dashboard");
          return;
        }
        if (!isStoreAdmin(data.user.role) || !data.needsInitialSetup) {
          router.replace("/menunggu-undangan");
          return;
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          storeAddress: storeAddress.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal menyelesaikan inisialisasi toko.");
        return;
      }
      showToast("Toko berhasil disiapkan.", "success");
      router.replace(data.redirectTo || "/dashboard");
    } catch {
      setErrorMsg("Koneksi jaringan bermasalah.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#EBEBEB] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg"
          >
            <TrasirLogo className="h-8 w-auto" priority />
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Siapkan Profil Toko Anda
          </h1>
          <p className="text-sm text-slate-600">
            Lengkapi identitas toko untuk mengaktifkan dashboard dan undangan tim.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          {checking ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Memeriksa status toko...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FF2A63]/35 bg-[#FFF0F4] px-4 py-3 text-xs font-semibold text-[#D41448]"
                >
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="setup-store-name" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Toko
                </label>
                <input
                  id="setup-store-name"
                  type="text"
                  required
                  minLength={2}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Contoh: Toko Sembako & Kopi Mandiri"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="setup-store-address" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Alamat Singkat (Opsional)
                </label>
                <input
                  id="setup-store-address"
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Contoh: Bandung, Jawa Barat"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 focus:border-[#202531] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#01DAD7] px-5 text-sm font-extrabold text-[#202531] hover:opacity-90 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Storefront size={18} weight="bold" aria-hidden="true" />
                <span>{submitting ? "Menyimpan..." : "Aktifkan Toko & Buka Dashboard"}</span>
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

