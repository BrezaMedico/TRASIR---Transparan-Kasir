import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveRuntimeDatabaseUrl(): string | undefined {
  if (process.env.PRISMA_DISABLE_POOLER_REWRITE === "true") {
    return undefined;
  }
  const raw = process.env.DATABASE_URL;
  if (!raw || !raw.includes(".pooler.supabase.com")) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    parsed.port = "6543";
    parsed.searchParams.set("pgbouncer", "true");
    parsed.searchParams.set("sslmode", "require");
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    parsed.searchParams.set("connection_limit", "5");
    parsed.searchParams.set("pool_timeout", "25");
    return parsed.toString();
  } catch {
    return raw;
  }
}

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: {
      maxWait: 20000,
      timeout: 30000,
    },
  });

globalForPrisma.prisma = prisma;

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : "";
  const msg = typeof err.message === "string" ? err.message : "";
  return (
    code === "P1017" ||
    code === "P1001" ||
    code === "P2024" ||
    msg.includes("EMAXCONNSESSION") ||
    msg.includes("max clients reached") ||
    msg.includes("too many clients") ||
    msg.includes("remaining connection slots") ||
    msg.includes("ConnectionReset") ||
    msg.includes("Server has closed the connection") ||
    msg.includes("Timed out fetching a new connection") ||
    msg.includes("Can't reach database server") ||
    msg.includes("forcibly closed by the remote host")
  );
}

/**
 * Menjalankan query read/idempotent dengan retry otomatis
 * apabila koneksi pooler PgBouncer terputus sesaat atau mengalami lonjakan antrean koneksi.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientDbError(error)) {
        throw error;
      }
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
}

