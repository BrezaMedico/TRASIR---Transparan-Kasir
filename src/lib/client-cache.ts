/**
 * Cache memori klien ringan (Stale-While-Revalidate) untuk navigasi instan antar-modul.
 * Data langsung tampil 0ms dari cache sambil revalidasi senyap di latar belakang.
 */

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const cacheGeneration = new Map<string, number>();

function bumpGeneration(key: string): void {
  cacheGeneration.set(key, (cacheGeneration.get(key) ?? 0) + 1);
}

export function getCachedData<T>(key: string, maxAgeMs = 5 * 60 * 1000): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > maxAgeMs) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCachedData<T>(key: string, data: T): void {
  memoryCache.set(key, { data, updatedAt: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    for (const key of new Set([...memoryCache.keys(), ...inflightRequests.keys()])) {
      bumpGeneration(key);
    }
    memoryCache.clear();
    inflightRequests.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      bumpGeneration(key);
      memoryCache.delete(key);
    }
  }
  for (const key of inflightRequests.keys()) {
    if (key.startsWith(prefix)) {
      bumpGeneration(key);
      inflightRequests.delete(key);
    }
  }
}

export function clearAllClientCache(): void {
  for (const key of new Set([...memoryCache.keys(), ...inflightRequests.keys()])) {
    bumpGeneration(key);
  }
  memoryCache.clear();
  inflightRequests.clear();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem("trasir_auth_cta_hint");
    } catch {
      // ignore storage restriction
    }
  }
}

/**
 * Mengambil JSON dari endpoint dengan deduplikasi request bersamaan & pembaruan cache otomatis.
 */
export async function fetchJsonCached<T>(
  url: string,
  options?: { force?: boolean }
): Promise<{ ok: boolean; status: number; data: T }> {
  if (!options?.force && inflightRequests.has(url)) {
    return inflightRequests.get(url) as Promise<{ ok: boolean; status: number; data: T }>;
  }

  const genAtStart = cacheGeneration.get(url) ?? 0;
  const req = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as T;
      if (res.ok && (cacheGeneration.get(url) ?? 0) === genAtStart) {
        setCachedData(url, data);
      }
      return { ok: res.ok, status: res.status, data };
    })
    .finally(() => {
      if (inflightRequests.get(url) === req) {
        inflightRequests.delete(url);
      }
    });

  inflightRequests.set(url, req);
  return req;
}

