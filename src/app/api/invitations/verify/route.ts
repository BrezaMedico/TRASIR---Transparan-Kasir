import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRoleLabel, normalizeInviteCode } from "@/lib/rbac";

const verifyWindow = new Map<string, number[]>();

function checkVerifyRateLimit(key: string): boolean {
  const now = Date.now();
  const list = (verifyWindow.get(key) || []).filter((ts) => now - ts < 60_000);
  if (list.length >= 40) {
    verifyWindow.set(key, list);
    return true;
  }
  list.push(now);
  verifyWindow.set(key, list);
  return false;
}

/**
 * Verifikasi publik untuk kode undangan ruangan sebelum menyelesaikan pendaftaran / bergabung.
 * Hanya mengembalikan metadata minimal (nama ruangan, peran yang ditetapkan, masa berlaku).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get("code") || "";
    const clientIp = request.headers.get("x-forwarded-for") || "local";

    if (checkVerifyRateLimit(clientIp)) {
      return NextResponse.json(
        { valid: false, error: "Terlalu banyak percobaan verifikasi. Coba lagi sebentar lagi." },
        { status: 429 }
      );
    }

    const code = normalizeInviteCode(rawCode);
    if (!code || code.length < 6) {
      return NextResponse.json(
        { valid: false, error: "Masukkan kode undangan yang valid." },
        { status: 400 }
      );
    }

    const invitation = await prisma.storeInvitation.findUnique({
      where: { code },
      include: {
        room: { select: { id: true, name: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invitation || !invitation.room) {
      return NextResponse.json(
        { valid: false, error: "Kode undangan tidak ditemukan." },
        { status: 404 }
      );
    }

    const now = new Date();
    if (invitation.status === "REVOKED") {
      return NextResponse.json(
        { valid: false, error: "Kode undangan ini telah dicabut oleh pengelola ruangan." },
        { status: 400 }
      );
    }

    if (invitation.status === "ACCEPTED") {
      return NextResponse.json(
        { valid: false, error: "Kode undangan ini sudah digunakan." },
        { status: 400 }
      );
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { valid: false, error: `Kode undangan tidak aktif (${invitation.status}).` },
        { status: 400 }
      );
    }

    if (invitation.expiresAt <= now) {
      await prisma.storeInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { valid: false, error: "Kode undangan sudah kedaluwarsa." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: invitation.code,
      roomName: invitation.room.name,
      assignedRole: invitation.assignedRole,
      assignedRoleLabel: formatRoleLabel(invitation.assignedRole),
      inviterName: invitation.invitedBy.name,
      targetUsername: invitation.targetUsername,
      expiresAt: invitation.expiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memverifikasi kode undangan.";
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}

