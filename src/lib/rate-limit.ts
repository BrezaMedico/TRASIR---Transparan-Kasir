import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Fallback in-memory hanya dipakai untuk development lokal bila database tidak tersedia.
const devFallbackRateWindowStore = new Map<string, number[]>();
const devFallbackOtpStore = new Map<
  string,
  {
    codeHash?: string | null;
    attempts: number;
    maxAttempts: number;
    expiresAt: number;
    lockedUntil: number | null;
    consumedAt: number | null;
  }
>();

const MAX_DEV_STORE_ENTRIES = 2000;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;
const OTP_DEFAULT_TTL_MS = 15 * 60 * 1000;
const OTP_CONSUMED_TTL_MS = 20 * 60 * 1000;

let lastDbCleanupAt = 0;
const DB_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function isLocalDevFallbackAllowed(): boolean {
  if (process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === "false") {
    return false;
  }
  if (process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === "true") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}

function pruneDevStores(now: number, maxWindowMs: number): void {
  if (devFallbackRateWindowStore.size > MAX_DEV_STORE_ENTRIES) {
    for (const [k, timestamps] of devFallbackRateWindowStore.entries()) {
      const fresh = timestamps.filter((ts) => now - ts < maxWindowMs);
      if (fresh.length === 0) devFallbackRateWindowStore.delete(k);
      else devFallbackRateWindowStore.set(k, fresh);
    }
  }
  if (devFallbackOtpStore.size > MAX_DEV_STORE_ENTRIES) {
    for (const [k, entry] of devFallbackOtpStore.entries()) {
      if (now >= entry.expiresAt && (!entry.lockedUntil || now >= entry.lockedUntil)) {
        devFallbackOtpStore.delete(k);
      }
    }
  }
}

async function maybeCleanupExpiredDbRows(nowDate: Date): Promise<void> {
  const now = nowDate.getTime();
  if (now - lastDbCleanupAt < DB_CLEANUP_INTERVAL_MS) return;
  lastDbCleanupAt = now;
  await Promise.all([
    prisma.rateLimitEntry
      .deleteMany({ where: { resetAt: { lt: nowDate } } })
      .catch(() => undefined),
    prisma.otpChallenge
      .deleteMany({
        where: {
          expiresAt: { lt: new Date(now - OTP_CONSUMED_TTL_MS) },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: nowDate } }],
        },
      })
      .catch(() => undefined),
  ]);
}

export function getClientIpKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);

  return "local";
}

export function hashTokenKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function checkRateLimitInMemory(
  key: string,
  maxAttempts: number,
  windowMs: number
): { limited: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  pruneDevStores(now, windowMs);

  const timestamps = (devFallbackRateWindowStore.get(key) || []).filter(
    (ts) => now - ts < windowMs
  );
  if (timestamps.length >= maxAttempts) {
    devFallbackRateWindowStore.set(key, timestamps);
    const oldest = timestamps[0] ?? now;
    return {
      limited: true,
      remaining: 0,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
    };
  }

  timestamps.push(now);
  devFallbackRateWindowStore.set(key, timestamps);
  return {
    limited: false,
    remaining: Math.max(0, maxAttempts - timestamps.length),
    retryAfterMs: 0,
  };
}

