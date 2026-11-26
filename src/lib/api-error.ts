import crypto from "node:crypto";
import { NextResponse } from "next/server";

export class AppError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

const PREFIXED_DOMAIN_ERRORS: { prefix: string; status: number }[] = [
  { prefix: "CONFLICT:", status: 409 },
  { prefix: "FORBIDDEN:", status: 403 },
  { prefix: "NOT_FOUND:", status: 404 },
  { prefix: "BAD_REQUEST:", status: 400 },
];

/**
 * Error handler terpusat untuk seluruh API Route Handlers.
 * - Error domain terkontrol (AppError / prefix eksplisit) dikembalikan dengan status bisnis yang tepat.
 * - Error tak terduga (Prisma, jaringan, runtime) TIDAK PERNAH mengirim err.message mentah ke klien;
 *   hanya pesan generik + errorId yang dikembalikan, sementara detail lengkap dicatat di log server.
 */
export function handleApiError(
  err: unknown,
  context: string,
  fallbackMessage = "Terjadi kesalahan internal pada server. Silakan coba lagi."
): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
      { status: err.status }
    );
  }

  if (err instanceof Error) {
    if (err.message === "SHIFT_REQUIRED") {
      return NextResponse.json(
        {
          error: "Buka shift kasir terlebih dahulu sebelum mencatat transaksi penjualan.",
          code: "NO_ACTIVE_SHIFT",
        },
        { status: 403 }
      );
    }

    for (const entry of PREFIXED_DOMAIN_ERRORS) {
      if (err.message.startsWith(entry.prefix)) {
        return NextResponse.json(
          { error: err.message.slice(entry.prefix.length).trim() },
          { status: entry.status }
        );
      }
    }
  }

  const errorId = crypto.randomUUID().slice(0, 12);
  const prismaCode =
    err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;

  console.error("[API_ERROR]", {
    errorId,
    context,
    prismaCode,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return NextResponse.json(
    {
      error: `${fallbackMessage} (Ref: ${errorId})`,
      errorId,
    },
    { status: 500 }
  );
}

