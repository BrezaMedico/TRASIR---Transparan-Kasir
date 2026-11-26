import { prisma } from "@/lib/prisma";
import { DEFAULT_COUNTER_ID, DEFAULT_COUNTER_NAME } from "@/lib/counters";
import {
  ActiveShiftSummary,
  createEmptyDenominations,
  HandoverSyncStatus,
  normalizeDenominations,
} from "@/lib/shift-session";

function parseDenominationsJson(raw: string | null | undefined) {
  if (!raw) return createEmptyDenominations();
  try {
    return normalizeDenominations(JSON.parse(raw));
  } catch {
    return createEmptyDenominations();
  }
}

export async function getActiveShiftForUser(
  roomId: string,
  userId: string
): Promise<ActiveShiftSummary | null> {
  const row = await prisma.shift.findFirst({
    where: {
      roomId,
      userId,
      status: "AKTIF",
    },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      userId: true,
      counterSlug: true,
      counterName: true,
      openedAt: true,
      openingCashTotal: true,
      openingDenominationsJson: true,
      openingNote: true,
      handoverSyncStatus: true,
      counter: {
        select: { slug: true, name: true },
      },
      user: {
        select: {
          name: true,
          role: true,
        },
      },
    },
  });

  if (!row) return null;

  const syncStatus: HandoverSyncStatus =
    row.handoverSyncStatus === "SINKRON" ||
    row.handoverSyncStatus === "TIDAK_SINKRON" ||
    row.handoverSyncStatus === "SHIFT_PERTAMA"
      ? row.handoverSyncStatus
      : "SHIFT_PERTAMA";

  return {
    id: row.id,
    counterId: row.counter?.slug || row.counterSlug || DEFAULT_COUNTER_ID,
    counterName: row.counter?.name || row.counterName || DEFAULT_COUNTER_NAME,
    cashierId: row.userId,
    cashierName: row.user.name,
    cashierRole: row.user.role,
    openedAt: row.openedAt.toISOString(),
    openingCashTotal: row.openingCashTotal,
    openingDenominations: parseDenominationsJson(row.openingDenominationsJson),
    openingNote: row.openingNote ?? null,
    handoverSyncStatus: syncStatus,
    status: "AKTIF",
  };
}
