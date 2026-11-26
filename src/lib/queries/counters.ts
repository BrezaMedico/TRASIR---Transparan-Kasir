import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CounterConfig,
  CounterLiveStatus,
  DEFAULT_COUNTER_ID,
  DEFAULT_COUNTER_NAME,
  parseStoredCounters,
} from "@/lib/counters";

export function roomCountersSettingId(roomId: string): string {
  return `room_counters:${roomId}`;
}

export interface RoomCounterRecord extends CounterConfig {
  dbId: string;
}

/**
 * Mengambil seluruh loket aktif dari model `Counter` sungguhan.
 * Jika ruangan belum memiliki baris di `Counter`, otomatis menyalin dari `SystemSetting`
 * lama (jika ada) atau membuat loket default "Loket 1" secara idempoten.
 */
export async function getRoomCounterRecords(
  roomId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<RoomCounterRecord[]> {
  let rows = await tx.counter.findMany({
    where: { roomId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, createdAt: true },
  });

  if (rows.length === 0) {
    // Fallback baca migrasi malas dari SystemSetting lama (kompatibilitas data sebelum backfill)
    const legacySetting = await tx.systemSetting.findUnique({
      where: { id: roomCountersSettingId(roomId) },
      select: { openAreaPolicy: true },
    });
    const seedList = parseStoredCounters(legacySetting?.openAreaPolicy);

    for (const item of seedList) {
      await tx.counter
        .upsert({
          where: { roomId_slug: { roomId, slug: item.id } },
          update: { name: item.name, isActive: true },
          create: {
            roomId,
            slug: item.id || DEFAULT_COUNTER_ID,
            name: item.name || DEFAULT_COUNTER_NAME,
            isActive: true,
          },
        })
        .catch(() => undefined);
    }

    rows = await tx.counter.findMany({
      where: { roomId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, createdAt: true },
    });
  }

  return rows.map((row) => ({
    dbId: row.id,
    id: row.slug,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getRoomCounters(
  roomId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterConfig[]> {
  const records = await getRoomCounterRecords(roomId, tx);
  return records.map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

export async function saveRoomCounters(
  roomId: string,
  counters: CounterConfig[],
  _roomName?: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterConfig[]> {
  const targetSlugs = counters.map((c) => c.id);

  for (const c of counters) {
    await tx.counter.upsert({
      where: { roomId_slug: { roomId, slug: c.id } },
      update: { name: c.name, isActive: true },
      create: {
        roomId,
        slug: c.id,
        name: c.name,
        isActive: true,
      },
    });
  }

  // Soft-deactivate loket yang dihapus dari daftar aktif (menjaga relasi FK historis pada Shift/Sale)
  if (targetSlugs.length > 0) {
    await tx.counter.updateMany({
      where: {
        roomId,
        slug: { notIn: targetSlugs },
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  return counters;
}

export async function getRoomCountersWithLiveStatus(
  roomId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CounterLiveStatus[]> {
  const [counters, activeShifts] = await Promise.all([
    getRoomCounterRecords(roomId, tx),
    tx.shift.findMany({
      where: { roomId, status: "AKTIF" },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        counterId: true,
        counterSlug: true,
        openedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const defaultCounterSlug = counters[0]?.id || DEFAULT_COUNTER_ID;
  const slugByDbId = new Map(counters.map((c) => [c.dbId, c.id]));

  const occupantByCounterSlug = new Map<
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
    const resolvedSlug =
      (row.counterId && slugByDbId.get(row.counterId)) ||
      row.counterSlug ||
      defaultCounterSlug;
    if (!occupantByCounterSlug.has(resolvedSlug)) {
      occupantByCounterSlug.set(resolvedSlug, {
        shiftId: row.id,
        userId: row.user.id,
        userName: row.user.name,
        userRole: row.user.role,
        openedAt: row.openedAt.toISOString(),
      });
    }
  }

  return counters.map(({ id, name, createdAt }) => {
    const occupant = occupantByCounterSlug.get(id) ?? null;
    return {
      id,
      name,
      createdAt,
      isOccupied: Boolean(occupant),
      occupiedBy: occupant,
    };
  });
}
