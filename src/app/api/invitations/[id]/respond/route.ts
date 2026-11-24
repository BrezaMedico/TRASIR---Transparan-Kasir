import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, getCurrentSessionUser } from "@/lib/auth";
import { formatRoleLabel, getDefaultRedirectForRole, UserRole } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const respondSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = respondSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Aksi harus ACCEPT atau DECLINE." }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const invitation = await tx.storeInvitation.findUnique({
        where: { id },
        include: {
          room: { select: { id: true, name: true } },
          invitedBy: { select: { id: true, name: true, username: true } },
        },
      });

      if (!invitation || !invitation.roomId) {
        throw new Error("NOT_FOUND:Undangan tidak ditemukan.");
      }

      if (invitation.targetUserId !== user.id) {
        throw new Error("FORBIDDEN:Anda tidak berhak menanggapi undangan milik akun lain.");
      }

      if (invitation.status === "REVOKED") {
        throw new Error("CONFLICT:Undangan ini sudah dicabut oleh pengelola ruangan.");
      }

      if (invitation.status !== "PENDING") {
        throw new Error(`CONFLICT:Undangan ini sudah berstatus ${invitation.status}.`);
      }

      if (invitation.expiresAt <= now) {
        await tx.storeInvitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
        throw new Error(
          "CONFLICT:Undangan ini sudah kedaluwarsa. Minta undangan baru ke pengelola ruangan."
        );
      }

      if (parsed.data.action === "DECLINE") {
        const declined = await tx.storeInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "DECLINED",
            respondedAt: now,
          },
        });

        await recordAuditLog(
          {
            roomId: invitation.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "INVITATION_DECLINED",
            actionSummary: `@${user.username} menolak undangan sebagai ${formatRoleLabel(invitation.assignedRole)}`,
            entityType: "StoreInvitation",
            entityId: invitation.id,
            beforeData: { status: "PENDING" },
            afterData: { status: "DECLINED" },
            approvalState: "DITOLAK",
            linkUrl: "/pengguna",
          },
          tx
        );

        return { invitation: declined, updatedUser: null };
      }

      const freshUser = await tx.user.findUnique({ where: { id: user.id } });
      if (!freshUser || !freshUser.isActive) {
        throw new Error("FORBIDDEN:Akun tidak aktif.");
      }
      if (freshUser.isAssigned && freshUser.roomId) {
        throw new Error("CONFLICT:Akun Anda sudah terhubung ke sebuah ruangan.");
      }

      const allowedRoles: UserRole[] = ["KASIR", "GUDANG", "KASIR_GUDANG", "MANAJER"];
      if (!allowedRoles.includes(invitation.assignedRole as UserRole)) {
        throw new Error("CONFLICT:Role undangan tidak valid.");
      }

      const accepted = await tx.storeInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          respondedAt: now,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          role: invitation.assignedRole,
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

      await tx.storeInvitation.updateMany({
        where: {
          targetUserId: user.id,
          status: "PENDING",
          id: { not: invitation.id },
        },
        data: {
          status: "REVOKED",
          respondedAt: now,
        },
      });

      await recordAuditLog(
        {
          roomId: invitation.roomId,
          actorId: updatedUser.id,
          actorName: updatedUser.name,
          actorRole: updatedUser.role,
          actionType: "INVITATION_ACCEPTED",
          actionSummary: `@${updatedUser.username} menerima undangan dari ${invitation.invitedBy.name} dan aktif sebagai ${formatRoleLabel(updatedUser.role)}`,
          entityType: "StoreInvitation",
          entityId: invitation.id,
          beforeData: { role: freshUser.role, isAssigned: false, roomId: freshUser.roomId },
          afterData: { role: updatedUser.role, isAssigned: true, roomId: invitation.roomId },
          approvalState: "DISETUJUI",
          linkUrl: "/pengguna",
        },
        tx
      );

      await createNotification(
        {
          roomId: invitation.roomId,
          title: `Anggota Tim Baru Bergabung (@${updatedUser.username})`,
          message: `${updatedUser.name} menerima undangan dan kini aktif sebagai ${formatRoleLabel(updatedUser.role)}.`,
          severity: "INFO",
          category: "SISTEM",
          targetRole: null,
          linkUrl: "/pengguna",
        },
        tx
      );

      return { invitation: accepted, updatedUser };
    });

    if (result.updatedUser) {
      const sessionUser = {
        id: result.updatedUser.id,
        username: result.updatedUser.username,
        email: result.updatedUser.email,
        name: result.updatedUser.name,
        role: result.updatedUser.role as UserRole,
        isAssigned: true,
        roomId: result.updatedUser.roomId,
        tokenVersion: result.updatedUser.tokenVersion,
      };
      const token = await createSessionToken(sessionUser);
      const redirectTo = getDefaultRedirectForRole(sessionUser.role, true);
      const res = NextResponse.json({
        invitation: result.invitation,
        user: sessionUser,
        redirectTo,
      });
      attachSessionCookie(res, token);
      return res;
    }

    return NextResponse.json({
      invitation: result.invitation,
      redirectTo: "/menunggu-undangan",
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal memproses tanggapan undangan.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}
