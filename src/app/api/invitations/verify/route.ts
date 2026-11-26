import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRoleLabel, normalizeInviteCode } from "@/lib/rbac";
import { checkRateLimit, getClientIpKey } from "@/lib/rate-limit";

/**
 * Verifikasi publik untuk kode undangan ruangan sebelum menyelesaikan pendaftaran / bergabung.
 * Hanya mengembalikan metadata minimal (nama ruangan, peran yang ditetapkan, masa berlaku).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get("code") || "";
    const clientIp = getClientIpKey(request);

    if (checkRateLimit(`invite-verify:${clientIp}`, 40, 60_000).limited) {
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

