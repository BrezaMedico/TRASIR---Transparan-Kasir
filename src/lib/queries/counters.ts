import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CounterConfig,
  CounterLiveStatus,
  DEFAULT_COUNTER_ID,
  parseStoredCounters,
} from "@/lib/counters";
import { parseShiftEnvelope } from "@/lib/shift-session";

export function roomCountersSettingId(roomId: string): string {
  return `room_counters:${roomId}`;
}

export async function getRoomCounters(
  roomId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterConfig[]> {
  const setting = await tx.systemSetting.findUnique({
    where: { id: roomCountersSettingId(roomId) },
    select: { openAreaPolicy: true },
  });
  return parseStoredCounters(setting?.openAreaPolicy);
}

export async function saveRoomCounters(
  roomId: string,
  counters: CounterConfig[],
  roomName?: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterConfig[]> {
  const payload = JSON.stringify(counters);
  await tx.systemSetting.upsert({
    where: { id: roomCountersSettingId(roomId) },
    update: {
      ...(roomName ? { storeName: roomName } : {}),
      openAreaPolicy: payload,
    },
    create: {
      id: roomCountersSettingId(roomId),
      storeName: roomName || "TRASIR Toko Utama",
      storeAddress: "Indonesia",
      openAreaPolicy: payload,
    },
  });
  return counters;
}

export async function getRoomCountersWithLiveStatus(
  roomId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterLiveStatus[]> {
  const [counters, activeShifts] = await Promise.all([
    getRoomCounters(roomId, tx),
    tx.shiftClosing.findMany({
      where: { roomId, status: "AKTIF" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        cashierId: true,
        shiftDate: true,
        notes: true,
        cashier: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const defaultCounterId = counters[0]?.id || DEFAULT_COUNTER_ID;
  const occupantByCounterId = new Map<
    string,
    {
      shiftId: string;
      userId: string;
      userName: string;
      userRole: string;
      openedAt: string;
    }
  >();

  for (const row of activeShifts) {
    const env = parseShiftEnvelope(row.notes);
    const assignedCounterId = env?.counterId || defaultCounterId;
    if (!occupantByCounterId.has(assignedCounterId)) {
      occupantByCounterId.set(assignedCounterId, {
        shiftId: row.id,
        userId: row.cashier.id,
        userName: row.cashier.name,
        userRole: row.cashier.role,
        openedAt: env?.openedAt ?? row.shiftDate.toISOString(),
      });
    }
  }

  return counters.map((counter) => {
    const occupant = occupantByCounterId.get(counter.id) ?? null;
    return {
      ...counter,
      isOccupied: Boolean(occupant),
      occupiedBy: occupant,
    };
  });
}

