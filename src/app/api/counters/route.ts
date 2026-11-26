import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import {
  MAX_COUNTERS_PER_ROOM,
  slugifyCounterId,
} from "@/lib/counters";
import {
  getRoomCounters,
  getRoomCountersWithLiveStatus,
  saveRoomCounters,
} from "@/lib/queries/counters";
import { z } from "zod";

const createCounterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama loket minimal 2 karakter")
    .max(40, "Nama loket maksimal 40 karakter"),
});

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView =
      isStoreAdmin(user.role) ||
      (await checkUserPermission(user.role, "kasir", "view")) ||
      (await checkUserPermission(user.role, "penjualan", "view"));
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin melihat daftar loket." },
        { status: 403 }
      );
    }

    const counters = await getRoomCountersWithLiveStatus(user.roomId);
    return NextResponse.json({ counters });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar loket.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat menambah loket." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createCounterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Nama loket tidak valid." },
        { status: 400 }
      );
    }

    const counterName = parsed.data.name.trim();
    const result = await prisma.$transaction(async (tx) => {
      const [currentCounters, room] = await Promise.all([
        getRoomCounters(user.roomId, tx),
        tx.room.findUnique({ where: { id: user.roomId }, select: { name: true } }),
      ]);

      if (currentCounters.length >= MAX_COUNTERS_PER_ROOM) {
        throw new Error(`LIMIT:Maksimal ${MAX_COUNTERS_PER_ROOM} loket per perusahaan.`);
      }

      if (
        currentCounters.some((c) => c.name.trim().toLowerCase() === counterName.toLowerCase())
      ) {
        throw new Error("DUP:Nama loket sudah terdaftar. Gunakan nama lain.");
      }

      const existingIds = new Set(currentCounters.map((c) => c.id));
      const newCounter = {
        id: slugifyCounterId(counterName, existingIds),
        name: counterName,
        createdAt: new Date().toISOString(),
      };
      const updatedList = [...currentCounters, newCounter];

      await saveRoomCounters(user.roomId, updatedList, room?.name, tx);

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENGATURAN",
          actionSummary: `Menambahkan loket kasir baru "${newCounter.name}"`,
          entityType: "Counter",
          entityId: newCounter.id,
          afterData: newCounter,
          approvalState: "DISETUJUI",
          linkUrl: "/pengaturan?tab=loket",
        },
        tx
      );

      return newCounter;
    });

    const counters = await getRoomCountersWithLiveStatus(user.roomId);
    return NextResponse.json({ counter: result, counters }, { status: 201 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gagal menambah loket.";
    if (raw.startsWith("LIMIT:") || raw.startsWith("DUP:")) {
      return NextResponse.json({ error: raw.slice(raw.indexOf(":") + 1) }, { status: 400 });
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat menghapus loket." },
        { status: 403 }
      );
    }

    let counterId = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!counterId) {
      try {
        const body = await request.json();
        if (body && typeof body.counterId === "string") {
          counterId = body.counterId.trim();
        }
      } catch {
        // Query param tidak tersedia dan body kosong
      }
    }

    if (!counterId) {
      return NextResponse.json({ error: "Pilih loket yang ingin dihapus." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const [liveCounters, room] = await Promise.all([
        getRoomCountersWithLiveStatus(user.roomId, tx),
        tx.room.findUnique({ where: { id: user.roomId }, select: { name: true } }),
      ]);

      const target = liveCounters.find((c) => c.id === counterId);
      if (!target) {
        throw new Error("NOT_FOUND:Loket tidak ditemukan.");
      }

      if (liveCounters.length <= 1) {
        throw new Error("MIN:Minimal harus ada 1 loket aktif di perusahaan.");
      }

      if (target.isOccupied && target.occupiedBy) {
        throw new Error(
          `OCCUPIED:${target.name} sedang digunakan oleh ${target.occupiedBy.userName}. Tunggu hingga shift ditutup sebelum menghapus.`
        );
      }

      const nextList = liveCounters
        .filter((c) => c.id !== counterId)
        .map(({ id, name, createdAt }) => ({ id, name, createdAt }));

      await saveRoomCounters(user.roomId, nextList, room?.name, tx);

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENGATURAN",
          actionSummary: `Menghapus loket kasir "${target.name}"`,
          entityType: "Counter",
          entityId: target.id,
          beforeData: { id: target.id, name: target.name },
          approvalState: "DISETUJUI",
          linkUrl: "/pengaturan?tab=loket",
        },
        tx
      );
    });

    const counters = await getRoomCountersWithLiveStatus(user.roomId);
    return NextResponse.json({ counters });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gagal menghapus loket.";
    if (raw.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: raw.slice(10) }, { status: 404 });
    }
    if (raw.startsWith("OCCUPIED:")) {
      return NextResponse.json({ error: raw.slice(9) }, { status: 409 });
    }
    if (raw.startsWith("MIN:")) {
      return NextResponse.json({ error: raw.slice(4) }, { status: 400 });
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}