/**
 * Shared rate limiter berbasis tabel database RateLimitEntry agar lockout berlaku
 * konsisten antar-instance serverless. Fallback ke in-memory hanya pada development lokal.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  options?: { forceEnforce?: boolean }
): Promise<{ limited: boolean; remaining: number; retryAfterMs: number }> {
  const rateLimitDisabled = process.env.RATE_LIMIT_ENABLED === "false";
  if (rateLimitDisabled && !options?.forceEnforce) {
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }

  const now = Date.now();
  const nowDate = new Date(now);
  const nextResetAt = new Date(now + windowMs);

  try {
    void maybeCleanupExpiredDbRows(nowDate);

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitEntry.findUnique({
        where: { key },
      });

      if (!existing || existing.resetAt.getTime() <= now) {
        await tx.rateLimitEntry.upsert({
          where: { key },
          update: { count: 1, resetAt: nextResetAt },
          create: { key, count: 1, resetAt: nextResetAt },
        });
        return {
          limited: false,
          remaining: Math.max(0, maxAttempts - 1),
          retryAfterMs: 0,
        };
      }

      if (existing.count >= maxAttempts) {
        return {
          limited: true,
          remaining: 0,
          retryAfterMs: Math.max(0, existing.resetAt.getTime() - now),
        };
      }

      const updated = await tx.rateLimitEntry.update({
        where: { key },
        data: { count: { increment: 1 } },
        select: { count: true },
      });

      return {
        limited: false,
        remaining: Math.max(0, maxAttempts - updated.count),
        retryAfterMs: 0,
      };
    });
  } catch (err) {
    if (isLocalDevFallbackAllowed()) {
      return checkRateLimitInMemory(key, maxAttempts, windowMs);
    }
    throw err;
  }
}

/**
 * Mendaftarkan tantangan OTP baru pada penyimpanan bersama OtpChallenge.
 * Hanya menyimpan hash kode (SHA-256), batas percobaan, dan masa berlaku.
 */
export async function createOtpChallenge(params: {
  token: string;
  codeHash: string;
  purpose?: string;
  userId?: string;
  ttlMs?: number;
  maxAttempts?: number;
}): Promise<void> {
  const now = Date.now();
  const tokenHash = hashTokenKey(params.token);
  const ttlMs = params.ttlMs ?? OTP_DEFAULT_TTL_MS;
  const maxAttempts = params.maxAttempts ?? 5;
  const expiresAt = new Date(now + ttlMs);

  try {
    await prisma.otpChallenge.upsert({
      where: { tokenHash },
      update: {
        codeHash: params.codeHash,
        purpose: params.purpose ?? "email-change",
        userId: params.userId ?? null,
        attempts: 0,
        maxAttempts,
        expiresAt,
        lockedUntil: null,
        consumedAt: null,
      },
      create: {
        tokenHash,
        codeHash: params.codeHash,
        purpose: params.purpose ?? "email-change",
        userId: params.userId ?? null,
        attempts: 0,
        maxAttempts,
        expiresAt,
      },
    });
  } catch (err) {
    if (isLocalDevFallbackAllowed()) {
      devFallbackOtpStore.set(tokenHash, {
        codeHash: params.codeHash,
        attempts: 0,
        maxAttempts,
        expiresAt: expiresAt.getTime(),
        lockedUntil: null,
        consumedAt: null,
      });
      return;
    }
    throw err;
  }
}

export async function isOtpTokenBlocked(token: string): Promise<{
  blocked: boolean;
  reason?: "USED" | "LOCKED" | "EXPIRED";
  codeHash?: string | null;
}> {
  const now = Date.now();
  const key = hashTokenKey(token);

  try {
    const row = await prisma.otpChallenge.findUnique({
      where: { tokenHash: key },
      select: {
        codeHash: true,
        attempts: true,
        maxAttempts: true,
        expiresAt: true,
        lockedUntil: true,
        consumedAt: true,
      },
    });

    if (!row) {
      return { blocked: false };
    }

    if (row.consumedAt) {
      return { blocked: true, reason: "USED" };
    }

    if (row.lockedUntil && now < row.lockedUntil.getTime()) {
      return { blocked: true, reason: "LOCKED" };
    }

    if (row.attempts >= row.maxAttempts) {
      return { blocked: true, reason: "LOCKED" };
    }

    if (now >= row.expiresAt.getTime()) {
      return { blocked: true, reason: "EXPIRED" };
    }

    return { blocked: false, codeHash: row.codeHash };
  } catch (err) {
    if (isLocalDevFallbackAllowed()) {
      const entry = devFallbackOtpStore.get(key);
      if (!entry) return { blocked: false };
      if (entry.consumedAt) return { blocked: true, reason: "USED" };
      if (entry.lockedUntil && now < entry.lockedUntil) return { blocked: true, reason: "LOCKED" };
      if (now >= entry.expiresAt) return { blocked: true, reason: "EXPIRED" };
      return { blocked: false, codeHash: entry.codeHash };
    }
    throw err;
  }
}

