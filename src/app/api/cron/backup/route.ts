import crypto from "node:crypto";
import { handleApiError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  compressBackupJson,
  enforceBackupRetention,
  exportRoomBackupPayload,
  storeCompressedBackup,
} from "@/lib/backup";

function verifyCronBearerToken(request: Request): { ok: boolean; status: number; error?: string } {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET belum dikonfigurasi pada server.",
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const provided = authHeader.slice(prefix.length).trim();
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, status: 200 };
}

export async function GET(request: Request) {
  const authCheck = verifyCronBearerToken(request);
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const rooms = await prisma.room.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const results: {
      roomId: string;
      status: "SUCCESS" | "FAILED";
      sizeBytes: number;
      prunedCount: number;
      error?: string;
    }[] = [];

    for (const room of rooms) {
      try {
        const { payload, now } = await exportRoomBackupPayload(room.id, {
          id: "system-cron",
          name: "Scheduled Backup Cron",
          role: "SYSTEM",
        });
        const compressed = compressBackupJson(payload);
        const stored = await storeCompressedBackup({
          roomId: room.id,
          timestampIso: now.toISOString(),
          compressed,
        });

        await prisma.$transaction([
          prisma.backupLog.create({
            data: {
              roomId: room.id,
              triggerType: "CRON",
              status: "SUCCESS",
              sizeBytes: compressed.byteLength,
              storageUrl: stored.storageUrl,
            },
          }),
          prisma.room.update({
            where: { id: room.id },
            data: { lastBackupAt: now },
          }),
        ]);

        const prunedCount = await enforceBackupRetention(room.id);
        results.push({
          roomId: room.id,
          status: "SUCCESS",
          sizeBytes: compressed.byteLength,
          prunedCount,
        });
      } catch (roomErr) {
        const errMessage =
          roomErr instanceof Error ? roomErr.message : "Gagal mengeksekusi backup ruangan.";
        await prisma.backupLog
          .create({
            data: {
              roomId: room.id,
              triggerType: "CRON",
              status: "FAILED",
              sizeBytes: 0,
              errorMessage: errMessage.slice(0, 500),
            },
          })
          .catch(() => undefined);

        results.push({
          roomId: room.id,
          status: "FAILED",
          sizeBytes: 0,
          prunedCount: 0,
          error: errMessage,
        });
      }
    }

    const failedCount = results.filter((r) => r.status === "FAILED").length;
    return NextResponse.json(
      {
        ok: failedCount === 0,
        processedRooms: rooms.length,
        succeededRooms: rooms.length - failedCount,
        failedRooms: failedCount,
        results,
      },
      { status: failedCount === 0 ? 200 : 207 }
    );
  } catch (err) {
    return handleApiError(err, "/api/cron/backup", "Gagal menjalankan cron backup.");
  }
}

