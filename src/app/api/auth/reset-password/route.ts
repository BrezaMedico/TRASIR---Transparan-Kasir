import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validateResetTokenAgainstDb } from "@/lib/password-reset";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const resetSchema = z.object({
  token: z.string().min(1, "Token atur ulang kata sandi wajib disertakan."),
  newPassword: z
    .string()
    .min(6, "Kata sandi baru minimal 6 karakter.")
    .max(128, "Kata sandi baru maksimal 128 karakter."),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() || "";
    if (!token) {
      return NextResponse.json(
        { valid: false, error: "Tautan tidak memuat token verifikasi." },
        { status: 400 }
      );
    }

    const check = await validateResetTokenAgainstDb(token);
    if (!check.valid) {
      return NextResponse.json({ valid: false, error: check.error }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      emailMasked: check.emailMasked,
      name: check.user.name,
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Gagal memverifikasi tautan reset kata sandi." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Input atur ulang kata sandi tidak valid." },
        { status: 400 }
      );
    }

    const check = await validateResetTokenAgainstDb(parsed.data.token.trim());
    if (!check.valid) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const nextHash = await hashPassword(parsed.data.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: check.user.id },
        data: {
          passwordHash: nextHash,
          tokenVersion: { increment: 1 },
        },
      });

      await recordAuditLog(
        {
          roomId: check.user.roomId,
          actorId: check.user.id,
          actorName: check.user.name,
          actorRole: check.user.role,
          actionType: "PASSWORD_RESET",
          actionSummary: `${check.user.name} berhasil mengatur ulang kata sandi melalui tautan email`,
          entityType: "User",
          entityId: check.user.id,
          approvalState: "TERCATAT",
          linkUrl: "/aktivitas",
        },
        tx
      );
    });

    return NextResponse.json({
      ok: true,
      message: "Kata sandi berhasil diperbarui. Silakan masuk menggunakan kata sandi baru Anda.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui kata sandi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

