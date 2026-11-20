import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, hashPassword, SESSION_COOKIE_NAME } from "@/lib/auth";
import { ensureSystemBaseline, getDefaultRedirectForRole, getRolePermissionsMap } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const setupSchema = z.object({
  name: z.string().min(2, "Nama lengkap minimal 2 karakter"),
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Kata sandi minimal 6 karakter"),
  storeName: z.string().min(2, "Nama toko minimal 2 karakter").optional(),
});

export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: "Sistem sudah diinisialisasi. Silakan masuk menggunakan akun terdaftar." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const { name, username, email, password, storeName } = parsed.data;
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: "PEMILIK",
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    if (storeName?.trim()) {
      await prisma.systemSetting.upsert({
        where: { id: "default" },
        update: { storeName: storeName.trim() },
        create: {
          id: "default",
          storeName: storeName.trim(),
          toleranceThresholdRp: 50000,
          opnameSchedule: "MINGGUAN",
        },
      });
    }

    await recordAuditLog({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      actionType: "LOGIN",
      actionSummary: `Inisialisasi sistem pertama & pembuatan akun Pemilik (${user.username})`,
      entityType: "User",
      entityId: user.id,
      afterData: { username: user.username, email: user.email, role: user.role },
      approvalState: "DISETUJUI",
      linkUrl: "/pengaturan",
    });

    const sessionUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: "PEMILIK" as const,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = await getRolePermissionsMap("PEMILIK");
    const redirectTo = getDefaultRedirectForRole("PEMILIK");

    const res = NextResponse.json({
      user: sessionUser,
      permissions,
      redirectTo,
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal melakukan inisialisasi sistem.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

