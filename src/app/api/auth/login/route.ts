import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, verifyPassword } from "@/lib/auth";
import {
  ensureSystemBaseline,
  getDefaultRedirectForRole,
  getRolePermissionsMap,
  UserRole,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { checkRateLimit, getClientIpKey } from "@/lib/rate-limit";
import { z } from "zod";

const loginSchema = z.object({
  identifier: z.string().min(1, "Username atau email wajib diisi"),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});

export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const identifier = parsed.data.identifier.trim().toLowerCase();
    const rateCheck = checkRateLimit(
      `login:${getClientIpKey(request)}:${identifier}`,
      15,
      5 * 60_000
    );
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Akun tidak ditemukan atau kata sandi salah." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Akun tidak ditemukan atau kata sandi salah." },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Akun Anda sedang dinonaktifkan oleh Pemilik atau Manajer ruangan." },
        { status: 403 }
      );
    }

    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "LOGIN",
        actionSummary: `${user.name} (${user.role}) berhasil masuk ke sistem TRASIR`,
        entityType: "Session",
        entityId: user.id,
        approvalState: "TERCATAT",
        linkUrl: "/aktivitas",
      }),
    ]);

    const role = user.role as UserRole;
    const isAssigned = Boolean(user.isAssigned && user.roomId);
    const sessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role,
      isAssigned,
      roomId: user.roomId,
      tokenVersion: user.tokenVersion,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = isAssigned ? await getRolePermissionsMap(role) : null;
    const redirectTo = getDefaultRedirectForRole(role, isAssigned);

    const res = NextResponse.json({
      user: sessionUser,
      permissions,
      redirectTo,
    });

    attachSessionCookie(res, token);
    return res;
  } catch {
    return NextResponse.json({ error: "Gagal memproses autentikasi." }, { status: 500 });
  }
}
