"use client";

import React, { useEffect, useState } from "react";
import { type CounterLiveStatus } from "@/lib/counters";
import {
  ActiveShiftSummary,
  DenominationMap,
  OperationalExpenseItem,
  computeDenominationTotal,
  computeOperationalExpenseTotal,
  createEmptyDenominations,
} from "@/lib/shift-session";
import { formatDateTimeJakarta, formatRupiah } from "@/lib/format";
import { formatRoleLabel } from "@/lib/rbac-shared";
import { CashDenominationCounter } from "@/components/kasir/CashDenominationCounter";
import {
  ArrowLeft,
  ArrowsClockwise,
  CheckCircle,
  LockKey,
  Plus,
  ShieldCheck,
  Storefront,
  Trash,
  UserCheck,
  Wallet,
} from "@phosphor-icons/react";

export interface ClosedShiftReceipt {
  id: string;
  counterId?: string;
  counterName?: string;
  openedAt: string;
  closedAt: string;
  openingCashTotal: number;
  actualCashTotal: number;
  operationalExpenseTotal: number;
  operationalExpenses: OperationalExpenseItem[];
  closingNote: string | null;
  cashier: { id: string; name: string; role: string };
}

interface ShiftWorkflowPanelProps {
  mode: "OPEN" | "CLOSE" | "CLOSED_RECEIPT";
  sessionUser: {
    id: string;
    name: string;
    username: string;
    role: string;
    roomName?: string;
  };
  counters?: CounterLiveStatus[];
  onRefreshCounters?: () => void;
  activeShift: ActiveShiftSummary | null;
  closedReceipt: ClosedShiftReceipt | null;
  onShiftOpened: (shift: ActiveShiftSummary) => void;
  onShiftClosed: (receipt: ClosedShiftReceipt) => void;
  onCancelClose?: () => void;
  onStartNewShift?: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export function ShiftWorkflowPanel({
  mode,
  sessionUser,
  counters = [],
  onRefreshCounters,
  activeShift,
  closedReceipt,
  onShiftOpened,
  onShiftClosed,
  onCancelClose,
  onStartNewShift,
  onError,
  onSuccess,
}: ShiftWorkflowPanelProps) {
  const [selectedCounterId, setSelectedCounterId] = useState<string>(() => {
    const firstAvailable = counters.find((c) => !c.isOccupied);
    return firstAvailable?.id || counters[0]?.id || "";
  });
  const [denominations, setDenominations] = useState<DenominationMap>(() =>
    createEmptyDenominations()
  );
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedError, setConfirmedError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<OperationalExpenseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (counters.length === 0) return;
    const current = counters.find((c) => c.id === selectedCounterId);
    if (!current || current.isOccupied) {
      const firstAvailable = counters.find((c) => !c.isOccupied);
      setSelectedCounterId(firstAvailable?.id || "");
    }
  }, [counters, selectedCounterId]);

  const countedCashTotal = computeDenominationTotal(denominations);
  const operationalExpenseTotal = computeOperationalExpenseTotal(expenses);
  const selectedCounter = counters.find((c) => c.id === selectedCounterId) ?? null;

  const addExpenseRow = () => {
    setExpenses((prev) => [...prev, { description: "", amount: 0 }]);
  };

  const updateExpenseRow = (idx: number, patch: Partial<OperationalExpenseItem>) => {
    setExpenses((prev) =>
      prev.map((row, index) => (index === idx ? { ...row, ...patch } : row))
    );
  };

  const removeExpenseRow = (idx: number) => {
    setExpenses((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (counters.length > 0) {
      if (!selectedCounter || selectedCounter.isOccupied) {
        onError(
          selectedCounter?.occupiedBy
            ? `${selectedCounter.name} sedang digunakan oleh ${selectedCounter.occupiedBy.userName}. Pilih loket yang kosong.`
            : "Pilih loket kasir yang tersedia terlebih dahulu."
        );
        return;
      }
    }
    if (!confirmed) {
      setConfirmedError("Centang kotak konfirmasi kesiapan sebelum membuka kasir.");
      return;
    }
    setConfirmedError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OPEN",
          counterId: selectedCounter?.id || undefined,
          denominations,
          openingNote: note.trim() || undefined,
          readyConfirmed: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json.error || "Gagal membuka shift kasir.");
        onRefreshCounters?.();
        return;
      }
      onSuccess(
        `Shift di ${json.activeShift?.counterName || "Loket"} berhasil dibuka. Kasir siap mencatat penjualan.`
      );
      setDenominations(createEmptyDenominations());
      setNote("");
      setConfirmed(false);
      onShiftOpened(json.activeShift);
    } catch {
      onError("Terjadi gangguan koneksi saat membuka shift.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setConfirmedError("Centang pernyataan kejujuran perhitungan uang sebelum menutup shift.");
      return;
    }
    setConfirmedError(null);
    setSubmitting(true);
    try {
      const cleanExpenses = expenses
        .filter((item) => item.description.trim().length > 0 || item.amount > 0)
        .map((item) => ({
          description: item.description.trim() || "Pengeluaran Operasional",
          amount: Math.max(0, Math.round(item.amount || 0)),
        }));

      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLOSE",
          shiftId: activeShift?.id,
          denominations,
          operationalExpenses: cleanExpenses,
          closingNote: note.trim() || undefined,
          honestyConfirmed: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json.error || "Gagal menutup shift kasir.");
        return;
      }
      onSuccess("Tutup shift selesai. Data perhitungan loker tersimpan aman.");
      setDenominations(createEmptyDenominations());
      setExpenses([]);
      setNote("");
      setConfirmed(false);
      onShiftClosed(json.closing);
    } catch {
      onError("Terjadi gangguan koneksi saat menyimpan tutup shift.");
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "CLOSED_RECEIPT" && closedReceipt) {
    return (
      <div className="max-w-2xl mx-auto py-4 space-y-5">
        <div className="bg-white rounded-2xl border border-[#202531]/15 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#E6FBFB] border border-[#006B69]/25 text-[#006B69] flex items-center justify-center shrink-0">
              <CheckCircle size={26} weight="fill" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#202531]">
                Shift Kasir Berhasil Ditutup
              </h1>
              <p className="text-sm text-[#525866] mt-1">
                Laporan perhitungan fisik loker Anda telah disimpan dan dikirim ke Pemilik atau Manajer toko untuk pencocokan sistem.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl bg-[#EBEBEB]/60 border border-[#202531]/10 p-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-[#525866]">Kasir &amp; Loket</p>
              <p className="font-extrabold text-[#202531] mt-0.5">
                {closedReceipt.cashier.name} · {closedReceipt.counterName || "Loket 1"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#525866]">Waktu Tutup Shift</p>
              <p className="font-bold text-[#202531] mt-0.5 tabular-nums">
                {formatDateTimeJakarta(closedReceipt.closedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#525866]">Modal Awal Loker</p>
              <p className="font-extrabold text-[#202531] mt-0.5 tabular-nums">
                {formatRupiah(closedReceipt.openingCashTotal)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#525866]">Total Uang Fisik Loker</p>
              <p className="font-extrabold text-[#006B69] mt-0.5 tabular-nums">
                {formatRupiah(closedReceipt.actualCashTotal)}
              </p>
            </div>
            {closedReceipt.operationalExpenseTotal > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-[#525866]">Uang Operasional Tercatat</p>
                <p className="font-bold text-[#202531] mt-0.5 tabular-nums">
                  {formatRupiah(closedReceipt.operationalExpenseTotal)}
                </p>
              </div>
            )}
            {closedReceipt.closingNote && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-[#525866]">Catatan Penutupan</p>
                <p className="text-xs text-[#202531] mt-0.5">{closedReceipt.closingNote}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#EBEBEB]/75 border border-[#202531]/15 px-4 py-3 flex items-center gap-3">
            <ShieldCheck size={20} weight="bold" className="text-[#006B69] shrink-0" aria-hidden="true" />
            <p className="text-xs text-[#525866] leading-relaxed">
              Demi menjaga kejujuran dan keamanan audit kas, hasil perbandingan selisih hanya dapat diperiksa pada menu Laporan oleh Pemilik atau Manajer.
            </p>
          </div>

          {onStartNewShift && (
            <button
              type="button"
              onClick={onStartNewShift}
              className="w-full min-h-[48px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-95 cursor-pointer transition-opacity duration-150"
            >
              Buka Shift Baru
            </button>
          )}
        </div>
      </div>
    );
  }

  const isClosing = mode === "CLOSE";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <form
        onSubmit={isClosing ? handleCloseShift : handleOpenShift}
        noValidate
        className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-7 shadow-sm space-y-6"
      >
        {/* Header Langkah Jelas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#202531]/10 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#202531]">
              {isClosing ? "Tutup Shift Kasir" : "Buka Shift Kasir"}
            </h1>
            <p className="text-sm text-[#525866] mt-1">
              {isClosing
                ? "Hitung semua uang tunai yang ada di loker saat ini secara jujur sesuai kondisi fisik."
                : "Hitung uang modal di loker sebelum mulai melayani transaksi pembeli."}
            </p>
          </div>

          {isClosing && onCancelClose && (
            <button
              type="button"
              onClick={onCancelClose}
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#202531]/20 bg-white text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
            >
              <ArrowLeft size={15} weight="bold" aria-hidden="true" />
              <span>Kembali ke Kasir</span>
            </button>
          )}
        </div>

        {/* Kartu Profil Terkunci (Read-Only) */}
        <div className="rounded-2xl bg-[#EBEBEB]/55 border border-[#202531]/15 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#202531] text-[#01DAD7] flex items-center justify-center shrink-0">
              <UserCheck size={22} weight="bold" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-extrabold text-[#202531] truncate">
                  {sessionUser.name}
                </span>
                <span className="inline-flex items-center rounded-full bg-[#202531] px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {formatRoleLabel(sessionUser.role)}
                </span>
              </div>
              <p className="text-xs text-[#525866] mt-0.5 truncate">
                @{sessionUser.username}
                {sessionUser.roomName ? ` · ${sessionUser.roomName}` : ""}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#202531]/15 px-3 py-1.5 text-xs font-bold text-[#525866] shrink-0">
            <LockKey size={14} weight="bold" className="text-[#006B69]" aria-hidden="true" />
            <span>Akun Terkunci Otomatis</span>
          </div>
        </div>

        {/* Pilihan Loket Kasir (Khusus Mode Buka Shift) */}
        {!isClosing && counters.length > 0 && (
          <div className="rounded-2xl border border-[#202531]/15 p-4 sm:p-5 space-y-3 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-[#202531] flex items-center gap-2">
                  <Storefront size={17} weight="bold" className="text-[#006B69]" aria-hidden="true" />
                  <span>
                    {counters.length > 1 ? "Pilih Loket Kasir" : "Loket Kasir Digunakan"}
                  </span>
                </h2>
                <p className="text-xs text-[#525866] mt-0.5">
                  {counters.length > 1
                    ? "Pilih loket yang kosong. Loket yang sedang dipakai otomatis terkunci sampai tutup shift."
                    : "Shift Anda akan mengunci loket ini selama penjualan berlangsung hingga tutup shift."}
                </p>
              </div>
              {onRefreshCounters && (
                <button
                  type="button"
                  onClick={onRefreshCounters}
                  className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl border border-[#202531]/20 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer shrink-0"
                >
                  <ArrowsClockwise size={14} weight="bold" aria-hidden="true" />
                  <span>Cek Status Loket</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {counters.map((c) => {
                const isSelected = selectedCounterId === c.id && !c.isOccupied;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={c.isOccupied || submitting}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCounterId(c.id)}
                    className={`text-left p-3.5 rounded-xl border transition-colors min-h-[44px] flex flex-col justify-between gap-2 ${
                      c.isOccupied
                        ? "border-[#FF2A63]/30 bg-[#FFF0F4]/60 opacity-85 cursor-not-allowed"
                        : isSelected
                          ? "border-[#006B69] bg-[#E6FBFB]/55 ring-1 ring-[#006B69] cursor-pointer"
                          : "border-[#202531]/15 bg-white hover:border-[#202531]/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#202531]">{c.name}</span>
                      {c.isOccupied ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F4] px-2 py-0.5 text-[10px] font-extrabold text-[#D41448]">
                          <LockKey size={11} weight="bold" aria-hidden="true" />
                          <span>Terkunci</span>
                        </span>
                      ) : isSelected ? (
                        <span className="inline-flex items-center rounded-full bg-[#01DAD7] px-2 py-0.5 text-[10px] font-extrabold text-[#202531]">
                          Dipilih
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[#EBEBEB] px-2 py-0.5 text-[10px] font-bold text-[#525866]">
                          Tersedia
                        </span>
                      )}
                    </div>
                    {c.isOccupied && c.occupiedBy ? (
                      <p className="text-[11px] font-semibold text-[#D41448]">
                        Dipakai oleh {c.occupiedBy.userName} ({formatDateTimeJakarta(c.occupiedBy.openedAt)})
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#525866]">
                        Klik untuk memakai loket ini
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Ringkas Saat Mode Tutup Shift (TANPA bocoran target sistem) */}
        {isClosing && activeShift && (
          <div className="rounded-2xl bg-[#E6FBFB]/55 border border-[#006B69]/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-[#006B69]">
                {activeShift.counterName} · Shift Dibuka Sejak{" "}
                {formatDateTimeJakarta(activeShift.openedAt)}
              </p>
              <p className="text-xs text-[#202531]">
                Modal Awal Tercatat:{" "}
                <strong className="font-extrabold tabular-nums">
                  {formatRupiah(activeShift.openingCashTotal)}
                </strong>
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-[#006B69]/20 text-xs font-semibold text-[#202531]">
              <ShieldCheck size={16} weight="bold" className="text-[#006B69] shrink-0" aria-hidden="true" />
              <span>Perhitungan buta: nominal target disembunyikan</span>
            </div>
          </div>
        )}

        {/* Papan Hitung Pecahan Rupiah */}
        <CashDenominationCounter
          value={denominations}
          onChange={setDenominations}
          disabled={submitting}
          title={isClosing ? "1. Hitung Seluruh Uang Tunai di Loker" : "1. Hitung Uang Modal di Loker"}
          helperText={
            isClosing
              ? "Hitung semua lembar dan koin tunai yang ada di loker sekarang."
              : "Hitung jumlah lembar dan koin uang modal awal sebelum penjualan dimulai."
          }
        />

        {/* Uang Operasional Opsional (Khusus Tutup Shift) */}
        {isClosing && (
          <div className="rounded-2xl border border-[#202531]/15 p-4 sm:p-5 space-y-3 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-[#202531] flex items-center gap-2">
                  <Wallet size={17} weight="bold" className="text-[#525866]" aria-hidden="true" />
                  <span>2. Uang Operasional Keluar (Opsional)</span>
                </h2>
                <p className="text-xs text-[#525866] mt-0.5">
                  Isi hanya jika selama shift Anda mengambil uang dari loker untuk keperluan toko (misalnya beli es batu, plastik, atau parkir).
                </p>
              </div>
              <button
                type="button"
                onClick={addExpenseRow}
                disabled={submitting}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-[#202531]/20 bg-[#EBEBEB]/60 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                <span>Tambah Pengeluaran</span>
              </button>
            </div>

            {expenses.length > 0 && (
              <div className="space-y-2.5 pt-1">
                {expenses.map((row, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      placeholder="Contoh: Beli es batu / plastik kresek"
                      maxLength={150}
                      value={row.description}
                      onChange={(e) => updateExpenseRow(idx, { description: e.target.value })}
                      className="flex-1 min-h-[44px] rounded-xl border border-[#202531]/20 px-3.5 text-sm text-[#202531] focus:outline-none focus:border-[#006B69]"
                    />
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 sm:w-44">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#525866]">
                          Rp
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="0"
                          value={row.amount === 0 ? "" : String(row.amount)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateExpenseRow(idx, { amount: raw === "" ? 0 : parseInt(raw, 10) });
                          }}
                          className="w-full min-h-[44px] rounded-xl border border-[#202531]/20 pl-9 pr-3 text-sm font-bold text-[#202531] tabular-nums focus:outline-none focus:border-[#006B69]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExpenseRow(idx)}
                        aria-label="Hapus baris pengeluaran operasional"
                        className="w-11 h-11 rounded-xl border border-[#D41448]/25 bg-[#FFF0F4] text-[#D41448] flex items-center justify-center hover:bg-[#D41448]/10 cursor-pointer shrink-0"
                      >
                        <Trash size={16} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2 border-t border-[#202531]/10 text-xs font-bold text-[#202531]">
                  <span>Total Uang Operasional Shift Ini</span>
                  <span className="tabular-nums text-sm">{formatRupiah(operationalExpenseTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Catatan Opsional */}
        <div className="space-y-1.5">
          <label htmlFor="shift-note-input" className="block text-sm font-extrabold text-[#202531]">
            {isClosing ? "3. Catatan Tutup Shift (Tidak Wajib)" : "2. Catatan Buka Shift (Tidak Wajib)"}
          </label>
          <textarea
            id="shift-note-input"
            rows={2}
            maxLength={500}
            disabled={submitting}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isClosing
                ? "Misalnya: ada uang receh kurang, atau catatan kondisi loker untuk shift berikutnya..."
                : "Misalnya: kondisi laci kasir atau uang receh kembalian saat mulai shift..."
            }
            className="w-full rounded-xl border border-[#202531]/20 px-3.5 py-2.5 text-sm text-[#202531] placeholder:text-[#525866]/70 focus:outline-none focus:border-[#006B69] focus:ring-2 focus:ring-[#01DAD7]/30"
          />
        </div>

        {/* Konfirmasi Checkbox */}
        <div className="rounded-2xl border border-[#202531]/15 bg-[#EBEBEB]/40 p-4 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={confirmed}
              aria-invalid={Boolean(confirmedError)}
              aria-describedby={confirmedError ? "shift-confirm-error" : undefined}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (e.target.checked) setConfirmedError(null);
              }}
              className="mt-0.5 w-5 h-5 rounded border-[#202531]/30 accent-[#006B69] shrink-0 cursor-pointer"
            />
            <span className="text-sm font-semibold text-[#202531] leading-snug">
              {isClosing
                ? "Saya menyatakan seluruh uang tunai di loker dan catatan operasional di atas telah dihitung dengan benar dan jujur."
                : "Saya memastikan uang modal di loker sesuai dengan hitungan di atas dan siap memulai shift kasir."}
            </span>
          </label>
          {confirmedError && (
            <p id="shift-confirm-error" role="alert" className="text-xs font-bold text-[#D41448] pl-8">
              {confirmedError}
            </p>
          )}
        </div>

        {/* Tombol Submit Utama */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[52px] rounded-2xl bg-[#01DAD7] text-[#202531] text-base font-extrabold flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 cursor-pointer transition-opacity duration-150"
        >
          <span>
            {submitting
              ? "Menyimpan Data Shift..."
              : isClosing
                ? `Simpan & Tutup Shift (${formatRupiah(countedCashTotal)})`
                : `Konfirmasi & Mulai Shift (${formatRupiah(countedCashTotal)})`}
          </span>
        </button>
      </form>
    </div>
  );
}

