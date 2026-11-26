import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { exportRoomBackupPayload } from "@/lib/backup";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;
    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat mengunduh cadangan database ruangan." },
        { status: 403 }
      );
    }

    const { payload, now } = await exportRoomBackupPayload(user.roomId, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
    const serialized = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(serialized, "utf8");

    await prisma.$transaction([
      prisma.room.update({
        where: { id: user.roomId },
        data: { lastBackupAt: now },
      }),
      prisma.backupLog.create({
        data: {
          roomId: user.roomId,
          triggerType: "MANUAL",
          status: "SUCCESS",
          sizeBytes,
        },
      }),
    ]);

    await recordAuditLog({
      roomId: user.roomId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      actionType: "PENGATURAN",
      actionSummary: "Melakukan pencadangan data ruangan manual (Manual Data Backup)",
      entityType: "Backup",
      approvalState: "TERCATAT",
      linkUrl: "/pengaturan",
    });

    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err, "/api/backup", "Gagal membuat cadangan data.");
  }
}
