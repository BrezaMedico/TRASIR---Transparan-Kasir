import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  attachSessionCookie,
  createEmailChangeToken,
  createSessionToken,
  getCurrentSessionUser,
  hashVerificationCode,
  verifyEmailChangeToken,
  verifyPassword,
} from "@/lib/auth";
import { sendEmailChangeVerificationEmail } from "@/lib/email";
import { recordAuditLog } from "@/lib/audit";
import {
  checkRateLimit,
  isOtpTokenBlocked,
  markOtpTokenConsumed,
  recordOtpFailedAttempt,
} from "@/lib/rate-limit";
import { type UserRole } from "@/lib/rbac";
import { z } from "zod";

const requestEmailChangeSchema = z.object({
  action: z.literal("REQUEST"),
  newEmail: z.string().trim().email("Format email baru tidak valid.").max(150),
  currentPassword: z.string().min(1, "Masukkan kata sandi saat ini untuk keamanan."),
});

const confirmEmailChangeSchema = z.object({
  action: z.literal("CONFIRM"),
  verificationToken: z.string().min(10, "Token verifikasi tidak ditemukan."),
  code: z.string().trim().regex(/^\d{6}$/, "Kode verifikasi harus 6 digit angka."),
});

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isAssigned: true,
        roomId: true,
        tokenVersion: true,
      },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
    }

    const body = await request.json();

    if (body && body.action === "REQUEST") {
      const reqLimit = checkRateLimit(`change-email:req:${dbUser.id}`, 5, 15 * 60_000);
      if (reqLimit.limited) {
        return NextResponse.json(
          { error: "Terlalu banyak permintaan kode verifikasi email. Coba beberapa saat lagi." },
          { status: 429 }
        );
      }

      const parsed = requestEmailChangeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data permintaan ganti email tidak valid." },
          { status: 400 }
        );
      }

      const validPassword = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash);
      if (!validPassword) {
        return NextResponse.json({ error: "Kata sandi saat ini tidak sesuai." }, { status: 400 });
      }

      const nextEmail = parsed.data.newEmail.toLowerCase();
      if (nextEmail === dbUser.email.toLowerCase()) {
        return NextResponse.json(
          { error: "Email baru sama dengan email Anda saat ini." },
          { status: 400 }
        );
      }

      const existingOwner = await prisma.user.findFirst({
        where: { email: nextEmail, id: { not: dbUser.id } },
        select: { id: true },
      });
      if (existingOwner) {
        return NextResponse.json(
          { error: "Email tersebut sudah digunakan oleh akun lain." },
          { status: 409 }
        );
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const verificationToken = await createEmailChangeToken({
        userId: dbUser.id,
        currentEmail: dbUser.email,
        newEmail: nextEmail,
        tokenVersion: dbUser.tokenVersion,
        code,
      });

      const sendRes = await sendEmailChangeVerificationEmail({
        to: nextEmail,
        recipientName: dbUser.name,
        newEmail: nextEmail,
        code,
      });

      if (!sendRes.ok) {
        return NextResponse.json(
          {
            error:
              "Layanan pengiriman email belum siap atau gagal mengirim kode. Periksa konfigurasi email server.",
          },
          { status: 503 }
        );
      }

      return NextResponse.json({
        ok: true,
        verificationToken,
        newEmail: nextEmail,
        provider: sendRes.provider,
        ...(process.env.NODE_ENV !== "production" && sendRes.provider === "DEV_CONSOLE"
          ? { devCode: code }
          : {}),
      });
    }

    if (body && body.action === "CONFIRM") {
      const parsed = confirmEmailChangeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Kode verifikasi tidak valid." },
          { status: 400 }
        );
      }

      const otpBlocked = isOtpTokenBlocked(parsed.data.verificationToken);
      if (otpBlocked.blocked) {
        if (otpBlocked.reason === "LOCKED") {
          return NextResponse.json(
            { error: "Terlalu banyak percobaan kode salah. Minta kode verifikasi baru." },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: "Kode verifikasi ini sudah digunakan. Minta kode baru jika diperlukan." },
          { status: 400 }
        );
      }

      const payload = await verifyEmailChangeToken(parsed.data.verificationToken);
      if (
        !payload ||
        payload.userId !== dbUser.id ||
        payload.currentEmail.toLowerCase() !== dbUser.email.toLowerCase() ||
        payload.tokenVersion !== dbUser.tokenVersion
      ) {
        return NextResponse.json(
          { error: "Sesi verifikasi email tidak valid atau sudah kedaluwarsa. Minta kode baru." },
          { status: 400 }
        );
      }

      const submittedHash = Buffer.from(hashVerificationCode(parsed.data.code), "hex");
      const expectedHash = Buffer.from(payload.codeHash, "hex");
      if (
        submittedHash.length !== expectedHash.length ||
        !crypto.timingSafeEqual(submittedHash, expectedHash)
      ) {
        const failInfo = recordOtpFailedAttempt(parsed.data.verificationToken, 5);
        if (failInfo.locked) {
          return NextResponse.json(
            { error: "Terlalu banyak percobaan kode salah. Minta kode verifikasi baru." },
            { status: 429 }
          );
        }
        return NextResponse.json(
          { error: "Kode verifikasi salah. Periksa kembali email Anda." },
          { status: 400 }
        );
      }

      const duplicate = await prisma.user.findFirst({
        where: { email: payload.newEmail, id: { not: dbUser.id } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "Email tersebut sudah digunakan oleh akun lain." },
          { status: 409 }
        );
      }

      const updated = await prisma.user.update({
        where: { id: dbUser.id },
        data: { email: payload.newEmail },
        select: { id: true, email: true, username: true, name: true, role: true },
      });

      markOtpTokenConsumed(parsed.data.verificationToken);

      if (dbUser.roomId) {
        await recordAuditLog({
          roomId: dbUser.roomId,
          actorId: dbUser.id,
          actorName: dbUser.name,
          actorRole: dbUser.role,
          actionType: "PENGATURAN",
          actionSummary: `${dbUser.name} mengubah email akun menjadi ${payload.newEmail} setelah verifikasi email`,
          entityType: "User",
          entityId: dbUser.id,
          beforeData: { email: dbUser.email },
          afterData: { email: payload.newEmail },
          approvalState: "TERCATAT",
          linkUrl: "/pengaturan?tab=lanjutan",
        });
      }

      const newSessionToken = await createSessionToken({
        id: dbUser.id,
        username: dbUser.username,
        email: payload.newEmail,
        name: dbUser.name,
        role: dbUser.role as UserRole,
        isAssigned: Boolean(dbUser.isAssigned && dbUser.roomId),
        roomId: dbUser.roomId,
        tokenVersion: dbUser.tokenVersion,
      });

      const res = NextResponse.json({ ok: true, email: updated.email });
      attachSessionCookie(res, newSessionToken);
      return res;
    }

    return NextResponse.json({ error: "Aksi ganti email tidak dikenali." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses perubahan email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

