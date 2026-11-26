import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie, createSessionToken, hashPassword } from "@/lib/auth";
import {
  ensureSystemBaseline,
  formatRoleLabel,
  getDefaultRedirectForRole,
  getRolePermissionsMap,
  normalizeInviteCode,
  seedRoomDefaults,
  UserRole,
  validateUsername,
} from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { buildInitialCounters } from "@/lib/counters";
import { saveRoomCounters } from "@/lib/queries/counters";
import { z } from "zod";

const registerBaseSchema = z.object({
  mode: z.enum(["CREATE_ROOM", "JOIN_ROOM"], {
    error: "Pilih jalur pendaftaran: Buat Ruangan Baru atau Gabung ke Ruangan.",
  }),
  name: z.string().trim().min(2, "Nama lengkap minimal 2 karakter"),
  username: z.string().min(1, "Username wajib diisi"),
  email: z.string().trim().email("Format email tidak valid").optional().or(z.literal("")),
  password: z.string().min(6, "Kata sandi minimal 6 karakter"),
  roomName: z.string().trim().optional().or(z.literal("")),
  roomAddress: z.string().trim().optional().or(z.literal("")),
  inviteCode: z.string().trim().optional().or(z.literal("")),
  counterNames: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  counterCount: z.number().int().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    await ensureSystemBaseline();
    const rawBody = await request.json();

    // Proteksi tegas: pengguna TIDAK BOLEH menentukan atau menaikkan role sendiri saat registrasi
    if (
      rawBody &&
      typeof rawBody === "object" &&
      ("role" in rawBody || "registerRole" in rawBody || "assignedRole" in rawBody)
    ) {
      return NextResponse.json(
        {
          error:
            "Pengguna tidak dapat menentukan atau meningkatkan role sendiri saat registrasi. Pilih Buat Ruangan Baru atau Gabung ke Ruangan menggunakan kode undangan.",
        },
        { status: 403 }
      );
    }

    const parsed = registerBaseSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data pendaftaran tidak valid." },
        { status: 400 }
      );
    }

    const usernameCheck = validateUsername(parsed.data.username);
    if (!usernameCheck.valid) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 400 });
    }

    const normalizedUsername = usernameCheck.normalized;
    const normalizedEmail = parsed.data.email
      ? parsed.data.email.trim().toLowerCase()
      : `${normalizedUsername}@akun.trasir.local`;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username: normalizedUsername }, { email: normalizedEmail }],
      },
      select: { username: true, email: true },
    });

    if (existing) {
      const msg =
        existing.username === normalizedUsername
          ? "Username sudah digunakan. Pilih username lain."
          : "Email sudah terdaftar pada akun lain.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();

    // ALUR 1: BUAT RUANGAN BARU -> Otomatis menjadi PEMILIK ruangan
    if (parsed.data.mode === "CREATE_ROOM") {
      const roomName = (parsed.data.roomName || "").trim();
      if (roomName.length < 2) {
        return NextResponse.json(
          { error: "Nama ruangan / usaha wajib diisi minimal 2 karakter." },
          { status: 400 }
        );
      }
      const roomAddress = (parsed.data.roomAddress || "").trim() || "Indonesia";

      const initialCounters = buildInitialCounters({
        counterNames: parsed.data.counterNames,
        counterCount: parsed.data.counterCount,
      });

      const result = await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: {
            name: roomName,
            address: roomAddress,
            toleranceThresholdRp: 50000,
            opnameSchedule: "MINGGUAN",
          },
        });

        await seedRoomDefaults(tx, room.id);
        await saveRoomCounters(room.id, initialCounters, room.name, tx);

        const created = await tx.user.create({
          data: {
            name: parsed.data.name.trim(),
            username: normalizedUsername,
            email: normalizedEmail,
            passwordHash,
            role: "PEMILIK",
            isActive: true,
            isAssigned: true,
            roomId: room.id,
            lastLoginAt: now,
          },
        });

        await recordAuditLog(
          {
            roomId: room.id,
            actorId: created.id,
            actorName: created.name,
            actorRole: "PEMILIK",
            actionType: "ROOM_CREATED",
            actionSummary: `${created.name} (@${created.username}) membuat ruangan baru "${room.name}" dengan ${initialCounters.length} loket dan ditetapkan otomatis sebagai PEMILIK`,
            entityType: "Room",
            entityId: room.id,
            afterData: {
              roomId: room.id,
              roomName: room.name,
              ownerUsername: created.username,
              role: "PEMILIK",
              counters: initialCounters.map((c) => c.name),
            },
            approvalState: "DISETUJUI",
            linkUrl: "/dashboard",
          },
          tx
        );

        return { created, room };
      });

      const sessionUser = {
        id: result.created.id,
        username: result.created.username,
        email: result.created.email,
        name: result.created.name,
        role: "PEMILIK" as UserRole,
        isAssigned: true,
        roomId: result.room.id,
        tokenVersion: result.created.tokenVersion,
      };

      const token = await createSessionToken(sessionUser);
      const permissions = await getRolePermissionsMap("PEMILIK");
      const res = NextResponse.json(
        {
          user: sessionUser,
          room: { id: result.room.id, name: result.room.name, address: result.room.address },
          counters: initialCounters,
          permissions,
          redirectTo: "/dashboard",
        },
        { status: 201 }
      );
      attachSessionCookie(res, token);
      return res;
    }

    // ALUR 2: GABUNG KE RUANGAN YANG SUDAH ADA -> Wajib undangan valid & role mengikuti pengundang
    const rawInviteCode = (parsed.data.inviteCode || "").trim();
    if (!rawInviteCode) {
      return NextResponse.json(
        { error: "Kode undangan wajib diisi untuk bergabung ke ruangan." },
        { status: 400 }
      );
    }

    const code = normalizeInviteCode(rawInviteCode);

    const joinResult = await prisma.$transaction(async (tx) => {
      const invitation = await tx.storeInvitation.findUnique({
        where: { code },
        include: {
          room: { select: { id: true, name: true, address: true } },
          invitedBy: { select: { id: true, name: true, username: true, role: true } },
        },
      });

      if (!invitation || !invitation.roomId || !invitation.room) {
        throw new Error("NOT_FOUND:Kode undangan tidak ditemukan atau tidak valid.");
      }

      if (invitation.status === "REVOKED") {
        throw new Error("INVALID:Kode undangan ini sudah dicabut oleh pengelola ruangan.");
      }

      if (invitation.status === "ACCEPTED") {
        throw new Error("INVALID:Kode undangan ini sudah pernah digunakan.");
      }

      if (invitation.status !== "PENDING") {
        throw new Error(`INVALID:Kode undangan tidak dapat digunakan (status: ${invitation.status}).`);
      }

      if (invitation.expiresAt <= now) {
        await tx.storeInvitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
        throw new Error(
          "EXPIRED:Kode undangan sudah kedaluwarsa. Minta kode undangan baru ke Pemilik atau Manajer ruangan."
        );
      }

      // Jika undangan ditujukan ke username tertentu, pastikan cocok
      if (invitation.targetUsername && invitation.targetUsername !== normalizedUsername) {
        throw new Error(
          `FORBIDDEN:Kode undangan ini khusus untuk username @${invitation.targetUsername}.`
        );
      }

      // Pastikan role dari undangan adalah salah satu role yang valid (tidak pernah PEMILIK)
      const allowedJoinRoles: UserRole[] = ["KASIR", "GUDANG", "KASIR_GUDANG", "MANAJER"];
      const assignedRole = invitation.assignedRole as UserRole;
      if (!allowedJoinRoles.includes(assignedRole)) {
        throw new Error("INVALID:Role pada undangan tidak valid.");
      }

      const created = await tx.user.create({
        data: {
          name: parsed.data.name.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          role: assignedRole,
          isActive: true,
          isAssigned: true,
          roomId: invitation.roomId,
          lastLoginAt: now,
        },
      });

      await tx.storeInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          targetUserId: created.id,
          targetUsername: created.username,
          respondedAt: now,
        },
      });

      await recordAuditLog(
        {
          roomId: invitation.roomId,
          actorId: created.id,
          actorName: created.name,
          actorRole: assignedRole,
          actionType: "INVITATION_ACCEPTED",
          actionSummary: `@${created.username} bergabung ke ruangan "${invitation.room.name}" menggunakan kode undangan dari ${invitation.invitedBy.name} sebagai ${assignedRole}`,
          entityType: "StoreInvitation",
          entityId: invitation.id,
          afterData: {
            roomId: invitation.roomId,
            username: created.username,
            role: assignedRole,
            inviteCode: invitation.code,
          },
          approvalState: "DISETUJUI",
          linkUrl: "/pengguna",
        },
        tx
      );

      await createNotification(
        {
          roomId: invitation.roomId,
          title: `Anggota Baru Bergabung (@${created.username})`,
          message: `${created.name} bergabung ke ruangan "${invitation.room.name}" sebagai ${formatRoleLabel(assignedRole)}.`,
          severity: "INFO",
          category: "SISTEM",
          targetRole: null,
          linkUrl: "/pengguna",
        },
        tx
      );

      return { created, room: invitation.room };
    });

    const role = joinResult.created.role as UserRole;
    const sessionUser = {
      id: joinResult.created.id,
      username: joinResult.created.username,
      email: joinResult.created.email,
      name: joinResult.created.name,
      role,
      isAssigned: true,
      roomId: joinResult.room.id,
      tokenVersion: joinResult.created.tokenVersion,
    };

    const token = await createSessionToken(sessionUser);
    const permissions = await getRolePermissionsMap(role);
    const redirectTo = getDefaultRedirectForRole(role, true);

    const res = NextResponse.json(
      {
        user: sessionUser,
        room: joinResult.room,
        permissions,
        redirectTo,
      },
      { status: 201 }
    );
    attachSessionCookie(res, token);
    return res;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal mendaftarkan akun baru.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("INVALID:") || rawMsg.startsWith("EXPIRED:")) {
      return NextResponse.json(
        { error: rawMsg.replace(/^(INVALID|EXPIRED):/, "") },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}
