"use client";

import React, { useId, useMemo, useState } from "react";
import Link from "next/link";
import { type CounterComparisonMetric } from "@/lib/counters";
import { formatNumber, formatRupiah } from "@/lib/format";
import { formatCompactRupiahAxis } from "./sales-line-chart-utils";
import { LockKey, Storefront, CheckCircle, Warning } from "@phosphor-icons/react";

interface CounterComparisonChartProps {
  data: CounterComparisonMetric[];
  periodLabel: string;
}

export function CounterComparisonChart({
  data,
  periodLabel,
}: CounterComparisonChartProps) {
  const uid = useId().replace(/:/g, "");
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);

  const visibleData = useMemo(() => data.slice(0, 8), [data]);
  const maxMoney = useMemo(() => {
    let m = 0;
    for (const item of visibleData) {
      m = Math.max(m, item.totalExpectedCash, item.totalActualCash, item.totalSystemSales);
    }
    return m > 0 ? m : 100000;
  }, [visibleData]);

  const activeMetric =
    visibleData.find((d) => d.counterId === selectedCounterId) ?? visibleData[0] ?? null;

  const totalShifts = data.reduce((sum, d) => sum + d.shiftCount, 0);
  const totalNetDiff = data.reduce((sum, d) => sum + d.totalCashDifference, 0);
  const totalSales = data.reduce((sum, d) => sum + d.totalSystemSales, 0);

  const chartWidth = 680;
  const chartHeight = 250;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 42;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    val: Math.round(maxMoney * ratio),
    y: padTop + innerH - innerH * ratio,
  }));

  return (
    <div className="space-y-4">
      {/* 3 Ringkasan Atas Per Loket */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/45 p-3.5">
          <p className="text-xs font-semibold text-[#525866]">Total Penjualan Seluruh Loket ({periodLabel})</p>
          <p className="text-lg font-extrabold text-[#202531] mt-0.5 tabular-nums">
            {formatRupiah(totalSales)}
          </p>
        </div>
        <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/45 p-3.5">
          <p className="text-xs font-semibold text-[#525866]">Total Shift Selesai</p>
          <p className="text-lg font-extrabold text-[#202531] mt-0.5 tabular-nums">
            {formatNumber(totalShifts)} Shift ({data.length} Loket)
          </p>
        </div>
        <div className="rounded-xl border border-[#202531]/12 bg-[#EBEBEB]/45 p-3.5">
          <p className="text-xs font-semibold text-[#525866]">Akumulasi Selisih Kas Loket</p>
          <p
            className={`text-lg font-extrabold mt-0.5 tabular-nums ${
              totalNetDiff < 0
                ? "text-[#D41448]"
                : totalNetDiff === 0
                  ? "text-[#006B69]"
                  : "text-[#202531]"
            }`}
          >
            {totalNetDiff > 0 ? `+${formatRupiah(totalNetDiff)}` : formatRupiah(totalNetDiff)}
          </p>
        </div>
      </div>

      {/* Grafik Batang Berdampingan Per Loket */}
      {visibleData.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#202531]/20 p-8 text-center text-xs text-[#525866]">
          Belum ada data loket kasir yang tercatat.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#202531]">
                <span className="w-3 h-3 rounded-sm bg-[#202531] inline-block" aria-hidden="true" />
                <span>Seharusnya Ada (Sistem)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-[#006B69]">
                <span className="w-3 h-3 rounded-sm bg-[#01DAD7] inline-block" aria-hidden="true" />
                <span>Fisik Loker Dihitung Kasir</span>
              </span>
            </div>
            {activeMetric && (
              <span className="text-xs font-bold text-[#525866] tabular-nums">
                Fokus: <strong className="text-[#202531]">{activeMetric.counterName}</strong> · Selisih{" "}
                <strong
                  className={
                    activeMetric.totalCashDifference < 0 ? "text-[#D41448]" : "text-[#006B69]"
                  }
                >
                  {formatRupiah(activeMetric.totalCashDifference)}
                </strong>
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-labelledby={`counter-chart-title-${uid}`}
              className="w-full h-auto min-w-[480px]"
            >
              <title id={`counter-chart-title-${uid}`}>
                Grafik perbandingan uang sistem dan uang fisik loker per loket kasir
              </title>

              {yTicks.map((t, idx) => (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={t.y}
                    x2={chartWidth - padRight}
                    y2={t.y}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                    strokeDasharray={t.ratio === 0 ? undefined : "3 3"}
                  />
                  <text
                    x={padLeft - 8}
                    y={t.y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="currentColor"
                    opacity={0.7}
                  >
                    {formatCompactRupiahAxis(t.val)}
                  </text>
                </g>
              ))}

              {visibleData.map((item, idx) => {
                const slotW = innerW / visibleData.length;
                const groupCenter = padLeft + slotW * idx + slotW / 2;
                const barW = Math.min(26, Math.max(14, slotW * 0.24));
                const gap = 6;

                const expectedH = Math.max(2, (item.totalExpectedCash / maxMoney) * innerH);
                const actualH = Math.max(2, (item.totalActualCash / maxMoney) * innerH);

                const expectedY = padTop + innerH - expectedH;
                const actualY = padTop + innerH - actualH;

                const isMismatch = item.discrepancyCount > 0 || item.totalCashDifference !== 0;

                return (
                  <g
                    key={item.counterId}
                    tabIndex={0}
                    role="button"
                    aria-label={`${item.counterName}: Seharusnya ${formatRupiah(
                      item.totalExpectedCash
                    )}, Fisik ${formatRupiah(item.totalActualCash)}, Selisih ${formatRupiah(
                      item.totalCashDifference
                    )}`}
                    onClick={() => setSelectedCounterId(item.counterId)}
                    onFocus={() => setSelectedCounterId(item.counterId)}
                    onMouseEnter={() => setSelectedCounterId(item.counterId)}
                    className="cursor-pointer outline-none"
                  >
                    <rect
                      x={groupCenter - barW - gap / 2}
                      y={expectedY}
                      width={barW}
                      height={expectedH}
                      rx={4}
                      fill="var(--trasir-chart-primary, #202531)"
                    />
                    <rect
                      x={groupCenter + gap / 2}
                      y={actualY}
                      width={barW}
                      height={actualH}
                      rx={4}
                      fill={isMismatch ? "#FF2A63" : "#01DAD7"}
                    />
                    <text
                      x={groupCenter}
                      y={padTop + innerH + 18}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="currentColor"
                    >
                      {item.counterName.length > 14
                        ? `${item.counterName.slice(0, 13)}…`
                        : item.counterName}
                    </text>
                    <text
                      x={groupCenter}
                      y={padTop + innerH + 32}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill="currentColor"
                      opacity={0.75}
                    >
                      {item.shiftCount} shift
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Tabel Rincian Per Loket (A11y Fallback & Mudah Dibaca Awam) */}
      <div className="overflow-x-auto border-t border-[#202531]/10 pt-3">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#202531]/15 text-[11px] font-bold uppercase text-[#525866]">
              <th className="py-2 px-3">Nama Loket</th>
              <th className="py-2 px-3">Status Saat Ini</th>
              <th className="py-2 px-3 text-right">Omzet Sistem</th>
              <th className="py-2 px-3 text-right">Kas Seharusnya</th>
              <th className="py-2 px-3 text-right">Kas Fisik Loker</th>
              <th className="py-2 px-3 text-right">Selisih Kas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#202531]/10">
            {data.map((row) => {
              const hasIssue = row.discrepancyCount > 0 || row.handoverMismatchCount > 0;
              return (
                <tr key={row.counterId}>
                  <td className="py-2.5 px-3 font-extrabold text-[#202531]">
                    <span className="inline-flex items-center gap-1.5">
                      <Storefront size={14} weight="bold" aria-hidden="true" />
                      <span>{row.counterName}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {row.isOccupied && row.occupiedByName ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E6FBFB] px-2 py-0.5 text-[11px] font-bold text-[#006B69]">
                        <LockKey size={12} weight="bold" aria-hidden="true" />
                        <span>Dipakai {row.occupiedByName}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EBEBEB] px-2 py-0.5 text-[11px] font-semibold text-[#525866]">
                        <CheckCircle size={12} weight="bold" aria-hidden="true" />
                        <span>Kosong ({row.shiftCount} shift selesai)</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatRupiah(row.totalSystemSales)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatRupiah(row.totalExpectedCash)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                    {formatRupiah(row.totalActualCash)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {hasIssue && (
                        <Warning
                          size={13}
                          weight="fill"
                          className="text-[#D41448]"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`font-mono font-extrabold tabular-nums ${
                          row.totalCashDifference < 0
                            ? "text-[#D41448]"
                            : row.totalCashDifference === 0
                              ? "text-[#006B69]"
                              : "text-[#202531]"
                        }`}
                      >
                        {row.totalCashDifference > 0
                          ? `+${formatRupiah(row.totalCashDifference)}`
                          : formatRupiah(row.totalCashDifference)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[#525866]">
          Klik salah satu batang loket pada grafik untuk melihat ringkasan selisihnya.
        </span>
        <Link href="/laporan#audit-shift" className="font-extrabold text-[#006B69] hover:underline">
          Lihat Detail Audit Tiap Shift
        </Link>
      </div>
    </div>
  );
}

