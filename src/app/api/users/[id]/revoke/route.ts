import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, requireAssignedUser } from "@/lib/auth";
import {
  hasMinimumRemainingOwners,
  isStoreAdmin,
  UserRole,
  validateRoleManagementAction,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const revokeSchema = z.object({
  forceWithOpenShift: z.boolean().optional(),
  reason: z.string().trim().max(300).optional(),
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
        { error: "Hanya Pemilik atau Manajer yang dapat mencabut akses anggota tim." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    const forceWithOpenShift = parsed.success ? Boolean(parsed.data.forceWithOpenShift) : false;
    const reason = parsed.success ? parsed.data.reason : undefined;

    const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");

    const revoked = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target || target.roomId !== actor.roomId) {
          throw new Error("NOT_FOUND:Anggota tim tidak ditemukan pada ruangan ini.");
        }
        if (!target.isAssigned) {
          throw new Error("CONFLICT:Akses ruangan pengguna ini sudah dicabut.");
        }

        // Perlindungan akun Pemilik: Manajer dilarang mencabut akses Pemilik
        const guard = validateRoleManagementAction({
          actorRole: actor.role,
          targetCurrentRole: target.role,
          action: "REVOKE",
        });
        if (!guard.allowed) {
          throw new Error(`FORBIDDEN:${guard.error}`);
        }

        // Anti-lockout: lindungi Pemilik aktif terakhir ruangan
        const activeOwnerCount = await tx.user.count({
          where: {
            roomId: actor.roomId,
            role: "PEMILIK",
            isActive: true,
            isAssigned: true,
          },
        });
        const targetIsActiveOwner =
          target.isActive && target.isAssigned && target.role === "PEMILIK";
        if (!hasMinimumRemainingOwners(activeOwnerCount, targetIsActiveOwner, false)) {
          throw new Error(
            "BAD_REQUEST:Tidak dapat mencabut akses satu-satunya Pemilik aktif pada ruangan ini."
          );
        }

        const lastClosing = await tx.shiftClosing.findFirst({
          where: { roomId: actor.roomId, cashierId: target.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const unclosedSalesCount = await tx.sale.count({
          where: {
            roomId: actor.roomId,
            cashierId: target.id,
            status: "NORMAL",
            ...(lastClosing ? { createdAt: { gt: lastClosing.createdAt } } : {}),
          },
        });

        if (unclosedSalesCount > 0 && !forceWithOpenShift) {
          throw new Error(`OPEN_SHIFT:${unclosedSalesCount}`);
        }

        const updated = await tx.user.update({
          where: { id: target.id },
          data: {
            isAssigned: false,
            roomId: null,
            tokenVersion: { increment: 1 },
          },
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
            actionType: "USER_ACCESS_REVOKED",
            actionSummary:
              unclosedSalesCount > 0
                ? `${actor.name} mencabut akses ruangan @${target.username} (${target.role}) dengan catatan ${unclosedSalesCount} transaksi shift masih terbuka`
                : `${actor.name} mencabut akses ruangan @${target.username} (${target.role})`,
            entityType: "User",
            entityId: target.id,
            beforeData: {
              targetUsername: target.username,
              role: target.role,
              isAssigned: true,
              roomId: actor.roomId,
            },
            afterData: {
              targetUsername: target.username,
              role: target.role,
              isAssigned: false,
              roomId: null,
              openShiftAnomalyCount: unclosedSalesCount,
              reason: reason || null,
            },
            approvalState: "DISETUJUI",
            linkUrl: "/pengguna",
          },
          tx
        );

        return { user: updated, openShiftAnomalyCount: unclosedSalesCount };
      },
      isPostgres
        ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }
        : undefined
    );

    const selfRevoked = revoked.user.id === actor.id;
    const res = NextResponse.json({
      user: revoked.user,
      openShiftAnomalyCount: revoked.openShiftAnomalyCount,
      selfRevoked,
      redirectTo: selfRevoked ? "/menunggu-undangan" : undefined,
    });

    if (selfRevoked) {
      const token = await createSessionToken({
        id: revoked.user.id,
        username: revoked.user.username,
        email: revoked.user.email,
        name: revoked.user.name,
        role: revoked.user.role as UserRole,
        isAssigned: false,
        roomId: null,
        tokenVersion: revoked.user.tokenVersion,
      });
      attachSessionCookie(res, token);
    }

    return res;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    if (rawMsg.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: rawMsg.replace("BAD_REQUEST:", "") }, { status: 400 });
    }
    if (rawMsg.startsWith("OPEN_SHIFT:")) {
      const count = Number(rawMsg.replace("OPEN_SHIFT:", ""));
      return NextResponse.json(
        {
          hasOpenShift: true,
          unclosedSalesCount: count,
          error: `Anggota ini masih memiliki ${count} transaksi shift kasir yang belum ditutup. Tutup shift terlebih dahulu atau konfirmasi pencabutan dengan catatan shift terbuka.`,
        },
        { status: 409 }
      );
    }
    return handleApiError(err, "/api/users/[id]/revoke", "Gagal mencabut akses anggota tim.");
  }
}
