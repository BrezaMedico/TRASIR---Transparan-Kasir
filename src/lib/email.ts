import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

export interface SendPasswordResetEmailParams {
  to: string;
  recipientName: string;
  resetUrl: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: "RESEND" | "SMTP" | "DEV_CONSOLE" | "NONE";
  reason?: "EMAIL_NOT_CONFIGURED" | "EMAIL_SEND_FAILED";
  errorMessage?: string;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return parsed;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function readDevEnvFallback(): Record<string, string> {
  if (process.env.NODE_ENV === "production" || process.env.VITEST === "true") {
    return {};
  }
  const cwd = process.cwd();
  return {
    ...parseEnvFile(path.join(cwd, ".env")),
    ...parseEnvFile(path.join(cwd, ".env.local")),
  };
}

function getEmailEnv(key: string): string | undefined {
  const runtimeVal = process.env[key]?.trim();
  if (runtimeVal) return runtimeVal;
  if (process.env.NODE_ENV !== "production" && process.env.VITEST !== "true") {
    const fallbackVal = readDevEnvFallback()[key]?.trim();
    if (fallbackVal) return fallbackVal;
  }
  return undefined;
}

export function getConfiguredAppBaseUrl(): string | undefined {
  const val = getEmailEnv("NEXT_PUBLIC_APP_URL");
  return val ? val.replace(/\/+$/, "") : undefined;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildResetEmailContent(params: SendPasswordResetEmailParams) {
  const safeName = escapeHtml(params.recipientName || "Pengguna TRASIR");
  const safeUrl = escapeHtml(params.resetUrl);

  const subject = "Atur ulang kata sandi akun TRASIR Anda";

  const text = [
    `Halo ${params.recipientName || "Pengguna TRASIR"},`,
    "",
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun TRASIR Anda.",
    "Klik tautan konfirmasi berikut untuk langsung membuat kata sandi baru (tanpa kode autentikasi, berlaku 30 menit untuk satu kali pakai):",
    params.resetUrl,
    "",
    "Jika Anda tidak pernah meminta pengaturan ulang kata sandi, abaikan email ini. Akun Anda tetap aman.",
    "",
    "TRASIR (Transparan Kasir)",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202531;">
  <div style="max-width:520px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:24px;">
    <div style="border-bottom:1px solid #E5E7EB;padding-bottom:14px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:800;letter-spacing:-0.01em;color:#202531;">TRASIR</div>
      <div style="font-size:12px;color:#525866;margin-top:2px;">Transparan Kasir &amp; Pengawasan Keuangan Toko</div>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#202531;">
      Halo <strong>${safeName}</strong>,
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">
      Kami menerima permintaan untuk mengatur ulang kata sandi akun TRASIR Anda. Klik tombol konfirmasi di bawah ini untuk langsung membuat kata sandi baru tanpa kode autentikasi. Tautan ini berlaku <strong>30 menit</strong> dan hanya dapat dipakai satu kali.
    </p>
    <p style="margin:0 0 20px;">
      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;background-color:#202531;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
        Konfirmasi &amp; Buat Kata Sandi Baru
      </a>
    </p>
    <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#525866;">
      Jika tombol di atas tidak merespons, silakan <a href="${safeUrl}" style="color:#202531;font-weight:600;text-decoration:underline;">buka halaman atur ulang kata sandi</a> secara langsung.
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:14px;">
      Jika Anda tidak pernah meminta pengaturan ulang kata sandi, abaikan email ini. Akun Anda tetap aman.
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

export function isEmailServiceConfigured(): boolean {
  const hasResend = Boolean(getEmailEnv("RESEND_API_KEY"));
  const hasSmtp = Boolean(
    getEmailEnv("SMTP_HOST") &&
      getEmailEnv("SMTP_USER") &&
      getEmailEnv("SMTP_PASS")?.replace(/\s+/g, "").trim()
  );
  return hasResend || hasSmtp;
}

export async function sendPasswordResetEmail(
  params: SendPasswordResetEmailParams
): Promise<SendEmailResult> {
  if (process.env.VITEST === "true") {
    return { ok: true, provider: "DEV_CONSOLE" };
  }

  const { subject, text, html } = buildResetEmailContent(params);

  // Jalur 1: Resend HTTPS API (paling direkomendasikan saat deploy ke Vercel/serverless)
  const resendApiKey = getEmailEnv("RESEND_API_KEY");
  if (resendApiKey) {
    const fromAddress =
      getEmailEnv("EMAIL_FROM") || "TRASIR <onboarding@resend.dev>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const errorMessage = errText || `Resend HTTP ${res.status}`;
        console.error("[TRASIR EMAIL ERROR] Provider=RESEND:", errorMessage);
        return {
          ok: false,
          provider: "RESEND",
          reason: "EMAIL_SEND_FAILED",
          errorMessage,
        };
      }
      return { ok: true, provider: "RESEND" };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Koneksi ke Resend gagal.";
      console.error("[TRASIR EMAIL ERROR] Provider=RESEND:", errorMessage);
      return {
        ok: false,
        provider: "RESEND",
        reason: "EMAIL_SEND_FAILED",
        errorMessage,
      };
    }
  }

  // Jalur 2: SMTP via Nodemailer (contoh: Gmail App Password gratis, Zoho, Brevo SMTP, atau cPanel)
  const smtpHost = getEmailEnv("SMTP_HOST");
  const smtpUser = getEmailEnv("SMTP_USER");
  const smtpPass = getEmailEnv("SMTP_PASS")?.replace(/\s+/g, "").trim();
  if (smtpHost && smtpUser && smtpPass) {
    const rawPort = getEmailEnv("SMTP_PORT");
    const smtpPort = Number(rawPort || 465);
    const rawSecure = getEmailEnv("SMTP_SECURE");
    const smtpSecure =
      rawSecure !== undefined ? rawSecure === "true" : smtpPort === 465;

    const configuredFrom = getEmailEnv("EMAIL_FROM");
    const fromAddress =
      smtpHost.toLowerCase().includes("gmail.com") &&
      (!configuredFrom || !configuredFrom.toLowerCase().includes(smtpUser.toLowerCase()))
        ? `TRASIR <${smtpUser}>`
        : configuredFrom || `TRASIR <${smtpUser}>`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        ...(smtpSecure ? {} : { requireTLS: true }),
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: smtpUser,
        to: params.to,
        subject,
        text,
        html,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
        },
      });
      if (!info.accepted || info.accepted.length === 0) {
        const errorMessage = "Server SMTP menolak alamat penerima.";
        console.error("[TRASIR EMAIL ERROR] Provider=SMTP:", errorMessage);
        return {
          ok: false,
          provider: "SMTP",
          reason: "EMAIL_SEND_FAILED",
          errorMessage,
        };
      }
      return { ok: true, provider: "SMTP" };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Koneksi SMTP gagal.";
      console.error("[TRASIR EMAIL ERROR] Provider=SMTP:", errorMessage);
      return {
        ok: false,
        provider: "SMTP",
        reason: "EMAIL_SEND_FAILED",
        errorMessage,
      };
    }
  }

  // Mode Development/Test lokal ketika provider email belum dipasang
  if (process.env.NODE_ENV !== "production") {
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[TRASIR DEV EMAIL] Tautan reset password untuk ${params.to} belum terkirim via SMTP karena konfigurasi kosong.`
      );
    }
    return { ok: true, provider: "DEV_CONSOLE" };
  }

  return {
    ok: false,
    provider: "NONE",
    reason: "EMAIL_NOT_CONFIGURED",
    errorMessage: "RESEND_API_KEY atau konfigurasi SMTP_* belum diatur di server.",
  };
}

