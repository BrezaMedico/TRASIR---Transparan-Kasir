"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChartLineUp } from "@phosphor-icons/react";
import { formatNumber, formatRupiah } from "@/lib/format";
import {
  buildAreaPath,
  buildMonotonePath,
  computeNiceScale,
  formatCompactRupiahAxis,
  pickXAxisTickIndices,
  type ChartPointCoord,
} from "./sales-line-chart-utils";

export interface SalesLineChartPoint {
  key: string;
  label: string;
  shortLabel?: string;
  revenue: number;
  grossProfit: number;
  cogs?: number;
  salesCount?: number;
  isFuture?: boolean;
}

export interface SalesLineChartPeriodOption<T extends string = string> {
  id: T;
  label: string;
}

export interface SalesLineChartProps<T extends string = string> {
  title: string;
  subtitle?: string;
  data: SalesLineChartPoint[];
  granularity: "hourly" | "daily" | "monthly";
  periodControl?: {
    value: T;
    options: readonly SalesLineChartPeriodOption<T>[];
    onChange: (next: T) => void;
    ariaLabel?: string;
  };
  showCogsSeries?: boolean;
  defaultVisibleSeries?: {
    revenue?: boolean;
    grossProfit?: boolean;
    cogs?: boolean;
  };
  emptyTitle?: string;
  emptySubtitle?: string;
  headingId?: string;
  loading?: boolean;
}

type SeriesKey = "revenue" | "grossProfit" | "cogs";

