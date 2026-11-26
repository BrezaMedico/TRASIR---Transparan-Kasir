"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/layout/AppShell";
import { type CounterLiveStatus, suggestNextCounterName } from "@/lib/counters";
import { formatDateTimeJakarta } from "@/lib/format";
import { formatRoleLabel } from "@/lib/rbac-shared";
import {
  ArrowsClockwise,
  CheckCircle,
  LockKey,
  Plus,
  Storefront,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";

export function CounterManagementPanel() {
  const { showToast } = useToast();
  const [counters, setCounters] = useState<CounterLiveStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCounterName, setNewCounterName] = useState("");
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<CounterLiveStatus | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCounters = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/counters", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && Array.isArray(data.counters)) {
          setCounters(data.counters);
        } else if (!silent) {
          showToast(data.error || "Gagal memuat daftar loket.", "error");
        }
      } catch {
        if (!silent) showToast("Gagal terhubung ke server.", "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadCounters();
  }, [loadCounters]);

  const handleAddCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCounterName.trim();
    if (trimmed.length < 2) {
      showToast("Nama loket minimal 2 karakter.", "error");
      return;
    }

    setSubmittingAdd(true);
    try {
      const res = await fetch("/api/counters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menambah loket.", "error");
        return;
      }
      setCounters(data.counters || []);
      setNewCounterName("");
      showToast(`Loket "${data.counter?.name || trimmed}" berhasil ditambahkan.`, "success");
    } catch {
      showToast("Gagal menghubungi server saat menambah loket.", "error");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleDeleteCounter = async (target: CounterLiveStatus) => {
    setDeletingId(target.id);
    try {
      const res = await fetch(`/api/counters?id=${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal menghapus loket.", "error");
        return;
      }
      setCounters(data.counters || []);
      setConfirmDeleteTarget(null);
      showToast(`Loket "${target.name}" berhasil dihapus.`, "info");
    } catch {
      showToast("Gagal menghubungi server saat menghapus loket.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const occupiedCount = counters.filter((c) => c.isOccupied).length;
  const placeholderName = suggestNextCounterName(counters);

  return (
    <div className="space-y-5">
      {/* Ringkasan & Form Tambah Loket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <section className="lg:col-span-5 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#202531]/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
                <Storefront size={18} weight="duotone" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-[#202531]">
                  Ringkasan Loket Kasir
                </h2>
                <p className="text-xs text-[#525866] mt-0.5">
                  Pemakaian loket aktif pada shift berjalan.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadCounters(false)}
              disabled={loading}
              aria-label="Perbarui status loket"
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl border border-[#202531]/15 bg-[#EBEBEB]/60 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer shrink-0"
            >
              <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
              <span>Segarkan</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
              <p className="text-[11px] font-semibold text-[#525866]">Total Loket</p>
              <p className="text-lg font-extrabold text-[#202531] mt-1 tabular-nums">
                {counters.length}
              </p>
            </div>
            <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
              <p className="text-[11px] font-semibold text-[#525866]">Aktif</p>
              <p className="text-lg font-extrabold text-[#006B69] mt-1 tabular-nums">
                {occupiedCount}
              </p>
            </div>
            <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/35 p-3.5">
              <p className="text-[11px] font-semibold text-[#525866]">Tersedia</p>
              <p className="text-lg font-extrabold text-[#202531] mt-1 tabular-nums">
                {Math.max(0, counters.length - occupiedCount)}
              </p>
            </div>
          </div>
        </section>

        <form
          onSubmit={handleAddCounter}
          className="lg:col-span-7 bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm flex flex-col justify-between gap-4"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
            <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
              <Plus size={18} weight="bold" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#202531]">
                Tambah Loket Baru
              </h2>
              <p className="text-xs text-[#525866] mt-0.5">
                Setiap loket memiliki kunci kasir aktif dan rekonsiliasi shift terpisah.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="new-counter-name" className="block text-xs font-bold text-[#202531]">
              Nama Loket Kasir
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="new-counter-name"
                type="text"
                required
                minLength={2}
                maxLength={40}
                value={newCounterName}
                onChange={(e) => setNewCounterName(e.target.value)}
                placeholder={`Contoh: ${placeholderName} atau Kasir Drive-Thru`}
                className="flex-1 min-h-[44px] rounded-xl border border-[#202531]/20 px-3.5 text-sm text-[#202531] focus:border-[#006B69] focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingAdd}
                className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                <span>{submittingAdd ? "Menyimpan..." : "Tambah Loket"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Daftar Loket & Status Penggunaan Langsung */}
      <section className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-[#202531]/10">
          <div className="w-9 h-9 rounded-xl bg-[#EBEBEB]/75 text-[#202531] flex items-center justify-center shrink-0">
            <LockKey size={18} weight="duotone" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-[#202531]">
              Daftar Loket &amp; Pengguna Aktif ({counters.length})
            </h2>
            <p className="text-xs text-[#525866] mt-0.5">
              Satu loket hanya dapat digunakan satu kasir hingga tutup shift selesai.
            </p>
          </div>
        </div>

        {loading && counters.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#525866]">
            Memuat status loket kasir...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {counters.map((counter) => {
              const canDelete = !counter.isOccupied && counters.length > 1;
              return (
                <div
                  key={counter.id}
                  className={`rounded-xl border p-4 bg-[#EBEBEB]/30 flex flex-col justify-between gap-4 ${
                    counter.isOccupied ? "border-[#006B69]/40" : "border-[#202531]/12"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          counter.isOccupied
                            ? "bg-[#202531] text-[#01DAD7]"
                            : "bg-[#EBEBEB] text-[#202531]"
                        }`}
                      >
                        <Storefront size={20} weight="duotone" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#202531] truncate">
                          {counter.name}
                        </p>
                        <p className="text-[11px] font-mono text-[#525866] truncate">
                          ID: {counter.id}
                        </p>
                      </div>
                    </div>

                    {counter.isOccupied ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E6FBFB] border border-[#006B69]/25 px-2.5 py-1 text-[11px] font-extrabold text-[#006B69] shrink-0">
                        <LockKey size={13} weight="bold" aria-hidden="true" />
                        <span>Sedang Digunakan</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EBEBEB] px-2.5 py-1 text-[11px] font-bold text-[#525866] shrink-0">
                        <CheckCircle size={13} weight="bold" aria-hidden="true" />
                        <span>Tersedia</span>
                      </span>
                    )}
                  </div>

                  {counter.isOccupied && counter.occupiedBy ? (
                    <div className="rounded-xl bg-[#E6FBFB]/55 border border-[#006B69]/20 px-3.5 py-2.5 text-xs space-y-0.5">
                      <p className="font-extrabold text-[#202531]">
                        Aktif: {counter.occupiedBy.userName}{" "}
                        <span className="font-semibold text-[#525866]">
                          ({formatRoleLabel(counter.occupiedBy.userRole)})
                        </span>
                      </p>
                      <p className="text-[11px] text-[#525866] tabular-nums">
                        Terkunci sejak {formatDateTimeJakarta(counter.occupiedBy.openedAt)} sampai tutup shift
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#525866]">
                      Belum ada kasir yang membuka shift di loket ini. Siap dipilih untuk buka shift berikutnya.
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#202531]/10">
                    {!canDelete ? (
                      <span className="text-[11px] font-semibold text-[#525866] inline-flex items-center gap-1">
                        <WarningCircle size={14} weight="bold" aria-hidden="true" />
                        {counter.isOccupied
                          ? "Terkunci selama shift berlangsung"
                          : "Minimal 1 loket wajib dipertahankan"}
                      </span>
                    ) : confirmDeleteTarget?.id === counter.id ? (
                      <div className="flex items-center gap-2 w-full justify-between">
                        <span className="text-xs font-bold text-[#D41448]">
                          Hapus {counter.name}?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTarget(null)}
                            className="px-3 min-h-[36px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === counter.id}
                            onClick={() => handleDeleteCounter(counter)}
                            className="px-3 min-h-[36px] rounded-xl bg-[#D41448] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === counter.id ? "Menghapus..." : "Ya, Hapus"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTarget(counter)}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-[#D41448]/30 bg-[#FFF0F4] text-xs font-bold text-[#D41448] hover:opacity-90 cursor-pointer"
                      >
                        <Trash size={14} weight="bold" aria-hidden="true" />
                        <span>Hapus Loket</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

