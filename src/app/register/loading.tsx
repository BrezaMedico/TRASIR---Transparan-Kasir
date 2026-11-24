import React from "react";

export default function RegisterLoading() {
  return (
    <main
      className="min-h-screen bg-[#EBEBEB] flex items-center justify-center p-4 sm:p-6"
      aria-busy="true"
      aria-label="Memuat halaman pendaftaran"
    >
      <div className="w-full max-w-lg space-y-5 animate-pulse">
        <div className="flex flex-col items-center space-y-2">
          <div className="h-10 w-32 rounded-xl bg-slate-200" />
          <div className="h-6 w-64 rounded bg-slate-200" />
          <div className="h-4 w-80 rounded bg-slate-200/80" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 rounded-xl bg-slate-100" />
            <div className="h-24 rounded-xl bg-slate-100" />
          </div>
          <div className="h-11 w-full rounded-xl bg-slate-100" />
          <div className="h-11 w-full rounded-xl bg-slate-100" />
          <div className="h-12 w-full rounded-xl bg-slate-200" />
        </div>
      </div>
    </main>
  );
}

