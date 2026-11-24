import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, getCurrentSessionUser } from "@/lib/auth";
import {
  ensureSystemBaseline,
  getRolePermissionsMap,
  seedRoomDefaults,
  UserRole,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const createRoomSchema = z.object({
  roomName: z.string().trim().min(2, "Nama ruangan minimal 2 karakter").max(120),
  roomAddress: z.string().trim().max(250).optional().or(z.literal("")),
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
          actionSummary: `${updatedUser.name} membuat ruangan baru "${room.name}" sebagai PEMILIK`,
          entityType: "Room",
          entityId: room.id,
          afterData: { roomId: room.id, roomName: room.name },
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
        user: sessionUser,
        permissions,
        redirectTo: "/dashboard",
      },
      { status: 201 }
    );
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat ruangan baru.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

