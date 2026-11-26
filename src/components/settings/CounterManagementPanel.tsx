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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#202531]">
            Manajemen Loket Kasir
          </h2>
          <p className="text-xs text-[#525866] mt-0.5 leading-relaxed">
            Atur jumlah loket kasir di usaha Anda. Satu loket hanya bisa dipakai oleh satu kasir yang sedang bertugas hingga tutup shift selesai.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadCounters(false)}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 min-h-[40px] rounded-xl border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer shrink-0"
        >
          <ArrowsClockwise size={15} weight="bold" aria-hidden="true" />
          <span>Perbarui Status</span>
        </button>
      </div>

      {/* Ringkasan Loket */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[#202531]/12 bg-white p-4">
          <p className="text-xs font-semibold text-[#525866]">Total Loket Terdaftar</p>
          <p className="text-xl font-extrabold text-[#202531] mt-1 tabular-nums">
            {counters.length} Loket
          </p>
        </div>
        <div className="rounded-2xl border border-[#202531]/12 bg-white p-4">
          <p className="text-xs font-semibold text-[#525866]">Sedang Aktif Dipakai</p>
          <p className="text-xl font-extrabold text-[#006B69] mt-1 tabular-nums">
            {occupiedCount} Loket
          </p>
        </div>
        <div className="rounded-2xl border border-[#202531]/12 bg-white p-4">
          <p className="text-xs font-semibold text-[#525866]">Tersedia untuk Shift Baru</p>
          <p className="text-xl font-extrabold text-[#202531] mt-1 tabular-nums">
            {Math.max(0, counters.length - occupiedCount)} Loket
          </p>
        </div>
      </div>

      {/* Form Tambah Loket Baru */}
      <form
        onSubmit={handleAddCounter}
        className="bg-white rounded-2xl border border-[#202531]/15 p-5 shadow-sm space-y-3"
      >
        <label htmlFor="new-counter-name" className="block text-sm font-extrabold text-[#202531]">
          Tambah Loket Baru
        </label>
        <p className="text-xs text-[#525866]">
          Setiap loket punya antrean modal awal dan rekonsiliasi shift terpisah agar uang tidak tercampur.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
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
      </form>

      {/* Daftar Loket & Status Penggunaan Langsung */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-[#202531]">
          Daftar Loket &amp; Pengguna Aktif Saat Ini
        </h3>

        {loading && counters.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[#202531]/15 bg-white text-center text-xs text-[#525866]">
            Memuat status loket kasir...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {counters.map((counter) => {
              const canDelete = !counter.isOccupied && counters.length > 1;
              return (
                <div
                  key={counter.id}
                  className={`rounded-2xl border p-4 sm:p-5 bg-white flex flex-col justify-between gap-4 ${
                    counter.isOccupied ? "border-[#006B69]/40" : "border-[#202531]/15"
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
      </div>
    </div>
  );
}

