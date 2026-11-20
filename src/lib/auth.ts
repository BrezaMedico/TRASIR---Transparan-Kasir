import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { UserRole } from "./rbac";

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

    // Verify user is still active in database
    const dbUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, username: true, email: true, name: true, role: true, isActive: true },
    });
    if (!dbUser || !dbUser.isActive) return null;

    return {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role as UserRole,
    };
  } catch {
    return null;
  }
}

