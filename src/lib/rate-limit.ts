import crypto from "node:crypto";

const rateWindowStore = new Map<string, number[]>();
const otpFailedAttemptStore = new Map<string, { attempts: number; lockedUntil: number }>();
const otpConsumedStore = new Map<string, number>();

const MAX_STORE_ENTRIES = 2000;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;
const OTP_CONSUMED_TTL_MS = 20 * 60 * 1000;

function pruneRateWindowStore(now: number, maxWindowMs: number): void {
  if (rateWindowStore.size <= MAX_STORE_ENTRIES) return;
  for (const [k, timestamps] of rateWindowStore.entries()) {
    const fresh = timestamps.filter((ts) => now - ts < maxWindowMs);
    if (fresh.length === 0) {
      rateWindowStore.delete(k);
    } else {
      rateWindowStore.set(k, fresh);
    }
  }
  while (rateWindowStore.size > MAX_STORE_ENTRIES) {
    const oldestKey = rateWindowStore.keys().next().value;
    if (oldestKey === undefined) break;
    rateWindowStore.delete(oldestKey);
  }
}

function pruneOtpStores(now: number): void {
  if (otpFailedAttemptStore.size > MAX_STORE_ENTRIES) {
    for (const [k, entry] of otpFailedAttemptStore.entries()) {
      if (entry.lockedUntil > 0 && now >= entry.lockedUntil) {
        otpFailedAttemptStore.delete(k);
      }
    }
    while (otpFailedAttemptStore.size > MAX_STORE_ENTRIES) {
      const oldestKey = otpFailedAttemptStore.keys().next().value;
      if (oldestKey === undefined) break;
      otpFailedAttemptStore.delete(oldestKey);
    }
  }

  if (otpConsumedStore.size > MAX_STORE_ENTRIES) {
    for (const [k, expiresAt] of otpConsumedStore.entries()) {
      if (now >= expiresAt) {
        otpConsumedStore.delete(k);
      }
    }
    while (otpConsumedStore.size > MAX_STORE_ENTRIES) {
      const oldestKey = otpConsumedStore.keys().next().value;
      if (oldestKey === undefined) break;
      otpConsumedStore.delete(oldestKey);
    }
  }
}

export function getClientIpKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);

  return "local";
}

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  options?: { enforceInTest?: boolean }
): { limited: boolean; remaining: number; retryAfterMs: number } {
  const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (isTestEnv && !options?.enforceInTest) {
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }

  const now = Date.now();
  pruneRateWindowStore(now, windowMs);

  const timestamps = (rateWindowStore.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxAttempts) {
    rateWindowStore.set(key, timestamps);
    const oldest = timestamps[0] ?? now;
    return {
      limited: true,
      remaining: 0,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
    };
  }

  timestamps.push(now);
  rateWindowStore.set(key, timestamps);
  return {
    limited: false,
    remaining: Math.max(0, maxAttempts - timestamps.length),
    retryAfterMs: 0,
  };
}

export function hashTokenKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isOtpTokenBlocked(token: string): {
  blocked: boolean;
  reason?: "USED" | "LOCKED";
} {
  const now = Date.now();
  const key = hashTokenKey(token);

  const consumedUntil = otpConsumedStore.get(key);
  if (typeof consumedUntil === "number") {
    if (now < consumedUntil) {
      return { blocked: true, reason: "USED" };
    }
    otpConsumedStore.delete(key);
  }

  const attemptEntry = otpFailedAttemptStore.get(key);
  if (attemptEntry && attemptEntry.lockedUntil > 0) {
    if (now < attemptEntry.lockedUntil) {
      return { blocked: true, reason: "LOCKED" };
    }
    otpFailedAttemptStore.delete(key);
  }

  return { blocked: false };
}

export function recordOtpFailedAttempt(
  token: string,
  maxAttempts = 5
): { locked: boolean; attempts: number } {
  const now = Date.now();
  pruneOtpStores(now);

  const key = hashTokenKey(token);
  const existing = otpFailedAttemptStore.get(key);
  const nextAttempts = (existing?.attempts ?? 0) + 1;
  const locked = nextAttempts >= maxAttempts;

  otpFailedAttemptStore.set(key, {
    attempts: nextAttempts,
    lockedUntil: locked ? now + OTP_LOCKOUT_MS : 0,
  });

  return { locked, attempts: nextAttempts };
}

export function markOtpTokenConsumed(token: string): void {
  const now = Date.now();
  pruneOtpStores(now);

  const key = hashTokenKey(token);
  otpConsumedStore.set(key, now + OTP_CONSUMED_TTL_MS);
  otpFailedAttemptStore.delete(key);
}

