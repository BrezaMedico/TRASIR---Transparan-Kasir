import React from "react";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Memuat halaman">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-xl bg-slate-200" />
          <div className="h-4 w-80 rounded-lg bg-slate-200/80" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-slate-200" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="h-3.5 w-24 rounded bg-slate-200" />
            <div className="h-7 w-36 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="h-72 rounded-2xl border border-slate-200 bg-white p-6" />
    </div>
  );
}

