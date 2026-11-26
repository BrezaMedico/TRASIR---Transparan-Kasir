import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat mencabut undangan." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const revoked = await prisma.$transaction(async (tx) => {
      const invitation = await tx.storeInvitation.findUnique({
        where: { id },
      });

      if (!invitation || invitation.roomId !== user.roomId) {
        throw new Error("NOT_FOUND:Undangan tidak ditemukan pada ruangan ini.");
      }

      if (invitation.status !== "PENDING") {
        throw new Error(
          `CONFLICT:Undangan tidak dapat dicabut karena sudah berstatus ${invitation.status}.`
        );
      }

      const updated = await tx.storeInvitation.update({
        where: { id },
        data: {
          status: "REVOKED",
          respondedAt: new Date(),
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "INVITATION_REVOKED",
          actionSummary: `${user.name} mencabut undangan ${
            invitation.targetUsername
              ? `untuk @${invitation.targetUsername}`
              : `kode ${invitation.code || invitation.id}`
          } (${invitation.assignedRole})`,
          entityType: "StoreInvitation",
          entityId: invitation.id,
          beforeData: { status: "PENDING" },
          afterData: { status: "REVOKED" },
          approvalState: "DITOLAK",
          linkUrl: "/pengguna",
        },
        tx
      );

      return updated;
    });

    return NextResponse.json({ invitation: revoked });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return handleApiError(err, "/api/invitations/[id]", "Gagal mencabut undangan.");
  }
}
