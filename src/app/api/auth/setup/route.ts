import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  attachSessionCookie,
  createSessionToken,
  getCurrentSessionUser,
  hashPassword,
} from "@/lib/auth";
import {
  DEFAULT_ROOM_ID,
  ensureSystemBaseline,
  getDefaultRedirectForRole,
  getRolePermissionsMap,
  isStoreAdmin,
  seedRoomDefaults,
  UserRole,
  validateUsername,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const firstSetupSchema = z.object({
  name: z.string().min(2, "Nama lengkap minimal 2 karakter"),
  username: z.string().min(3, "Username minimal 3 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Kata sandi minimal 6 karakter"),
  storeName: z.string().min(2, "Nama ruangan / toko minimal 2 karakter").optional(),
  storeAddress: z.string().optional(),
});

const authenticatedSetupSchema = z.object({
  storeName: z.string().trim().min(2, "Nama ruangan / toko minimal 2 karakter"),
  storeAddress: z.string().trim().optional(),
});

export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const assignedAdminCount = await prisma.user.count({
      where: {
        role: { in: ["PEMILIK", "MANAJER"] },
        isActive: true,
        isAssigned: true,
        roomId: { not: null },
      },
    });

    if (assignedAdminCount > 0) {
      return NextResponse.json(
        { error: "Sistem sudah diinisialisasi. Gunakan halaman pendaftaran untuk membuat ruangan baru atau bergabung." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const existingSession = await getCurrentSessionUser();

    // Jalur 1: Admin yang sudah login namun belum memiliki ruangan
    if (existingSession && isStoreAdmin(existingSession.role) && !existingSession.isAssigned) {
      const parsed = authenticatedSetupSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Nama ruangan tidak valid." },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const room = await tx.room.upsert({
          where: { id: DEFAULT_ROOM_ID },
          update: {
            name: parsed.data.storeName.trim(),
            ...(parsed.data.storeAddress ? { address: parsed.data.storeAddress.trim() } : {}),
          },
          create: {
            id: DEFAULT_ROOM_ID,
            name: parsed.data.storeName.trim(),
            address: parsed.data.storeAddress?.trim() || "Indonesia",
            toleranceThresholdRp: 50000,
            opnameSchedule: "MINGGUAN",
          },
        });
        await seedRoomDefaults(tx, room.id);

        const updatedUser = await tx.user.update({
          where: { id: existingSession.id },
          data: { isAssigned: true, role: "PEMILIK", roomId: room.id },
        });

        await tx.systemSetting.upsert({
          where: { id: "default" },
          update: {
            storeName: room.name,
            storeAddress: room.address,
          },
          create: {
            id: "default",
            storeName: room.name,
            storeAddress: room.address,
            toleranceThresholdRp: 50000,
            opnameSchedule: "MINGGUAN",
          },
        });

        await recordAuditLog(
          {
            roomId: room.id,
            actorId: updatedUser.id,
            actorName: updatedUser.name,
            actorRole: updatedUser.role,
            actionType: "ROOM_CREATED",
            actionSummary: `Inisialisasi ruangan "${room.name}" oleh ${updatedUser.name} (${updatedUser.role})`,
            entityType: "Room",
            entityId: room.id,
            afterData: { storeName: room.name },
            approvalState: "DISETUJUI",
            linkUrl: "/dashboard",
          },
          tx
        );

        return { updatedUser, room };
      });

      const sessionUser = {
        id: result.updatedUser.id,
        username: result.updatedUser.username,
        email: result.updatedUser.email,
        name: result.updatedUser.name,
        role: result.updatedUser.role as UserRole,
        isAssigned: true,
        roomId: result.room.id,
        tokenVersion: result.updatedUser.tokenVersion,
      };
      const token = await createSessionToken(sessionUser);
      const permissions = await getRolePermissionsMap(sessionUser.role);
      const redirectTo = getDefaultRedirectForRole(sessionUser.role, true);

      const res = NextResponse.json({
        user: sessionUser,
        room: result.room,
        permissions,
        redirectTo,
      });
      attachSessionCookie(res, token);
      return res;
    }

    // Jalur 2: Inisialisasi perdana ketika belum ada akun terdaftar
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        {
          error:
            "Sistem sudah memiliki akun terdaftar. Silakan masuk atau daftar melalui halaman registrasi.",
        },
        { status: 403 }
      );
    }

    const parsed = firstSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const usernameCheck = validateUsername(parsed.data.username);
    if (!usernameCheck.valid) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 400 });
    }

    const { name, email, password, storeName, storeAddress } = parsed.data;
    const passwordHash = await hashPassword(password);
    const resolvedRoomName = storeName?.trim() || "TRASIR Toko Utama";
    const resolvedAddress = storeAddress?.trim() || "Indonesia";

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.upsert({
        where: { id: DEFAULT_ROOM_ID },
        update: {
          name: resolvedRoomName,
          address: resolvedAddress,
        },
        create: {
          id: DEFAULT_ROOM_ID,
          name: resolvedRoomName,
          address: resolvedAddress,
          toleranceThresholdRp: 50000,
          opnameSchedule: "MINGGUAN",
        },
      });
      await seedRoomDefaults(tx, room.id);

      const user = await tx.user.create({
        data: {
          name: name.trim(),
          username: usernameCheck.normalized,
          email: email.trim().toLowerCase(),
          passwordHash,
          role: "PEMILIK",
          isActive: true,
          isAssigned: true,
          roomId: room.id,
          lastLoginAt: new Date(),
        },
      });

      await tx.systemSetting.upsert({
        where: { id: "default" },
        update: {
          storeName: resolvedRoomName,
          storeAddress: resolvedAddress,
        },
        create: {
          id: "default",
          storeName: resolvedRoomName,
          storeAddress: resolvedAddress,
          toleranceThresholdRp: 50000,
          opnameSchedule: "MINGGUAN",
        },
      });

      await recordAuditLog(
        {
          roomId: room.id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "PEMILIK",
          actionType: "LOGIN",
          actionSummary: `Inisialisasi ruangan pertama "${room.name}" & pembuatan akun PEMILIK (${user.username})`,
          entityType: "User",
          entityId: user.id,
          afterData: { username: user.username, email: user.email, role: "PEMILIK", roomId: room.id },
          approvalState: "DISETUJUI",
          linkUrl: "/pengguna",
        },
        tx
      );

      return { user, room };
    });

    const sessionUser = {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      name: result.user.name,
      role: "PEMILIK" as UserRole,
      isAssigned: true,
      roomId: result.room.id,
      tokenVersion: result.user.tokenVersion,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = await getRolePermissionsMap("PEMILIK");
    const redirectTo = getDefaultRedirectForRole("PEMILIK", true);

    const res = NextResponse.json({
      user: sessionUser,
      room: result.room,
      permissions,
      redirectTo,
    });

    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal melakukan inisialisasi sistem.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
