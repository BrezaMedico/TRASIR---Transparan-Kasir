export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export interface CursorPayload {
  createdAt: Date;
  id: string;
}

export function parseLimitParam(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_PAGE_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(parsed, MAX_PAGE_LIMIT);
}

export function encodeCursor(item: { createdAt: Date | string; id: string }): string {
  const iso =
    item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : new Date(item.createdAt).toISOString();
  return Buffer.from(JSON.stringify({ c: iso, i: item.id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw || !raw.trim()) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(raw.trim(), "base64url").toString("utf8")
    ) as { c?: unknown; i?: unknown };
    if (typeof decoded.c !== "string" || typeof decoded.i !== "string" || !decoded.i.trim()) {
      return null;
    }
    const createdAt = new Date(decoded.c);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return { createdAt, id: decoded.i };
  } catch {
    return null;
  }
}

/**
 * Kondisi WHERE keyset untuk urutan `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`.
 * Menjamin halaman berikutnya tidak menduplikasi maupun melewatkan baris walau timestamp identik.
 */
export function buildDescCursorWhere(cursor: CursorPayload) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }],
      },
    ],
  };
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseJakartaDateRange(searchParams: URLSearchParams): {
  range?: { gte?: Date; lte?: Date };
  error?: string;
} {
  const singleDate = searchParams.get("date")?.trim();
  const fromParam = (searchParams.get("from") || searchParams.get("startDate"))?.trim();
  const toParam = (searchParams.get("to") || searchParams.get("endDate"))?.trim();

  if (singleDate) {
    if (!DATE_ONLY_REGEX.test(singleDate)) {
      return { error: "Format parameter date harus YYYY-MM-DD." };
    }
    const gte = new Date(`${singleDate}T00:00:00+07:00`);
    const lte = new Date(`${singleDate}T23:59:59.999+07:00`);
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) {
      return { error: "Tanggal filter tidak valid." };
    }
    return { range: { gte, lte } };
  }

  if (!fromParam && !toParam) {
    return {};
  }

  let gte: Date | undefined;
  let lte: Date | undefined;

  if (fromParam) {
    if (!DATE_ONLY_REGEX.test(fromParam)) {
      return { error: "Format parameter from harus YYYY-MM-DD." };
    }
    gte = new Date(`${fromParam}T00:00:00+07:00`);
    if (Number.isNaN(gte.getTime())) {
      return { error: "Tanggal mulai (from) tidak valid." };
    }
  }

  if (toParam) {
    if (!DATE_ONLY_REGEX.test(toParam)) {
      return { error: "Format parameter to harus YYYY-MM-DD." };
    }
    lte = new Date(`${toParam}T23:59:59.999+07:00`);
    if (Number.isNaN(lte.getTime())) {
      return { error: "Tanggal akhir (to) tidak valid." };
    }
  }

  if (gte && lte && gte > lte) {
    return { error: "Tanggal mulai (from) tidak boleh melebihi tanggal akhir (to)." };
  }

  return { range: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

