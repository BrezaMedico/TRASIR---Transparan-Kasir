import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "./prisma";
import { ensureSystemBaseline, UserRole } from "./rbac";

export const SESSION_COOKIE_NAME = "trasir_session";

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || "trasir_fallback_secret_key_for_dev_and_test_2026";
  return new TextEncoder().encode(secret);
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
    const { payload } = await jwtVerify(token, getSecretKey());
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
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}
