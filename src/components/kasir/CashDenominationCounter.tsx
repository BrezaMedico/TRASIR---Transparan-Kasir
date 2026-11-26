"use client";

import React, { useState } from "react";
import {
  COIN_DENOMINATIONS,
  DenominationMap,
  PAPER_DENOMINATIONS,
  computeDenominationTotal,
  createEmptyDenominations,
} from "@/lib/shift-session";
import { formatNumber, formatRupiah } from "@/lib/format";
import { CaretDown, CaretUp, Coins, Minus, Money, Plus, ArrowCounterClockwise } from "@phosphor-icons/react";

interface CashDenominationCounterProps {
  value: DenominationMap;
  onChange: (next: DenominationMap) => void;
  title?: string;
  helperText?: string;
  disabled?: boolean;
}

export function CashDenominationCounter({
  value,
  onChange,
  title = "Hitung Pecahan Uang di Loker",
  helperText = "Masukkan jumlah lembar atau keping setiap pecahan uang yang Anda hitung sekarang.",
  disabled = false,
}: CashDenominationCounterProps) {
  const [showCoins, setShowCoins] = useState(() =>
    COIN_DENOMINATIONS.some((d) => (value[String(d)] ?? 0) > 0)
  );

  const totalCash = computeDenominationTotal(value);

  const updateCount = (denom: number, nextCount: number) => {
    const safeCount = Number.isFinite(nextCount) ? Math.max(0, Math.min(100000, Math.floor(nextCount))) : 0;
    onChange({
      ...value,
      [String(denom)]: safeCount,
    });
  };

  const renderDenomRow = (denom: number, kind: "paper" | "coin") => {
    const key = String(denom);
    const count = value[key] ?? 0;
    const subtotal = denom * count;
    const isActive = count > 0;

    return (
      <div
        key={key}
        className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-150 ${
          isActive
            ? "border-[#006B69]/40 bg-[#E6FBFB]/45"
            : "border-[#202531]/12 bg-white"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-[11px] font-bold tracking-tight ${
                kind === "paper"
                  ? "bg-[#202531]/8 text-[#202531]"
                  : "bg-[#EBEBEB] text-[#525866]"
              }`}
            >
              {kind === "paper" ? "Kertas" : "Koin"}
            </span>
            <span className="text-sm sm:text-base font-extrabold text-[#202531] tabular-nums">
              {formatRupiah(denom)}
            </span>
          </div>
          <p className="text-xs font-semibold text-[#525866] mt-0.5 tabular-nums">
            Subtotal: <span className={isActive ? "text-[#006B69] font-bold" : ""}>{formatRupiah(subtotal)}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={disabled || count <= 0}
            onClick={() => updateCount(denom, count - 1)}
            aria-label={`Kurangi pecahan ${formatRupiah(denom)}`}
            className="w-11 h-11 rounded-xl border border-[#202531]/20 bg-white text-[#202531] flex items-center justify-center hover:bg-[#EBEBEB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
          >
            <Minus size={16} weight="bold" aria-hidden="true" />
          </button>

          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={1}
            disabled={disabled}
            value={count === 0 ? "" : String(count)}
            placeholder="0"
            aria-label={`Jumlah ${kind === "paper" ? "lembar" : "keping"} ${formatRupiah(denom)}`}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              updateCount(denom, raw === "" ? 0 : parseInt(raw, 10));
            }}
            className="w-16 h-11 rounded-xl border border-[#202531]/25 bg-white text-center text-sm font-extrabold text-[#202531] tabular-nums focus:outline-none focus:border-[#006B69] focus:ring-2 focus:ring-[#01DAD7]/35 disabled:bg-[#EBEBEB]"
          />

          <button
            type="button"
            disabled={disabled}
            onClick={() => updateCount(denom, count + 1)}
            aria-label={`Tambah pecahan ${formatRupiah(denom)}`}
            className="w-11 h-11 rounded-xl border border-[#202531]/20 bg-[#202531] text-white flex items-center justify-center hover:bg-[#2c3344] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-[#202531] flex items-center gap-2">
            <Money size={18} weight="bold" className="text-[#006B69]" aria-hidden="true" />
            <span>{title}</span>
          </h2>
          <p className="text-xs text-[#525866] mt-0.5">{helperText}</p>
        </div>
        {totalCash > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onChange(createEmptyDenominations())}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl border border-[#202531]/20 bg-white text-xs font-bold text-[#525866] hover:text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
          >
            <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
            <span>Ulangi Hitungan</span>
          </button>
        )}
      </div>

      {/* Papan Hitung Uang Kertas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {PAPER_DENOMINATIONS.map((denom) => renderDenomRow(denom, "paper"))}
      </div>

      {/* Toggle Uang Koin Opsional */}
      <div>
        <button
          type="button"
          onClick={() => setShowCoins((prev) => !prev)}
          aria-expanded={showCoins}
          className="inline-flex items-center gap-2 px-3.5 min-h-[40px] rounded-xl border border-[#202531]/15 bg-[#EBEBEB]/60 text-xs font-bold text-[#202531] hover:bg-[#EBEBEB] cursor-pointer transition-colors duration-150"
        >
          <Coins size={15} weight="bold" className="text-[#525866]" aria-hidden="true" />
          <span>{showCoins ? "Sembunyikan Pecahan Koin" : "Tambah Hitungan Uang Koin (Rp 500, Rp 200, Rp 100)"}</span>
          {showCoins ? (
            <CaretUp size={14} weight="bold" aria-hidden="true" />
          ) : (
            <CaretDown size={14} weight="bold" aria-hidden="true" />
          )}
        </button>

        {showCoins && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-2.5">
            {COIN_DENOMINATIONS.map((denom) => renderDenomRow(denom, "coin"))}
          </div>
        )}
      </div>

      {/* Ringkasan Total Otomatis */}
      <div className="rounded-2xl bg-[#202531] text-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#EBEBEB]/80">Total Uang Fisik Dihitung</p>
          <p className="text-[11px] text-[#EBEBEB]/65 mt-0.5 tabular-nums">
            Terisi {formatNumber(Object.values(value).reduce((a, b) => a + (b || 0), 0))} lembar atau keping
          </p>
        </div>
        <p className="text-2xl sm:text-3xl font-extrabold text-[#01DAD7] tabular-nums tracking-tight">
          {formatRupiah(totalCash)}
        </p>
      </div>
    </div>
  );
}

