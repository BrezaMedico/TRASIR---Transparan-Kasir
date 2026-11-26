import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COUNTER_ID,
  DEFAULT_COUNTER_NAME,
} from "@/lib/counters";
import {
  ActiveShiftSummary,
  createEmptyDenominations,
  parseShiftEnvelope,
} from "@/lib/shift-session";

export async function getActiveShiftForUser(
  roomId: string,
  userId: string
): Promise<ActiveShiftSummary | null> {
  const row = await prisma.shiftClosing.findFirst({
    where: {
      roomId,
      cashierId: userId,
      status: "AKTIF",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      cashierId: true,
      shiftDate: true,
      actualCashTotal: true,
      notes: true,
      cashier: {
        select: {
          name: true,
          role: true,
        },
      },
    },
  });

  if (!row) return null;

  const envelope = parseShiftEnvelope(row.notes);
  return {
    id: row.id,
    counterId: envelope?.counterId || DEFAULT_COUNTER_ID,
    counterName: envelope?.counterName || DEFAULT_COUNTER_NAME,
    cashierId: row.cashierId,
    cashierName: row.cashier.name,
    cashierRole: row.cashier.role,
    openedAt: envelope?.openedAt ?? row.shiftDate.toISOString(),
    openingCashTotal: envelope?.openingCashTotal ?? row.actualCashTotal,
    openingDenominations: envelope?.openingDenominations ?? createEmptyDenominations(),
    openingNote: envelope?.openingNote ?? null,
    handoverSyncStatus: envelope?.handoverSyncStatus ?? "SHIFT_PERTAMA",
    status: "AKTIF",
  };
}

