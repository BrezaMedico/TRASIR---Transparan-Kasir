/**
 * Utilitas zona waktu Asia/Jakarta (WIB, UTC+7 tanpa DST).
 * Digunakan untuk konsistensi batas periode Hari Ini, Minggu Ini (awal Senin), dan Bulan Ini.
 */

export type ProfitPeriod = "today" | "week" | "month";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toJakartaWallClock(date: Date): Date {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS);
}

function fromJakartaWallClock(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Date {
  return new Date(
    Date.UTC(year, monthIndex, day, hour, minute, second, ms) - JAKARTA_OFFSET_MS
  );
}

export function getJakartaDateKey(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const wib = toJakartaWallClock(d);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const day = String(wib.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getJakartaHourKey(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const wib = toJakartaWallClock(d);
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  return `${hh}:00`;
}

export function getJakartaStartOfDay(now = new Date()): Date {
  const wib = toJakartaWallClock(now);
  return fromJakartaWallClock(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
}

export function getJakartaDateParts(dateInput: Date | string = new Date()): {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
} {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const wib = toJakartaWallClock(d);
  return {
    year: wib.getUTCFullYear(),
    monthIndex: wib.getUTCMonth(),
    day: wib.getUTCDate(),
    hour: wib.getUTCHours(),
  };
}

export function getJakartaCurrentHour(now = new Date()): number {
  return toJakartaWallClock(now).getUTCHours();
}

export function getJakartaDaysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addJakartaDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateKey;
  }
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function enumerateJakartaDateKeys(startDateKey: string, endDateKey: string): string[] {
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];
  const keys: string[] = [];
  let cursor = startDateKey;
  const maxIterations = 400;
  for (let i = 0; i < maxIterations; i += 1) {
    keys.push(cursor);
    if (cursor >= endDateKey) break;
    cursor = addJakartaDays(cursor, 1);
  }
  return keys;
}

export function enumerateJakartaMonthKeys(startDateKey: string, endDateKey: string): string[] {
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];
  const [sy, sm] = startDateKey.split("-").map(Number);
  const [ey, em] = endDateKey.split("-").map(Number);
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || !Number.isFinite(ey) || !Number.isFinite(em)) {
    return [];
  }
  const keys: string[] = [];
  let y = sy;
  let m = sm;
  for (let i = 0; i < 60; i += 1) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y > ey || (y === ey && m >= em)) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export interface JakartaPeriodBounds {
  period: ProfitPeriod;
  timezone: "Asia/Jakarta";
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
  label: string;
  previousLabel: string;
}

/**
 * Menghitung rentang waktu periode aktif dan periode pembanding di zona waktu Asia/Jakarta.
 * - today: awal hari WIB 00:00 hingga sekarang (pembanding: kemarin penuh WIB)
 * - week: Senin 00:00 WIB minggu berjalan hingga sekarang (pembanding: Senin-Minggu pekan lalu WIB)
 * - month: tanggal 1 pukul 00:00 WIB bulan berjalan hingga sekarang (pembanding: bulan sebelumnya penuh WIB)
 */
export function getJakartaPeriodBounds(
  period: ProfitPeriod,
  now = new Date()
): JakartaPeriodBounds {
  const wib = toJakartaWallClock(now);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth();
  const date = wib.getUTCDate();

  if (period === "today") {
    const startDate = fromJakartaWallClock(year, month, date, 0, 0, 0, 0);
    const previousStartDate = new Date(startDate.getTime() - DAY_MS);
    const previousEndDate = new Date(startDate.getTime() - 1);
    return {
      period,
      timezone: "Asia/Jakarta",
      startDate,
      endDate: now,
      previousStartDate,
      previousEndDate,
      label: "Hari Ini (WIB)",
      previousLabel: "Kemarin",
    };
  }

  if (period === "week") {
    // getUTCDay(): 0 = Minggu, 1 = Senin, ..., 6 = Sabtu -> ubah agar 0 = Senin, ..., 6 = Minggu
    const daysSinceMonday = (wib.getUTCDay() + 6) % 7;
    const mondayStartUtcMs =
      Date.UTC(year, month, date, 0, 0, 0, 0) - daysSinceMonday * DAY_MS;
    const startDate = new Date(mondayStartUtcMs - JAKARTA_OFFSET_MS);
    const previousStartDate = new Date(startDate.getTime() - 7 * DAY_MS);
    const previousEndDate = new Date(startDate.getTime() - 1);
    return {
      period,
      timezone: "Asia/Jakarta",
      startDate,
      endDate: now,
      previousStartDate,
      previousEndDate,
      label: "Minggu Ini (Mulai Senin, WIB)",
      previousLabel: "Minggu Lalu",
    };
  }

  // period === "month"
  const startDate = fromJakartaWallClock(year, month, 1, 0, 0, 0, 0);
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonthIndex = month === 0 ? 11 : month - 1;
  const previousStartDate = fromJakartaWallClock(prevMonthYear, prevMonthIndex, 1, 0, 0, 0, 0);
  const previousEndDate = new Date(startDate.getTime() - 1);

  return {
    period: "month",
    timezone: "Asia/Jakarta",
    startDate,
    endDate: now,
    previousStartDate,
    previousEndDate,
    label: "Bulan Ini (WIB)",
    previousLabel: "Bulan Lalu",
  };
}

