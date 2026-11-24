import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, getCurrentSessionUser } from "@/lib/auth";
import {
  getDefaultRedirectForRole,
  getRolePermissionsMap,
  normalizeInviteCode,
  UserRole,
} from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const joinSchema = z.object({
  inviteCode: z.string().trim().min(6, "Kode undangan wajib diisi."),
});

/**
 * Memungkinkan akun terdaftar yang belum tergabung ke ruangan
 * untuk bergabung ke ruangan menggunakan kode undangan valid.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.isAssigned && user.roomId) {
      return NextResponse.json(
        { error: "Akun Anda sudah tergabung dalam ruangan aktif." },
        { status: 409 }
      );
    }

    const rawBody = await request.json();
    if (rawBody && typeof rawBody === "object" && ("role" in rawBody || "assignedRole" in rawBody)) {
      return NextResponse.json(
        { error: "Pengguna tidak dapat menentukan role sendiri saat bergabung ke ruangan." },
        { status: 403 }
      );
    }

    const parsed = joinSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Kode undangan tidak valid." },
        { status: 400 }
      );
    }

    const code = normalizeInviteCode(parsed.data.inviteCode);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const invitation = await tx.storeInvitation.findUnique({
        where: { code },
        include: {
          room: { select: { id: true, name: true } },
          invitedBy: { select: { id: true, name: true, username: true } },
        },
      });

      if (!invitation || !invitation.roomId || !invitation.room) {
        throw new Error("NOT_FOUND:Kode undangan tidak ditemukan.");
      }
      if (invitation.status === "REVOKED") {
        throw new Error("INVALID:Kode undangan ini sudah dicabut.");
      }
      if (invitation.status === "ACCEPTED") {
        throw new Error("CONFLICT:Kode undangan ini sudah digunakan.");
      }
      if (invitation.status !== "PENDING") {
        throw new Error(`INVALID:Kode undangan tidak aktif (${invitation.status}).`);
      }
      if (invitation.expiresAt <= now) {
        await tx.storeInvitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
        throw new Error("INVALID:Kode undangan sudah kedaluwarsa.");
      }
      if (invitation.targetUserId && invitation.targetUserId !== user.id) {
        throw new Error("FORBIDDEN:Kode undangan ini ditujukan untuk pengguna lain.");
      }
      if (invitation.targetUsername && invitation.targetUsername !== user.username) {
        throw new Error(
          `FORBIDDEN:Kode undangan ini khusus untuk username @${invitation.targetUsername}.`
        );
      }

      const allowedJoinRoles: UserRole[] = ["KASIR", "GUDANG", "KASIR_GUDANG", "MANAJER"];
      const assignedRole = invitation.assignedRole as UserRole;
      if (!allowedJoinRoles.includes(assignedRole)) {
        throw new Error("INVALID:Role undangan tidak valid.");
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          role: assignedRole,
          isAssigned: true,
          isActive: true,
          roomId: invitation.roomId,
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isAssigned: true,
          roomId: true,
          tokenVersion: true,
        },
      });

      const accepted = await tx.storeInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          targetUserId: updatedUser.id,
          targetUsername: updatedUser.username,
          respondedAt: now,
        },
      });

      await tx.storeInvitation.updateMany({
        where: {
          targetUserId: user.id,
          status: "PENDING",
          id: { not: invitation.id },
        },
        data: { status: "REVOKED", respondedAt: now },
      });

      await recordAuditLog(
        {
          roomId: invitation.roomId,
          actorId: updatedUser.id,
          actorName: updatedUser.name,
          actorRole: assignedRole,
          actionType: "INVITATION_ACCEPTED",
          actionSummary: `@${updatedUser.username} bergabung ke ruangan "${invitation.room.name}" dengan kode undangan sebagai ${assignedRole}`,
          entityType: "StoreInvitation",
          entityId: invitation.id,
          afterData: { roomId: invitation.roomId, role: assignedRole },
          approvalState: "DISETUJUI",
          linkUrl: "/pengguna",
        },
        tx
      );

      await createNotification(
        {
          roomId: invitation.roomId,
          title: `Anggota Baru Bergabung (@${updatedUser.username})`,
          message: `${updatedUser.name} bergabung ke ruangan "${invitation.room.name}" sebagai ${assignedRole}.`,
          severity: "INFO",
          category: "SISTEM",
          targetRole: null,
          linkUrl: "/pengguna",
        },
        tx
      );

      return { updatedUser, accepted, room: invitation.room };
    });

    const role = result.updatedUser.role as UserRole;
    const sessionUser = {
      id: result.updatedUser.id,
      username: result.updatedUser.username,
      email: result.updatedUser.email,
      name: result.updatedUser.name,
      role,
      isAssigned: true,
      roomId: result.room.id,
      tokenVersion: result.updatedUser.tokenVersion,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = await getRolePermissionsMap(role);
    const redirectTo = getDefaultRedirectForRole(role, true);
    const res = NextResponse.json({
      user: sessionUser,
      room: result.room,
      invitation: result.accepted,
      permissions,
      redirectTo,
    });
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal bergabung ke ruangan.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    if (rawMsg.startsWith("INVALID:")) {
      return NextResponse.json({ error: rawMsg.replace("INVALID:", "") }, { status: 400 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}

