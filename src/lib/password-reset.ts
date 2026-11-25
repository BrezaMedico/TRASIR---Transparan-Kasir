import { prisma, withDbRetry } from "./prisma";
import { computePasswordFingerprint, verifyPasswordResetToken } from "./auth";

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Validates a single-use password reset JWT against the active user record in the database.
 */
export async function validateResetTokenAgainstDb(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      valid: false as const,
      error: "Tautan reset kata sandi tidak lengkap atau tidak ditemukan.",
    };
  }

  const verified = await verifyPasswordResetToken(trimmed);
  if (!verified) {
    return {
      valid: false as const,
      error: "Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.",
    };
  }

  const user = await withDbRetry(() =>
    prisma.user.findUnique({
      where: { id: verified.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roomId: true,
        isActive: true,
        passwordHash: true,
        tokenVersion: true,
      },
    })
  );

  if (
    !user ||
    !user.isActive ||
    user.email.toLowerCase() !== verified.email.toLowerCase() ||
    user.tokenVersion !== verified.tokenVersion ||
    computePasswordFingerprint(user.passwordHash) !== verified.pwdSig
  ) {
    return {
      valid: false as const,
      error: "Tautan ini sudah pernah digunakan atau tidak lagi berlaku. Silakan minta tautan baru.",
    };
  }

  return { valid: true as const, user, emailMasked: maskEmail(user.email) };
}

