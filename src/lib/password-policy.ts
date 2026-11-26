import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

// Daftar kata sandi umum (>=10 karakter atau sering dipakai di Indonesia/global) yang wajib ditolak.
const COMMON_PASSWORDS = new Set([
  "password123",
  "password1234",
  "password12345",
  "password2024",
  "password2025",
  "password2026",
  "1234567890",
  "12345678901",
  "123456789012",
  "0123456789",
  "9876543210",
  "qwerty1234",
  "qwerty12345",
  "qwertyuiop",
  "qwertyuiop1",
  "admin12345",
  "admin123456",
  "administrator",
  "welcome123",
  "welcome1234",
  "letmein123",
  "iloveyou123",
  "rahasia123",
  "rahasia1234",
  "indonesia1",
  "indonesia123",
  "kasir12345",
  "trasir1234",
  "trasir12345",
  "abc1234567",
  "abcdefghij",
  "0000000000",
  "1111111111",
  "2222222222",
  "9999999999",
]);

export function isCommonOrWeakPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return true;
  }
  // Tolak sandi yang seluruhnya hanya satu karakter diulang (misal "aaaaaaaaaa")
  if (normalized.length >= MIN_PASSWORD_LENGTH && /^(.)\1+$/.test(normalized)) {
    return true;
  }
  return false;
}

export const strongPasswordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter.`
  )
  .refine(
    (val) => !isCommonOrWeakPassword(val),
    "Kata sandi terlalu umum atau mudah ditebak. Gunakan kombinasi yang lebih unik."
  );

export function isPasswordPolicyCompliant(plainPassword: string): boolean {
  return strongPasswordSchema.safeParse(plainPassword).success;
}

