import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, getCurrentSessionUser } from "@/lib/auth";
import {
  ensureSystemBaseline,
  getRolePermissionsMap,
  seedRoomDefaults,
  UserRole,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { buildInitialCounters } from "@/lib/counters";
import { saveRoomCounters } from "@/lib/queries/counters";
import { z } from "zod";

const createRoomSchema = z.object({
  roomName: z.string().trim().min(2, "Nama ruangan minimal 2 karakter").max(120),
  roomAddress: z.string().trim().max(250).optional().or(z.literal("")),
  counterNames: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  counterCount: z.number().int().min(1).max(10).optional(),
});

/**
 * Memungkinkan akun yang sudah terdaftar namun belum tergabung ke ruangan
 * untuk membuat ruangan baru dan otomatis menjadi Pemilik ruangan tersebut.
 */
export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.isAssigned && user.roomId) {
      return NextResponse.json(
        { error: "Akun Anda sudah tergabung dalam sebuah ruangan aktif." },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data ruangan tidak valid." },
        { status: 400 }
      );
    }

    const initialCounters = buildInitialCounters({
      counterNames: parsed.data.counterNames,
      counterCount: parsed.data.counterCount,
    });

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          name: parsed.data.roomName.trim(),
          address: parsed.data.roomAddress?.trim() || "Indonesia",
          toleranceThresholdRp: 50000,
          opnameSchedule: "MINGGUAN",
        },
      });
      await seedRoomDefaults(tx, room.id);
      await saveRoomCounters(room.id, initialCounters, room.name, tx);

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          role: "PEMILIK",
          isAssigned: true,
          roomId: room.id,
        },
      });

      await recordAuditLog(
        {
          roomId: room.id,
          actorId: updatedUser.id,
          actorName: updatedUser.name,
          actorRole: "PEMILIK",
          actionType: "ROOM_CREATED",
          actionSummary: `${updatedUser.name} membuat ruangan baru "${room.name}" dengan ${initialCounters.length} loket sebagai PEMILIK`,
          entityType: "Room",
          entityId: room.id,
          afterData: {
            roomId: room.id,
            roomName: room.name,
            counters: initialCounters.map((c) => c.name),
          },
          approvalState: "DISETUJUI",
          linkUrl: "/dashboard",
        },
        tx
      );

      return { room, updatedUser };
    });

    const sessionUser = {
      id: result.updatedUser.id,
      username: result.updatedUser.username,
      email: result.updatedUser.email,
      name: result.updatedUser.name,
      role: "PEMILIK" as UserRole,
      isAssigned: true,
      roomId: result.room.id,
      tokenVersion: result.updatedUser.tokenVersion,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = await getRolePermissionsMap("PEMILIK");
    const res = NextResponse.json(
      {
        room: result.room,
        counters: initialCounters,
        user: sessionUser,
        permissions,
        redirectTo: "/dashboard",
      },
      { status: 201 }
    );
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    return handleApiError(err, "/api/rooms", "Gagal membuat ruangan baru.");
  }
}

