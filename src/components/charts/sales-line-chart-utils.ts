export interface ChartPointCoord {
  x: number;
  y: number;
}

export interface NiceScaleResult {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

function formatIdDecimal(value: number): string {
  const fixed = value.toFixed(1);
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return trimmed.replace(".", ",");
}

/**
 * Formats a Rupiah axis value cleanly in Indonesian units (rb / jt / M).
 */
export function formatCompactRupiahAxis(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "Rp 0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${formatIdDecimal(abs / 1_000_000_000)} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${formatIdDecimal(abs / 1_000_000)} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${formatIdDecimal(abs / 1_000)} rb`;
  }
  return `${sign}Rp ${Math.round(abs)}`;
}

/**
 * Computes human-readable rounded Y-axis bounds and ticks that always include 0.
 */
export function computeNiceScale(
  minVal: number,
  maxVal: number,
  targetSteps = 4
): NiceScaleResult {
  const safeMin = Number.isFinite(minVal) ? minVal : 0;
  const safeMax = Number.isFinite(maxVal) ? maxVal : 0;
  const rawMin = Math.min(0, safeMin);
  const rawMax = Math.max(0, safeMax);

  if (rawMin === 0 && rawMax === 0) {
    return {
      min: 0,
      max: 100_000,
      step: 25_000,
      ticks: [0, 25_000, 50_000, 75_000, 100_000],
    };
  }

  const steps = Math.max(2, targetSteps);
  const span = rawMax - rawMin;
  const roughStep = span / steps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const fraction = roughStep / magnitude;

  let niceFactor = 10;
  for (const candidate of [1, 2, 2.5, 5, 10]) {
    if (fraction <= candidate + 1e-9) {
      niceFactor = candidate;
      break;
    }
  }

  const step = Math.max(1, niceFactor * magnitude);
  const min = rawMin < 0 ? Math.floor(rawMin / step) * step : 0;
  const max = rawMax > 0 ? Math.ceil(rawMax / step) * step : 0;

  const ticks: number[] = [];
  const totalSteps = Math.max(1, Math.round((max - min) / step));
  for (let i = 0; i <= totalSteps; i += 1) {
    const tick = Math.round((min + i * step) * 100) / 100;
    ticks.push(Object.is(tick, -0) ? 0 : tick);
  }

  return { min, max, step, ticks };
}

/**
 * Builds a smooth Fritsch-Carlson monotone cubic Hermite SVG path without overshoot.
 */
export function buildMonotonePath(points: ChartPointCoord[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  const n = points.length;
  const dx: number[] = new Array(n - 1);
  const slopes: number[] = new Array(n - 1);

  for (let i = 0; i < n - 1; i += 1) {
    const deltaX = points[i + 1].x - points[i].x;
    dx[i] = Math.abs(deltaX) < 1e-6 ? 1e-6 : deltaX;
    slopes[i] = (points[i + 1].y - points[i].y) / dx[i];
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i += 1) {
    const sPrev = slopes[i - 1];
    const sNext = slopes[i];
    if (sPrev * sNext <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / sPrev + w2 / sNext);
    }
  }

  // Enforce Fritsch-Carlson monotonicity limits to prevent local overshoot
  for (let i = 0; i < n - 1; i += 1) {
    const s = slopes[i];
    if (Math.abs(s) < 1e-9) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / s;
      const b = tangents[i + 1] / s;
      const hypotSq = a * a + b * b;
      if (hypotSq > 9) {
        const tau = 3 / Math.sqrt(hypotSq);
        tangents[i] = tau * a * s;
        tangents[i + 1] = tau * b * s;
      }
    }
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    const cp1x = points[i].x + h;
    const cp1y = points[i].y + h * tangents[i];
    const cp2x = points[i + 1].x - h;
    const cp2y = points[i + 1].y - h * tangents[i + 1];
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${points[i + 1].x.toFixed(2)} ${points[i + 1].y.toFixed(2)}`;
  }

  return d;
}

/**
 * Closes a line path down to the chart zero baseline for soft area fills.
 */
export function buildAreaPath(
  linePath: string,
  points: ChartPointCoord[],
  baselineY: number
): string {
  if (!linePath || points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

/**
 * Picks non-crowded, evenly distributed X-axis tick indices including first and last slots.
 */
export function pickXAxisTickIndices(total: number, maxTicks: number): number[] {
  if (total <= 0 || maxTicks <= 0) return [];
  if (total <= maxTicks) {
    return Array.from({ length: total }, (_, idx) => idx);
  }
  if (maxTicks === 1) return [0];

  const last = total - 1;
  const stride = Math.max(1, Math.ceil(last / (maxTicks - 1)));
  const indices: number[] = [];

  for (let i = 0; i < last; i += stride) {
    indices.push(i);
  }

  // Drop the penultimate tick if it sits too close to the final slot label
  const minGapBeforeLast = Math.max(1, Math.floor(stride * 0.55));
  if (indices.length > 1 && last - indices[indices.length - 1] < minGapBeforeLast) {
    indices.pop();
  }

  if (indices[indices.length - 1] !== last) {
    indices.push(last);
  }

  return indices;
}

