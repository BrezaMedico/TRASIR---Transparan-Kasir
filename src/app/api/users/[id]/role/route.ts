import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, requireAssignedUser } from "@/lib/auth";
import {
  formatRoleLabel,
  getDefaultRedirectForRole,
  hasMinimumRemainingOwners,
  isStoreAdmin,
  UserRole,
  validateRoleManagementAction,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const updateRoleSchema = z.object({
  role: z.enum(["PEMILIK", "MANAJER", "KASIR", "GUDANG", "KASIR_GUDANG"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const actor = auth.user;

    if (!isStoreAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat mengubah role anggota tim." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Role target tidak valid." }, { status: 400 });
    }

    const newRole = parsed.data.role as UserRole;
    const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");

    const updated = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target || target.roomId !== actor.roomId) {
          throw new Error("NOT_FOUND:Anggota tim tidak ditemukan pada ruangan ini.");
        }
        if (!target.isAssigned) {
          throw new Error("BAD_REQUEST:Pengguna belum tergabung ke ruangan.");
        }

        const oldRole = target.role as UserRole;

        // Perlindungan akun Pemilik: Manajer tidak boleh mengubah Pemilik maupun memberikan role Pemilik
        const guard = validateRoleManagementAction({
          actorRole: actor.role,
          targetCurrentRole: oldRole,
          targetNextRole: newRole,
          action: "CHANGE_ROLE",
        });
        if (!guard.allowed) {
          throw new Error(`FORBIDDEN:${guard.error}`);
        }

        if (oldRole === newRole) {
          return {
            user: {
              id: target.id,
              username: target.username,
              email: target.email,
              name: target.name,
              role: target.role as UserRole,
              isActive: target.isActive,
              isAssigned: target.isAssigned,
              roomId: target.roomId,
              tokenVersion: target.tokenVersion,
            },
            oldRole,
          };
        }

        // Anti-lockout: ruangan wajib selalu memiliki minimal 1 Pemilik aktif
        const activeOwnerCount = await tx.user.count({
          where: {
            roomId: actor.roomId,
            role: "PEMILIK",
            isActive: true,
            isAssigned: true,
          },
        });

        const targetIsActiveOwner = target.isActive && target.isAssigned && oldRole === "PEMILIK";
        const nextIsActiveOwner = target.isActive && target.isAssigned && newRole === "PEMILIK";

        if (!hasMinimumRemainingOwners(activeOwnerCount, targetIsActiveOwner, nextIsActiveOwner)) {
          throw new Error(
            "BAD_REQUEST:Tidak dapat menurunkan role satu-satunya Pemilik aktif pada ruangan ini."
          );
        }

        const nextUser = await tx.user.update({
          where: { id: target.id },
          data: { role: newRole },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            isAssigned: true,
            roomId: true,
            tokenVersion: true,
          },
        });

        await recordAuditLog(
          {
            roomId: actor.roomId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            actionType: "USER_ROLE_CHANGED",
            actionSummary: `${actor.name} mengubah role @${target.username} dari ${formatRoleLabel(oldRole)} menjadi ${formatRoleLabel(newRole)}`,
            entityType: "User",
            entityId: target.id,
            beforeData: { targetUsername: target.username, oldRole },
            afterData: { targetUsername: target.username, newRole },
            approvalState: "DISETUJUI",
            linkUrl: "/pengguna",
          },
          tx
        );

        return { user: { ...nextUser, role: nextUser.role as UserRole }, oldRole };
      },
      isPostgres
        ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }
        : undefined
    );

    const selfChanged = updated.user.id === actor.id;
    const redirectTo = selfChanged
      ? getDefaultRedirectForRole(updated.user.role, true)
      : undefined;

    const res = NextResponse.json({
      user: updated.user,
      selfChanged,
      redirectTo,
    });

    if (selfChanged) {
      const token = await createSessionToken({
        id: updated.user.id,
        username: updated.user.username,
        email: updated.user.email,
        name: updated.user.name,
        role: updated.user.role,
        isAssigned: updated.user.isAssigned,
        roomId: updated.user.roomId,
        tokenVersion: updated.user.tokenVersion,
      });
      attachSessionCookie(res, token);
    }

    return res;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal mengubah role anggota tim.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: rawMsg.replace("BAD_REQUEST:", "") }, { status: 400 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}
