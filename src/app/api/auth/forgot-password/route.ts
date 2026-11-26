import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/auth";
import { ensureSystemBaseline } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { sendPasswordResetEmail, getConfiguredAppBaseUrl } from "@/lib/email";
import { checkRateLimit, getClientIpKey } from "@/lib/rate-limit";
import { z } from "zod";

const forgotSchema = z.object({
  email: z.string().trim().email("Masukkan alamat email yang valid."),
});

function resolveAppBaseUrl(request: Request): string | null {
  const configured = getConfiguredAppBaseUrl();
  if (configured) return configured;

  const vercelUrl = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (vercelUrl && /^[a-zA-Z0-9.-]+(:\d+)?$/.test(vercelUrl)) {
    return `https://${vercelUrl}`;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(request.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      return null;
    }
  }

  return null;
}

const GENERIC_SENT_MESSAGE =
  "Jika alamat email tersebut terdaftar dan aktif, tautan atur ulang kata sandi telah dikirim ke kotak masuk email Anda.";

export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const ipLimit = checkRateLimit(`forgot:ip:${getClientIpKey(request)}`, 10, 15 * 60_000);
    if (ipLimit.limited) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan atur ulang kata sandi. Coba beberapa saat lagi." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Alamat email tidak valid." },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const emailLimit = checkRateLimit(`forgot:email:${normalizedEmail}`, 5, 15 * 60_000);
    if (emailLimit.limited) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan untuk email ini. Tunggu beberapa menit." },
        { status: 429 }
      );
    }

    // Jangan kirim email ke domain internal placeholder
    if (normalizedEmail.endsWith(".trasir.local")) {
      return NextResponse.json({ message: GENERIC_SENT_MESSAGE });
    }

    let user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roomId: true,
        passwordHash: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          roomId: true,
          passwordHash: true,
          tokenVersion: true,
        },
      });
      user = activeUsers.find((u) => u.email.trim().toLowerCase() === normalizedEmail) ?? null;
    }

    if (!user) {
      if (process.env.NODE_ENV === "development" && process.env.VITEST !== "true") {
        console.warn("[TRASIR DEV EMAIL] Email tidak ditemukan di database aktif:", normalizedEmail);
      }
      return NextResponse.json({ message: GENERIC_SENT_MESSAGE });
    }

    const token = await createPasswordResetToken({
      userId: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
      passwordHash: user.passwordHash,
    });

    const baseUrl = resolveAppBaseUrl(request);
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Konfigurasi URL aplikasi server belum diatur." },
        { status: 503 }
      );
    }
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      recipientName: user.name,
      resetUrl,
    });

    if (!emailResult.ok) {
      return NextResponse.json(
        {
          error:
            emailResult.reason === "EMAIL_NOT_CONFIGURED"
              ? "Layanan pengiriman email server belum diatur (RESEND_API_KEY atau SMTP). Hubungi administrator untuk melengkapi konfigurasi."
              : "Gagal mengirim email atur ulang kata sandi. Periksa konfigurasi email server.",
        },
        { status: emailResult.reason === "EMAIL_NOT_CONFIGURED" ? 503 : 502 }
      );
    }

    await recordAuditLog({
      roomId: user.roomId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      actionType: "PASSWORD_RESET_REQUEST",
      actionSummary: `${user.name} meminta tautan atur ulang kata sandi ke email terdaftar (${emailResult.provider})`,
      entityType: "User",
      entityId: user.id,
      approvalState: "TERCATAT",
      linkUrl: "/aktivitas",
    });

    return NextResponse.json({
      message: GENERIC_SENT_MESSAGE,
      ...(emailResult.provider === "DEV_CONSOLE" && process.env.NODE_ENV === "development"
        ? { devPreviewUrl: resetUrl }
        : {}),
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal memproses permintaan lupa kata sandi." },
      { status: 500 }
    );
  }
}

