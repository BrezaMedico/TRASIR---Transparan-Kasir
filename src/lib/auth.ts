import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "./prisma";
import { ensureSystemBaseline, UserRole } from "./rbac";

export const SESSION_COOKIE_NAME = "trasir_session";

export function resolveSecretString(
  env: Record<string, string | undefined> = process.env
): string {
  const secret = env.AUTH_SECRET?.trim();
  if (env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET wajib diatur minimal 32 karakter di lingkungan produksi.");
    }
    return secret;
  }
  return secret || "trasir_fallback_secret_key_for_dev_and_test_2026";
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(resolveSecretString());
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  isAssigned: boolean;
  roomId: string | null;
  tokenVersion?: number;
}

export interface AssignedSessionUser extends SessionUser {
  isAssigned: true;
  roomId: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    isAssigned: user.isAssigned,
    roomId: user.roomId ?? null,
    tokenVersion: user.tokenVersion ?? 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose) return null;
    if (!payload.sub || !payload.role) return null;
    return {
      id: String(payload.sub),
      username: String(payload.username),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as UserRole,
      isAssigned: payload.isAssigned !== false,
      roomId: typeof payload.roomId === "string" ? payload.roomId : null,
      tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : 1,
    };
  } catch {
    return null;
  }
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    const session = await verifySessionToken(token);
    if (!session) return null;

    await withDbRetry(() => ensureSystemBaseline());

    // Selalu baca status, role, dan keanggotaan ruangan terbaru langsung dari database
    const dbUser = await withDbRetry(() =>
      prisma.user.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          isAssigned: true,
          roomId: true,
          tokenVersion: true,
        },
      })
    );
    if (!dbUser || !dbUser.isActive) return null;
    if (
      typeof session.tokenVersion === "number" &&
      dbUser.tokenVersion !== session.tokenVersion
    ) {
      return null;
    }

    return {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
      isAssigned: Boolean(dbUser.isAssigned && dbUser.roomId),
      roomId: dbUser.roomId,
      tokenVersion: dbUser.tokenVersion,
    };
  } catch {
    return null;
  }
}

export async function requireAssignedUser(): Promise<
  { user: AssignedSessionUser; errorResponse: null } | { user: null; errorResponse: NextResponse }
> {
  const user = await getCurrentSessionUser();
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!user.isAssigned || !user.roomId) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          error:
            "Akun Anda belum tergabung ke ruangan kerja. Silakan bergabung menggunakan kode undangan atau buat ruangan baru terlebih dahulu.",
          code: "UNASSIGNED",
        },
        { status: 403 }
      ),
    };
  }
  return {
    user: { ...user, isAssigned: true, roomId: user.roomId },
    errorResponse: null,
  };
}

export function attachSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export function computePasswordFingerprint(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export async function createEmailChangeToken(params: {
  userId: string;
  currentEmail: string;
  newEmail: string;
  tokenVersion: number;
  code: string;
}): Promise<string> {
  return new SignJWT({
    purpose: "email-change",
    sub: params.userId,
    currentEmail: params.currentEmail,
    newEmail: params.newEmail,
    tokenVersion: params.tokenVersion,
    codeHash: hashVerificationCode(params.code),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecretKey());
}

export async function verifyEmailChangeToken(token: string): Promise<{
  userId: string;
  currentEmail: string;
  newEmail: string;
  tokenVersion: number;
  codeHash: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      payload.purpose !== "email-change" ||
      !payload.sub ||
      typeof payload.currentEmail !== "string" ||
      typeof payload.newEmail !== "string" ||
      typeof payload.tokenVersion !== "number" ||
      typeof payload.codeHash !== "string"
    ) {
      return null;
    }
    return {
      userId: String(payload.sub),
      currentEmail: payload.currentEmail,
      newEmail: payload.newEmail,
      tokenVersion: payload.tokenVersion,
      codeHash: payload.codeHash,
    };
  } catch {
    return null;
  }
}

export async function createPasswordResetToken(params: {
  userId: string;
  email: string;
  tokenVersion: number;
  passwordHash: string;
}): Promise<string> {
  return new SignJWT({
    purpose: "password-reset",
    sub: params.userId,
    email: params.email,
    tokenVersion: params.tokenVersion,
    pwdSig: computePasswordFingerprint(params.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getSecretKey());
}

export async function verifyPasswordResetToken(token: string): Promise<{
  userId: string;
  email: string;
  tokenVersion: number;
  pwdSig: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      payload.purpose !== "password-reset" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.tokenVersion !== "number" ||
      typeof payload.pwdSig !== "string"
    ) {
      return null;
    }
    return {
      userId: String(payload.sub),
      email: payload.email,
      tokenVersion: payload.tokenVersion,
      pwdSig: payload.pwdSig,
    };
  } catch {
    return null;
  }
}