export async function recordOtpFailedAttempt(
  token: string,
  maxAttempts = 5
): Promise<{ locked: boolean; attempts: number }> {
  const now = Date.now();
  const key = hashTokenKey(token);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.otpChallenge.findUnique({
        where: { tokenHash: key },
        select: { attempts: true, maxAttempts: true },
      });

      const limit = existing?.maxAttempts ?? maxAttempts;
      const nextAttempts = (existing?.attempts ?? 0) + 1;
      const locked = nextAttempts >= limit;
      const lockedUntil = locked ? new Date(now + OTP_LOCKOUT_MS) : null;

      await tx.otpChallenge.upsert({
        where: { tokenHash: key },
        update: {
          attempts: nextAttempts,
          ...(lockedUntil ? { lockedUntil } : {}),
        },
        create: {
          tokenHash: key,
          attempts: nextAttempts,
          maxAttempts: limit,
          expiresAt: new Date(now + OTP_DEFAULT_TTL_MS),
          lockedUntil,
        },
      });

      return { locked, attempts: nextAttempts };
    });
  } catch (err) {
    if (isLocalDevFallbackAllowed()) {
      const existing = devFallbackOtpStore.get(key);
      const limit = existing?.maxAttempts ?? maxAttempts;
      const nextAttempts = (existing?.attempts ?? 0) + 1;
      const locked = nextAttempts >= limit;
      devFallbackOtpStore.set(key, {
        codeHash: existing?.codeHash ?? null,
        attempts: nextAttempts,
        maxAttempts: limit,
        expiresAt: existing?.expiresAt ?? now + OTP_DEFAULT_TTL_MS,
        lockedUntil: locked ? now + OTP_LOCKOUT_MS : existing?.lockedUntil ?? null,
        consumedAt: existing?.consumedAt ?? null,
      });
      return { locked, attempts: nextAttempts };
    }
    throw err;
  }
}

/**
 * Menandai token OTP telah terpakai (sekali pakai) secara atomik di penyimpanan bersama.
 * Mengembalikan `false` jika token sudah lebih dulu dikonsumsi request lain (anti-replay).
 */
export async function markOtpTokenConsumed(token: string): Promise<boolean> {
  const now = Date.now();
  const nowDate = new Date(now);
  const key = hashTokenKey(token);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.otpChallenge.findUnique({
        where: { tokenHash: key },
        select: { consumedAt: true },
      });
      if (existing?.consumedAt) {
        return false;
      }
      if (existing) {
        const updated = await tx.otpChallenge.updateMany({
          where: { tokenHash: key, consumedAt: null },
          data: { consumedAt: nowDate },
        });
        return updated.count === 1;
      }
      await tx.otpChallenge.create({
        data: {
          tokenHash: key,
          attempts: 0,
          maxAttempts: 5,
          expiresAt: new Date(now + OTP_CONSUMED_TTL_MS),
          consumedAt: nowDate,
        },
      });
      return true;
    });
  } catch (err) {
    if (isLocalDevFallbackAllowed()) {
      const existing = devFallbackOtpStore.get(key);
      if (existing?.consumedAt) return false;
      devFallbackOtpStore.set(key, {
        codeHash: existing?.codeHash ?? null,
        attempts: existing?.attempts ?? 0,
        maxAttempts: existing?.maxAttempts ?? 5,
        expiresAt: existing?.expiresAt ?? now + OTP_CONSUMED_TTL_MS,
        lockedUntil: null,
        consumedAt: now,
      });
      return true;
    }
    throw err;
  }
}