export function SalesLineChart<T extends string = string>({
  title,
  subtitle,
  data,
  granularity,
  periodControl,
  showCogsSeries = false,
  defaultVisibleSeries,
  emptyTitle = "Belum ada transaksi pada periode ini.",
  emptySubtitle = "Grafik garis akan muncul otomatis setelah penjualan tercatat di Kasir.",
  headingId = "sales-line-chart-heading",
  loading = false,
}: SalesLineChartProps<T>) {
  const uid = useId().replace(/:/g, "");
  const revenueAreaGradId = `rev-area-${uid}`;
  const profitAreaGradId = `prof-area-${uid}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(720);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    revenue: defaultVisibleSeries?.revenue ?? true,
    grossProfit: defaultVisibleSeries?.grossProfit ?? true,
    cogs: showCogsSeries ? (defaultVisibleSeries?.cogs ?? true) : false,
  });

  useEffect(() => {
    setVisibleSeries((prev) => ({
      ...prev,
      cogs: showCogsSeries ? prev.cogs : false,
    }));
  }, [showCogsSeries]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateWidth = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setContainerWidth(next);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset hover selection when series length/granularity switches
  useEffect(() => {
    setActiveIndex(null);
  }, [data.length, granularity]);

  const elapsedEntries = useMemo(
    () =>
      data
        .map((point, index) => ({ point, index }))
        .filter((entry) => !entry.point.isFuture),
    [data]
  );

  const hasData = useMemo(
    () =>
      elapsedEntries.some(
        ({ point }) =>
          point.revenue > 0 ||
          point.grossProfit !== 0 ||
          (point.cogs ?? 0) > 0 ||
          (point.salesCount ?? 0) > 0
      ),
    [elapsedEntries]
  );

  const summaryStats = useMemo(() => {
    if (elapsedEntries.length === 0 || !hasData) {
      return null;
    }

    let peakEntry = elapsedEntries[0];
    let sumRevenue = 0;
    let totalSalesCount = 0;
    let hasSalesCount = false;

    for (const entry of elapsedEntries) {
      sumRevenue += entry.point.revenue;
      if (entry.point.revenue > peakEntry.point.revenue) {
        peakEntry = entry;
      }
      if (typeof entry.point.salesCount === "number") {
        hasSalesCount = true;
        totalSalesCount += entry.point.salesCount;
      }
    }

    const avgRevenue = Math.round(sumRevenue / Math.max(1, elapsedEntries.length));
    const avgLabel =
      granularity === "hourly"
        ? "Rata-rata / Jam"
        : granularity === "monthly"
        ? "Rata-rata / Bulan"
        : "Rata-rata / Hari";

    return {
      peakValue: peakEntry.point.revenue,
      peakLabel: peakEntry.point.shortLabel || peakEntry.point.label,
      avgValue: avgRevenue,
      avgLabel,
      hasSalesCount,
      totalSalesCount,
    };
  }, [elapsedEntries, hasData, granularity]);

  const isCompact = containerWidth < 520;
  const svgWidth = Math.max(300, containerWidth);
  const svgHeight = isCompact ? 224 : 264;
  const padTop = 18;
  const padRight = 16;
  const padBottom = 32;
  const padLeft = isCompact ? 54 : 66;
  const plotWidth = Math.max(120, svgWidth - padLeft - padRight);
  const plotHeight = Math.max(100, svgHeight - padTop - padBottom);

  const yScale = useMemo(() => {
    const vals: number[] = [];
    for (const { point } of elapsedEntries) {
      if (visibleSeries.revenue) vals.push(point.revenue);
      if (visibleSeries.grossProfit) vals.push(point.grossProfit);
      if (showCogsSeries && visibleSeries.cogs) vals.push(point.cogs ?? 0);
    }
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
    return computeNiceScale(minVal, maxVal, isCompact ? 3 : 4);
  }, [elapsedEntries, visibleSeries, showCogsSeries, isCompact]);

  const slotX = (index: number): number => {
    if (data.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (data.length - 1)) * plotWidth;
  };

  const valueY = (val: number): number => {
    const span = yScale.max - yScale.min;
    if (span <= 0) return padTop + plotHeight;
    const ratio = (val - yScale.min) / span;
    return padTop + plotHeight - ratio * plotHeight;
  };

  const zeroBaselineY = valueY(0);

  const revenueCoords: ChartPointCoord[] = useMemo(() => {
    const span = yScale.max - yScale.min;
    const toX = (idx: number) =>
      data.length <= 1 ? padLeft + plotWidth / 2 : padLeft + (idx / (data.length - 1)) * plotWidth;
    const toY = (val: number) =>
      span <= 0 ? padTop + plotHeight : padTop + plotHeight - ((val - yScale.min) / span) * plotHeight;

    return elapsedEntries.map(({ point, index }) => ({
      x: toX(index),
      y: toY(point.revenue),
    }));
  }, [elapsedEntries, data.length, padLeft, plotWidth, padTop, plotHeight, yScale]);

  const profitCoords: ChartPointCoord[] = useMemo(() => {
    const span = yScale.max - yScale.min;
    const toX = (idx: number) =>
      data.length <= 1 ? padLeft + plotWidth / 2 : padLeft + (idx / (data.length - 1)) * plotWidth;
    const toY = (val: number) =>
      span <= 0 ? padTop + plotHeight : padTop + plotHeight - ((val - yScale.min) / span) * plotHeight;

    return elapsedEntries.map(({ point, index }) => ({
      x: toX(index),
      y: toY(point.grossProfit),
    }));
  }, [elapsedEntries, data.length, padLeft, plotWidth, padTop, plotHeight, yScale]);

  const cogsCoords: ChartPointCoord[] = useMemo(() => {
    const span = yScale.max - yScale.min;
    const toX = (idx: number) =>
      data.length <= 1 ? padLeft + plotWidth / 2 : padLeft + (idx / (data.length - 1)) * plotWidth;
    const toY = (val: number) =>
      span <= 0 ? padTop + plotHeight : padTop + plotHeight - ((val - yScale.min) / span) * plotHeight;

    return elapsedEntries.map(({ point, index }) => ({
      x: toX(index),
      y: toY(point.cogs ?? 0),
    }));
  }, [elapsedEntries, data.length, padLeft, plotWidth, padTop, plotHeight, yScale]);

  const revenueLinePath = useMemo(() => buildMonotonePath(revenueCoords), [revenueCoords]);
  const revenueAreaPath = useMemo(
    () => buildAreaPath(revenueLinePath, revenueCoords, zeroBaselineY),
    [revenueLinePath, revenueCoords, zeroBaselineY]
  );

  const profitLinePath = useMemo(() => buildMonotonePath(profitCoords), [profitCoords]);
  const profitAreaPath = useMemo(
    () => buildAreaPath(profitLinePath, profitCoords, zeroBaselineY),
    [profitLinePath, profitCoords, zeroBaselineY]
  );

  const cogsLinePath = useMemo(() => buildMonotonePath(cogsCoords), [cogsCoords]);

  const xTickIndices = useMemo(() => {
    const maxTicks = containerWidth < 460 ? 5 : containerWidth < 720 ? 7 : 10;
    return pickXAxisTickIndices(data.length, maxTicks);
  }, [data.length, containerWidth]);

  const firstFutureIndex = useMemo(() => data.findIndex((p) => Boolean(p.isFuture)), [data]);

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const activeCount =
        (next.revenue ? 1 : 0) +
        (next.grossProfit ? 1 : 0) +
        (showCogsSeries && next.cogs ? 1 : 0);
      if (activeCount === 0) return prev;
      return next;
    });
  };

  const snapNearestElapsedIndex = (clientX: number) => {
    if (!svgRef.current || elapsedEntries.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * svgWidth;

    let closest = elapsedEntries[0].index;
    let bestDist = Infinity;
    for (const entry of elapsedEntries) {
      const dist = Math.abs(slotX(entry.index) - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        closest = entry.index;
      }
    }
    setActiveIndex(closest);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (elapsedEntries.length === 0) return;
    if (e.key === "Escape") {
      setActiveIndex(null);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();

    const currentPos =
      activeIndex === null
        ? elapsedEntries.length - 1
        : elapsedEntries.findIndex((item) => item.index === activeIndex);
    const safePos = currentPos === -1 ? elapsedEntries.length - 1 : currentPos;
    const nextPos =
      e.key === "ArrowLeft"
        ? Math.max(0, safePos - 1)
        : Math.min(elapsedEntries.length - 1, safePos + 1);
    setActiveIndex(elapsedEntries[nextPos].index);
  };

  const effectivePoint =
    activeIndex !== null
      ? data[activeIndex] ?? null
      : isCompact && elapsedEntries.length > 0
      ? elapsedEntries[elapsedEntries.length - 1].point
      : null;

  const activeElapsedPosition =
    activeIndex !== null
      ? elapsedEntries.findIndex((item) => item.index === activeIndex)
      : -1;

  const tooltipX = activeIndex !== null ? slotX(activeIndex) : 0;
  const tooltipAnchorRight = tooltipX > svgWidth * 0.62;
  const showPointDots = elapsedEntries.length <= 14;
  const latestElapsedIndex =
    elapsedEntries.length > 0 ? elapsedEntries[elapsedEntries.length - 1].index : null;

  return (
    <section
      aria-labelledby={headingId}
      className="bg-white rounded-2xl border border-[#202531]/15 p-5 sm:p-6 space-y-4 relative"
    >
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-base font-extrabold text-[#202531]">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-[#525866] mt-0.5">{subtitle}</p>}
        </div>

        {periodControl && (
          <div
            role="group"
            aria-label={periodControl.ariaLabel || "Pilih rentang waktu grafik"}
            className="inline-flex flex-wrap p-1 rounded-xl bg-[#EBEBEB] self-start md:self-auto"
          >
            {periodControl.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={periodControl.value === opt.id}
                onClick={() => periodControl.onChange(opt.id)}
                className={`px-3.5 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs font-bold transition-colors duration-150 cursor-pointer ${
                  periodControl.value === opt.id
                    ? "bg-[#202531] text-white"
                    : "text-[#525866] hover:text-[#202531]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Series Filter Toggles + Quick Summary Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pilih garis data">
          <button
            type="button"
            aria-pressed={visibleSeries.revenue}
            onClick={() => toggleSeries("revenue")}
            className={`inline-flex items-center gap-2 px-3 min-h-[40px] rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              visibleSeries.revenue
                ? "border-[#202531] bg-[#202531]/5 text-[#202531]"
                : "border-[#202531]/15 bg-white text-[#525866] opacity-70 hover:opacity-100"
            }`}
          >
            <span className="w-3.5 h-1 rounded-full bg-[#202531]" aria-hidden="true" />
            <span>Uang Masuk</span>
          </button>

          <button
            type="button"
            aria-pressed={visibleSeries.grossProfit}
            onClick={() => toggleSeries("grossProfit")}
            className={`inline-flex items-center gap-2 px-3 min-h-[40px] rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              visibleSeries.grossProfit
                ? "border-[#008F8C] bg-[#01DAD7]/10 text-[#202531]"
                : "border-[#202531]/15 bg-white text-[#525866] opacity-70 hover:opacity-100"
            }`}
          >
            <span className="w-3.5 h-1 rounded-full bg-[#008F8C]" aria-hidden="true" />
            <span>Keuntungan</span>
          </button>

          {showCogsSeries && (
            <button
              type="button"
              aria-pressed={visibleSeries.cogs}
              onClick={() => toggleSeries("cogs")}
              className={`inline-flex items-center gap-2 px-3 min-h-[40px] rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                visibleSeries.cogs
                  ? "border-[#D41448]/60 bg-[#FFF0F4] text-[#D41448]"
                  : "border-[#202531]/15 bg-white text-[#525866] opacity-70 hover:opacity-100"
              }`}
            >
              <span
                className="w-3.5 h-0.5 border-t-2 border-dashed border-[#D41448]"
                aria-hidden="true"
              />
              <span>Modal / HPP</span>
            </button>
          )}
        </div>

        {summaryStats && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#202531]/10">
              <span className="text-[#525866] font-medium">Tertinggi: </span>
              <span className="font-mono font-extrabold text-[#202531]">
                {formatRupiah(summaryStats.peakValue)}
              </span>
              <span className="text-[#525866] font-medium"> ({summaryStats.peakLabel})</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#202531]/10">
              <span className="text-[#525866] font-medium">{summaryStats.avgLabel}: </span>
              <span className="font-mono font-extrabold text-[#202531]">
                {formatRupiah(summaryStats.avgValue)}
              </span>
            </div>

            {summaryStats.hasSalesCount && (
              <div className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#202531]/10">
                <span className="text-[#525866] font-medium">Total Transaksi: </span>
                <span className="font-mono font-extrabold text-[#202531]">
                  {formatNumber(summaryStats.totalSalesCount)}x
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty State vs Chart Canvas */}
      {!hasData ? (
        <div className="py-12 px-4 text-center space-y-2 rounded-2xl bg-[#F8FAFC] border border-dashed border-[#202531]/15">
          <ChartLineUp
            size={32}
            weight="duotone"
            className="mx-auto text-[#525866]"
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-[#202531]">{emptyTitle}</p>
          <p className="text-xs text-[#525866]">{emptySubtitle}</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label={`${title}. Gunakan tombol panah kiri dan kanan untuk menelusuri nilai tiap titik waktu.`}
          className={`relative select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#01DAD7] rounded-xl transition-opacity duration-150 ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          {/* Screen reader readout */}
          <div className="sr-only" aria-live="polite">
            {activeIndex !== null && data[activeIndex]
              ? `${data[activeIndex].label}: Uang Masuk ${formatRupiah(
                  data[activeIndex].revenue
                )}, Keuntungan ${formatRupiah(data[activeIndex].grossProfit)}`
              : ""}
          </div>

          {/* Mobile Docked Readout (prevents finger occlusion on small screens) */}
          {isCompact && effectivePoint && (
            <div className="mb-2.5 px-3.5 py-2.5 rounded-xl bg-[#202531] text-white text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{effectivePoint.label}</span>
                {typeof effectivePoint.salesCount === "number" && (
                  <span className="font-mono text-[11px] text-[#EBEBEB]/80">
                    {formatNumber(effectivePoint.salesCount)} transaksi
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {visibleSeries.revenue && (
                  <span>
                    <span className="text-[#EBEBEB]/75">Masuk: </span>
                    <span className="font-mono font-extrabold text-white">
                      {formatRupiah(effectivePoint.revenue)}
                    </span>
                  </span>
                )}
                {visibleSeries.grossProfit && (
                  <span>
                    <span className="text-[#EBEBEB]/75">Untung: </span>
                    <span className="font-mono font-extrabold text-[#01DAD7]">
                      {formatRupiah(effectivePoint.grossProfit)}
                    </span>
                  </span>
                )}
                {showCogsSeries && visibleSeries.cogs && (
                  <span>
                    <span className="text-[#EBEBEB]/75">Modal: </span>
                    <span className="font-mono font-extrabold text-[#FF85A5]">
                      {formatRupiah(effectivePoint.cogs ?? 0)}
                    </span>
                  </span>
                )}
              </div>
              {activeIndex === null && (
                <p className="text-[10px] text-[#EBEBEB]/65">
                  Ketuk atau geser di atas grafik untuk cek waktu lain
                </p>
              )}
            </div>
          )}

          {/* SVG Chart Canvas */}
          <svg
            ref={svgRef}
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto block overflow-visible touch-pan-y cursor-crosshair"
            role="img"
            aria-label={title}
            onMouseMove={(e) => snapNearestElapsedIndex(e.clientX)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={(e) => snapNearestElapsedIndex(e.clientX)}
            onTouchStart={(e) => {
              if (e.touches[0]) snapNearestElapsedIndex(e.touches[0].clientX);
            }}
            onTouchMove={(e) => {
              if (e.touches[0]) snapNearestElapsedIndex(e.touches[0].clientX);
            }}
          >
            <defs>
              <linearGradient id={revenueAreaGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#202531" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#202531" stopOpacity="0.00" />
              </linearGradient>
              <linearGradient id={profitAreaGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#01DAD7" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#01DAD7" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Subtle background band for upcoming/future hours or days */}
            {firstFutureIndex > 0 && (
              <rect
                x={slotX(firstFutureIndex) - plotWidth / Math.max(2, (data.length - 1) * 2)}
                y={padTop}
                width={
                  padLeft +
                  plotWidth -
                  (slotX(firstFutureIndex) - plotWidth / Math.max(2, (data.length - 1) * 2))
                }
                height={plotHeight}
                fill="var(--trasir-chart-future, #F8FAFC)"
                rx={4}
              />
            )}

            {/* Horizontal Gridlines & Left Y-Axis Labels */}
            {yScale.ticks.map((tick) => {
              const y = valueY(tick);
              const isZero = tick === 0;
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotWidth}
                    y2={y}
                    stroke="var(--trasir-chart-grid, #EBEBEB)"
                    strokeWidth={isZero ? 1.25 : 1}
                    strokeDasharray={isZero ? undefined : "4 4"}
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fontWeight={isZero ? 700 : 600}
                    fill="var(--trasir-chart-axis, #525866)"
                    className="font-mono"
                  >
                    {formatCompactRupiahAxis(tick)}
                  </text>
                </g>
              );
            })}

            {/* Area Fills */}
            {visibleSeries.revenue && revenueAreaPath && (
              <path d={revenueAreaPath} fill={`url(#${revenueAreaGradId})`} />
            )}
            {visibleSeries.grossProfit && profitAreaPath && (
              <path d={profitAreaPath} fill={`url(#${profitAreaGradId})`} />
            )}

            {/* Modal / HPP Line (Dashed) */}
            {showCogsSeries && visibleSeries.cogs && cogsLinePath && elapsedEntries.length >= 2 && (
              <path
                d={cogsLinePath}
                fill="none"
                stroke="#D41448"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Keuntungan Line */}
            {visibleSeries.grossProfit && profitLinePath && elapsedEntries.length >= 2 && (
              <path
                d={profitLinePath}
                fill="none"
                stroke="var(--trasir-chart-profit, #008F8C)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Uang Masuk Line */}
            {visibleSeries.revenue && revenueLinePath && elapsedEntries.length >= 2 && (
              <path
                d={revenueLinePath}
                fill="none"
                stroke="var(--trasir-chart-primary, #202531)"
                strokeWidth={2.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active Crosshair Line */}
            {activeIndex !== null && (
              <line
                x1={slotX(activeIndex)}
                y1={padTop}
                x2={slotX(activeIndex)}
                y2={padTop + plotHeight}
                stroke="var(--trasir-chart-primary, #202531)"
                strokeOpacity={0.35}
                strokeWidth={1.25}
                strokeDasharray="3 3"
              />
            )}

            {/* Data Dots (shown when <=14 points, on single-point focal slots, or on active/latest point) */}
            {elapsedEntries.map(({ index }, pos) => {
              const isSelected = activeIndex === index;
              const isSingleOrLatest = elapsedEntries.length === 1 || index === latestElapsedIndex;
              if (!showPointDots && !isSelected && !isSingleOrLatest) return null;

              const revPt = revenueCoords[pos];
              const profPt = profitCoords[pos];
              const cogsPt = cogsCoords[pos];

              return (
                <g key={index}>
                  {showCogsSeries && visibleSeries.cogs && cogsPt && (
                    <circle
                      cx={cogsPt.x}
                      cy={cogsPt.y}
                      r={isSelected ? 5 : 3.25}
                      fill="var(--trasir-chart-dot-bg, #FFFFFF)"
                      stroke="#D41448"
                      strokeWidth={2}
                    />
                  )}
                  {visibleSeries.grossProfit && profPt && (
                    <circle
                      cx={profPt.x}
                      cy={profPt.y}
                      r={isSelected || elapsedEntries.length === 1 ? 5.5 : 3.75}
                      fill={isSelected ? "#01DAD7" : "var(--trasir-chart-dot-bg, #FFFFFF)"}
                      stroke="var(--trasir-chart-profit, #008F8C)"
                      strokeWidth={2.25}
                    />
                  )}
                  {visibleSeries.revenue && revPt && (
                    <>
                      {elapsedEntries.length === 1 && (
                        <circle
                          cx={revPt.x}
                          cy={revPt.y}
                          r={10}
                          fill="#01DAD7"
                          fillOpacity={0.22}
                        />
                      )}
                      <circle
                        cx={revPt.x}
                        cy={revPt.y}
                        r={isSelected || elapsedEntries.length === 1 ? 5.5 : 4}
                        fill="var(--trasir-chart-primary, #202531)"
                        stroke="var(--trasir-chart-dot-bg, #FFFFFF)"
                        strokeWidth={2}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Bottom X-Axis Labels */}
            {xTickIndices.map((idx) => {
              const item = data[idx];
              if (!item) return null;
              const x = slotX(idx);
              const anchor =
                idx === 0 && data.length > 1
                  ? "start"
                  : idx === data.length - 1 && data.length > 1
                  ? "end"
                  : "middle";
              const textLabel = item.shortLabel || item.label;
              const isActiveTick = activeIndex === idx;
              return (
                <text
                  key={item.key}
                  x={x}
                  y={svgHeight - 8}
                  textAnchor={anchor}
                  fontSize={11}
                  fontWeight={isActiveTick ? 800 : 600}
                  fill={isActiveTick ? "var(--trasir-chart-primary, #202531)" : "var(--trasir-chart-axis, #525866)"}
                  opacity={!isActiveTick && item.isFuture ? 0.65 : 1}
                  className="font-mono"
                >
                  {textLabel}
                </text>
              );
            })}
          </svg>

          {/* Desktop Floating Tooltip Card */}
          {!isCompact && activeIndex !== null && data[activeIndex] && activeElapsedPosition >= 0 && (
            <div
              className="pointer-events-none absolute top-2 z-20 min-w-[205px] max-w-[250px] rounded-xl bg-[#202531] text-white px-3.5 py-2.5 shadow-lg border border-white/10 text-xs space-y-1.5"
              style={
                tooltipAnchorRight
                  ? { right: `${Math.max(8, svgWidth - tooltipX + 12)}px` }
                  : { left: `${Math.min(svgWidth - 220, Math.max(padLeft, tooltipX + 12))}px` }
              }
            >
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                <span className="font-extrabold text-white">{data[activeIndex].label}</span>
                {typeof data[activeIndex].salesCount === "number" && (
                  <span className="font-mono text-[11px] text-[#EBEBEB]/80">
                    {formatNumber(data[activeIndex].salesCount ?? 0)}x
                  </span>
                )}
              </div>

              {visibleSeries.revenue && (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[#EBEBEB]/85">
                    <span className="w-2 h-2 rounded-full bg-white" aria-hidden="true" />
                    Uang Masuk
                  </span>
                  <span className="font-mono font-extrabold text-white tabular-nums">
                    {formatRupiah(data[activeIndex].revenue)}
                  </span>
                </div>
              )}

              {visibleSeries.grossProfit && (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[#EBEBEB]/85">
                    <span className="w-2 h-2 rounded-full bg-[#01DAD7]" aria-hidden="true" />
                    Keuntungan
                  </span>
                  <span className="font-mono font-extrabold text-[#01DAD7] tabular-nums">
                    {formatRupiah(data[activeIndex].grossProfit)}
                  </span>
                </div>
              )}

              {showCogsSeries && visibleSeries.cogs && (
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[#EBEBEB]/85">
                    <span className="w-2 h-2 rounded-full bg-[#FF85A5]" aria-hidden="true" />
                    Modal / HPP
                  </span>
                  <span className="font-mono font-extrabold text-[#FF85A5] tabular-nums">
                    {formatRupiah(data[activeIndex].cogs ?? 0)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
