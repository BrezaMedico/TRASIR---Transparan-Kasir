export const PAPER_DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;
export const COIN_DENOMINATIONS = [500, 200, 100] as const;
export const RUPIAH_DENOMINATIONS = [...PAPER_DENOMINATIONS, ...COIN_DENOMINATIONS] as const;

export const SHIFT_TOLERANCE_RUPIAH = 5000;

export type DenominationMap = Record<string, number>;

export interface OperationalExpenseItem {
  description: string;
  amount: number;
}

export type HandoverSyncStatus = "SHIFT_PERTAMA" | "SINKRON" | "TIDAK_SINKRON";
export type ShiftAuditStatus =
  | "SESUAI"
  | "DALAM_TOLERANSI"
  | "PERLU_DIPERIKSA"
  | "TERCATAT"
  | "AKTIF";

export interface ShiftEnvelope {
  version: 2;
  counterId?: string;
  counterName?: string;
  openedAt: string;
  closedAt?: string | null;
  openingCashTotal: number;
  openingDenominations: DenominationMap;
  openingNote: string | null;
  previousShiftId: string | null;
  previousShiftClosingCash: number | null;
  handoverSyncStatus: HandoverSyncStatus;
  handoverDifference: number;
  closingDenominations?: DenominationMap;
  operationalExpenses?: OperationalExpenseItem[];
  operationalExpenseTotal?: number;
  closingNote?: string | null;
  expectedCashAtClose?: number;
  closingCashDifference?: number;
}

export interface ActiveShiftSummary {
  id: string;
  counterId: string;
  counterName: string;
  cashierId: string;
  cashierName: string;
  cashierRole: string;
  openedAt: string;
  openingCashTotal: number;
  openingDenominations: DenominationMap;
  openingNote: string | null;
  handoverSyncStatus: HandoverSyncStatus;
  status: "AKTIF";
}

export function createEmptyDenominations(): DenominationMap {
  const map: DenominationMap = {};
  for (const denom of RUPIAH_DENOMINATIONS) {
    map[String(denom)] = 0;
  }
  return map;
}

export function normalizeDenominations(raw: unknown): DenominationMap {
  const normalized = createEmptyDenominations();
  if (!raw || typeof raw !== "object") {
    return normalized;
  }
  const source = raw as Record<string, unknown>;
  for (const denom of RUPIAH_DENOMINATIONS) {
    const key = String(denom);
    const val = Number(source[key]);
    if (Number.isFinite(val) && val > 0) {
      normalized[key] = Math.min(Math.floor(val), 100000);
    }
  }
  return normalized;
}

export function computeDenominationTotal(denominations: DenominationMap): number {
  let total = 0;
  for (const denom of RUPIAH_DENOMINATIONS) {
    const count = Number(denominations[String(denom)] ?? 0);
    if (Number.isFinite(count) && count > 0) {
      total += denom * Math.floor(count);
    }
  }
  return total;
}

export function normalizeOperationalExpenses(raw: unknown): OperationalExpenseItem[] {
  if (!Array.isArray(raw)) return [];
  const items: OperationalExpenseItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as { description?: unknown; amount?: unknown };
    const description =
      typeof obj.description === "string" ? obj.description.trim().slice(0, 150) : "";
    const amount = Number(obj.amount);
    if (!description && (!Number.isFinite(amount) || amount <= 0)) continue;
    items.push({
      description: description || "Biaya Operasional",
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
    });
  }
  return items;
}

export function computeOperationalExpenseTotal(items: OperationalExpenseItem[]): number {
  return items.reduce((sum, item) => sum + (item.amount > 0 ? Math.round(item.amount) : 0), 0);
}

export function parseShiftEnvelope(notes: string | null | undefined): ShiftEnvelope | null {
  if (!notes || typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<ShiftEnvelope>;
    if (parsed && parsed.version === 2 && typeof parsed.openedAt === "string") {
      return {
        version: 2,
        counterId:
          typeof parsed.counterId === "string" && parsed.counterId.trim().length > 0
            ? parsed.counterId.trim()
            : undefined,
        counterName:
          typeof parsed.counterName === "string" && parsed.counterName.trim().length > 0
            ? parsed.counterName.trim()
            : undefined,
        openedAt: parsed.openedAt,
        closedAt: parsed.closedAt ?? null,
        openingCashTotal: Number(parsed.openingCashTotal) || 0,
        openingDenominations: normalizeDenominations(parsed.openingDenominations),
        openingNote: parsed.openingNote ?? null,
        previousShiftId: parsed.previousShiftId ?? null,
        previousShiftClosingCash:
          typeof parsed.previousShiftClosingCash === "number"
            ? parsed.previousShiftClosingCash
            : null,
        handoverSyncStatus:
          parsed.handoverSyncStatus === "SINKRON" ||
          parsed.handoverSyncStatus === "TIDAK_SINKRON" ||
          parsed.handoverSyncStatus === "SHIFT_PERTAMA"
            ? parsed.handoverSyncStatus
            : "SHIFT_PERTAMA",
        handoverDifference: Number(parsed.handoverDifference) || 0,
        closingDenominations: parsed.closingDenominations
          ? normalizeDenominations(parsed.closingDenominations)
          : undefined,
        operationalExpenses: Array.isArray(parsed.operationalExpenses)
          ? normalizeOperationalExpenses(parsed.operationalExpenses)
          : undefined,
        operationalExpenseTotal:
          typeof parsed.operationalExpenseTotal === "number"
            ? parsed.operationalExpenseTotal
            : undefined,
        closingNote: parsed.closingNote ?? null,
        expectedCashAtClose:
          typeof parsed.expectedCashAtClose === "number"
            ? parsed.expectedCashAtClose
            : undefined,
        closingCashDifference:
          typeof parsed.closingCashDifference === "number"
            ? parsed.closingCashDifference
            : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeShiftEnvelope(envelope: ShiftEnvelope): string {
  return JSON.stringify(envelope);
}

export function evaluateHandoverSync(
  openingCashTotal: number,
  previousClosingCash: number | null | undefined
): {
  handoverSyncStatus: HandoverSyncStatus;
  handoverDifference: number;
} {
  if (previousClosingCash === null || previousClosingCash === undefined) {
    return {
      handoverSyncStatus: "SHIFT_PERTAMA",
      handoverDifference: 0,
    };
  }
  const diff = Math.round(openingCashTotal - previousClosingCash);
  return {
    handoverSyncStatus: diff === 0 ? "SINKRON" : "TIDAK_SINKRON",
    handoverDifference: diff,
  };
}

export function evaluateShiftAudit(params: {
  openingCashTotal: number;
  systemCashTotal: number;
  actualCashTotal: number;
  operationalExpenseTotal: number;
  tolerance?: number;
}): {
  expectedCashAtClose: number;
  cashDifference: number;
  absDiff: number;
  status: "SESUAI" | "DALAM_TOLERANSI" | "PERLU_DIPERIKSA";
} {
  const tolerance = params.tolerance ?? SHIFT_TOLERANCE_RUPIAH;
  const expectedCashAtClose = Math.round(
    params.openingCashTotal + params.systemCashTotal - params.operationalExpenseTotal
  );
  const cashDifference = Math.round(params.actualCashTotal - expectedCashAtClose);
  const absDiff = Math.abs(cashDifference);

  const status =
    absDiff === 0 ? "SESUAI" : absDiff <= tolerance ? "DALAM_TOLERANSI" : "PERLU_DIPERIKSA";

  return {
    expectedCashAtClose,
    cashDifference,
    absDiff,
    status,
  };
}

