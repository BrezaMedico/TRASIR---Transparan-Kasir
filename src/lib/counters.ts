export interface CounterConfig {
  id: string;
  name: string;
  createdAt: string;
}

export interface CounterOccupant {
  shiftId: string;
  userId: string;
  userName: string;
  userRole: string;
  openedAt: string;
}

export interface CounterLiveStatus extends CounterConfig {
  isOccupied: boolean;
  occupiedBy: CounterOccupant | null;
}

export interface CounterComparisonMetric {
  counterId: string;
  counterName: string;
  isOccupied: boolean;
  occupiedByName: string | null;
  shiftCount: number;
  totalSystemSales: number;
  totalSystemCash: number;
  totalExpectedCash: number;
  totalActualCash: number;
  totalCashDifference: number;
  discrepancyCount: number;
  handoverMismatchCount: number;
}

export const DEFAULT_COUNTER_ID = "loket-1";
export const DEFAULT_COUNTER_NAME = "Loket 1";
export const MAX_COUNTERS_PER_ROOM = 20;

export function createDefaultCounter(nowIso = new Date().toISOString()): CounterConfig {
  return {
    id: DEFAULT_COUNTER_ID,
    name: DEFAULT_COUNTER_NAME,
    createdAt: nowIso,
  };
}

export function slugifyCounterId(name: string, existingIds: Set<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "loket";

  if (!existingIds.has(base)) {
    existingIds.add(base);
    return base;
  }

  let idx = 2;
  while (existingIds.has(`${base}-${idx}`)) {
    idx += 1;
  }
  const uniqueId = `${base}-${idx}`;
  existingIds.add(uniqueId);
  return uniqueId;
}

export function buildInitialCounters(input?: {
  counterNames?: string[];
  counterCount?: number;
}): CounterConfig[] {
  const nowIso = new Date().toISOString();
  const existingIds = new Set<string>();
  const seenNames = new Set<string>();
  const counters: CounterConfig[] = [];

  if (Array.isArray(input?.counterNames) && input.counterNames.length > 0) {
    for (const rawName of input.counterNames.slice(0, MAX_COUNTERS_PER_ROOM)) {
      const cleaned = typeof rawName === "string" ? rawName.trim().slice(0, 40) : "";
      if (cleaned.length < 1) continue;
      const lowerKey = cleaned.toLowerCase();
      if (seenNames.has(lowerKey)) continue;
      seenNames.add(lowerKey);
      const id =
        counters.length === 0 && lowerKey === "loket 1"
          ? DEFAULT_COUNTER_ID
          : slugifyCounterId(cleaned, existingIds);
      existingIds.add(id);
      counters.push({ id, name: cleaned, createdAt: nowIso });
    }
  } else if (typeof input?.counterCount === "number" && Number.isFinite(input.counterCount)) {
    const count = Math.max(1, Math.min(10, Math.floor(input.counterCount)));
    for (let i = 1; i <= count; i++) {
      const id = i === 1 ? DEFAULT_COUNTER_ID : `loket-${i}`;
      existingIds.add(id);
      counters.push({
        id,
        name: `Loket ${i}`,
        createdAt: nowIso,
      });
    }
  }

  if (counters.length === 0) {
    return [createDefaultCounter(nowIso)];
  }

  return counters;
}

export function parseStoredCounters(raw: string | null | undefined): CounterConfig[] {
  if (!raw || typeof raw !== "string") {
    return [createDefaultCounter()];
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) {
    return [createDefaultCounter()];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [createDefaultCounter()];
    }
    const nowIso = new Date().toISOString();
    const existingIds = new Set<string>();
    const result: CounterConfig[] = [];

    for (const item of parsed.slice(0, MAX_COUNTERS_PER_ROOM)) {
      if (!item || typeof item !== "object") continue;
      const obj = item as { id?: unknown; name?: unknown; createdAt?: unknown };
      const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 40) : "";
      if (!name) continue;
      const rawId =
        typeof obj.id === "string" && obj.id.trim().length > 0
          ? obj.id.trim().slice(0, 48)
          : "";
      const id = rawId && !existingIds.has(rawId) ? rawId : slugifyCounterId(name, existingIds);
      existingIds.add(id);
      const createdAt =
        typeof obj.createdAt === "string" && obj.createdAt.length > 0
          ? obj.createdAt
          : nowIso;
      result.push({ id, name, createdAt });
    }

    return result.length > 0 ? result : [createDefaultCounter(nowIso)];
  } catch {
    return [createDefaultCounter()];
  }
}

export function suggestNextCounterName(counters: Pick<CounterConfig, "name">[]): string {
  const existing = new Set(counters.map((c) => c.name.trim().toLowerCase()));
  let num = counters.length + 1;
  while (existing.has(`loket ${num}`)) {
    num += 1;
  }
  return `Loket ${num}`;
}

