import React from "react";

export default function LoginLoading() {
  return (
    <main
      className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4"
      aria-busy="true"
      aria-label="Memuat halaman masuk"
    >
      <div className="w-full max-w-md space-y-4 animate-pulse">
        <div className="h-6 w-36 rounded-lg bg-slate-200" />
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-24 rounded bg-slate-200" />
              <div className="h-3.5 w-48 rounded bg-slate-200/80" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-3.5 w-32 rounded bg-slate-200" />
              <div className="h-11 w-full rounded-xl bg-slate-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3.5 w-24 rounded bg-slate-200" />
              <div className="h-11 w-full rounded-xl bg-slate-100" />
            </div>
            <div className="h-12 w-full rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>
    </main>
  );
}

