import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentSessionUser, requireAssignedUser } from "@/lib/auth";
import {
  formatRoleLabel,
  generateInviteCode,
  isStoreAdmin,
  validateUsername,
} from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 40;

function isRateLimited(actorId: string): boolean {
  return checkRateLimit(`invite:${actorId}`, RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS)
    .limited;
}

const createInvitationSchema = z.object({
  inviteType: z.enum(["CODE", "USERNAME"]).optional(),
  username: z.string().trim().optional().or(z.literal("")),
  assignedRole: z.enum(["MANAJER", "KASIR", "GUDANG", "KASIR_GUDANG"], {
    error: "Role undangan harus Kasir, Gudang, Kasir + Gudang, atau Manajer.",
  }),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Pemilik / Manajer aktif melihat seluruh undangan ruangan mereka sendiri
    if (user.isAssigned && user.roomId && isStoreAdmin(user.role)) {
      await withDbRetry(() =>
        prisma.storeInvitation.updateMany({
          where: {
            roomId: user.roomId,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED" },
        })
      );

      const invitations = await withDbRetry(() =>
        prisma.storeInvitation.findMany({
          where: { roomId: user.roomId },
          include: {
            targetUser: {
              select: { id: true, name: true, username: true, role: true, isAssigned: true },
            },
            invitedBy: {
              select: { id: true, name: true, username: true, role: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      );

      return NextResponse.json({ mode: "OUTGOING", invitations });
    }

    // Pengguna belum tergabung melihat kotak masuk undangan miliknya
    if (!user.isAssigned || !user.roomId) {
      await withDbRetry(() =>
        prisma.storeInvitation.updateMany({
          where: {
            targetUserId: user.id,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED" },
        })
      );

      const invitations = await withDbRetry(() =>
        prisma.storeInvitation.findMany({
          where: { targetUserId: user.id },
          include: {
            invitedBy: {
              select: { id: true, name: true, username: true, role: true },
            },
            room: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      );

      return NextResponse.json({ mode: "INCOMING", invitations });
    }

    return NextResponse.json(
      {
        error:
          "Hanya Pemilik, Manajer, atau akun yang menunggu undangan yang dapat mengakses daftar undangan.",
      },
      { status: 403 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar undangan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat membuat undangan ruangan." },
        { status: 403 }
      );
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan undangan dalam 1 menit. Coba beberapa saat lagi." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Tolak secara tegas percobaan membuat undangan ber-role PEMILIK
    if (body && typeof body === "object" && String(body.assignedRole) === "PEMILIK") {
      return NextResponse.json(
        { error: "Role Pemilik tidak dapat diberikan melalui tautan/kode undangan." },
        { status: 403 }
      );
    }

    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data undangan tidak valid." },
        { status: 400 }
      );
    }

    const hasUsername = Boolean(parsed.data.username && parsed.data.username.trim().length > 0);
    const mode = parsed.data.inviteType || (hasUsername ? "USERNAME" : "CODE");
    const ttlMs = (parsed.data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlMs || INVITE_TTL_MS));

    const room = await prisma.room.findUnique({ where: { id: user.roomId } });
    const roomName = room?.name ?? "TRASIR Ruangan Kerja";

    // Jalur 1: Undangan Kode / Tautan Terbuka (untuk pendaftar baru atau akun yang belum tergabung)
    if (mode === "CODE" && !hasUsername) {
      let inviteCode = generateInviteCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await prisma.storeInvitation.findUnique({
          where: { code: inviteCode },
          select: { id: true },
        });
        if (!exists) break;
        inviteCode = generateInviteCode();
      }

      const invitation = await prisma.$transaction(async (tx) => {
        const created = await tx.storeInvitation.create({
          data: {
            roomId: user.roomId,
            storeName: roomName,
            code: inviteCode,
            targetUserId: null,
            targetUsername: null,
            invitedById: user.id,
            assignedRole: parsed.data.assignedRole,
            status: "PENDING",
            expiresAt,
          },
          include: {
            targetUser: {
              select: { id: true, name: true, username: true, role: true, isAssigned: true },
            },
            invitedBy: {
              select: { id: true, name: true, username: true, role: true },
            },
          },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "INVITATION_CREATED",
            actionSummary: `${user.name} membuat kode undangan ${inviteCode} untuk ruangan "${roomName}" sebagai ${formatRoleLabel(parsed.data.assignedRole)}`,
            entityType: "StoreInvitation",
            entityId: created.id,
            afterData: {
              roomId: user.roomId,
              code: inviteCode,
              assignedRole: parsed.data.assignedRole,
              status: "PENDING",
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/pengguna",
          },
          tx
        );

        return created;
      });

      return NextResponse.json(
        {
          invitation,
          inviteCode: invitation.code,
          invitePath: `/register?invite=${encodeURIComponent(invitation.code || "")}`,
        },
        { status: 201 }
      );
    }

    // Jalur 2: Undangan Khusus ke Username Terdaftar (sekaligus menghasilkan kode undangan)
    const usernameCheck = validateUsername(parsed.data.username || "");
    if (!usernameCheck.valid) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 400 });
    }
    const normalizedUsername = usernameCheck.normalized;

    const targetUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        isAssigned: true,
        roomId: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "Username tidak ditemukan. Gunakan mode Kode & Tautan Undangan agar calon pegawai dapat mendaftar langsung.",
        },
        { status: 404 }
      );
    }

    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: "Akun target sedang dinonaktifkan sehingga tidak dapat diundang." },
        { status: 400 }
      );
    }

    if (targetUser.isAssigned && targetUser.roomId) {
      return NextResponse.json(
        {
          error:
            targetUser.roomId === user.roomId
              ? "Pengguna ini sudah bergabung di ruangan Anda. Gunakan fitur Ubah Role pada daftar anggota tim."
              : "Pengguna ini sudah tergabung di ruangan lain.",
        },
        { status: 409 }
      );
    }

    let inviteCode = generateInviteCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.storeInvitation.findUnique({
        where: { code: inviteCode },
        select: { id: true },
      });
      if (!exists) break;
      inviteCode = generateInviteCode();
    }

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.storeInvitation.updateMany({
        where: {
          roomId: user.roomId,
          targetUserId: targetUser.id,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });

      const duplicatePending = await tx.storeInvitation.findFirst({
        where: {
          roomId: user.roomId,
          targetUserId: targetUser.id,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      });

      if (duplicatePending) {
        throw new Error("CONFLICT:Undangan untuk username ini masih menunggu tanggapan.");
      }

      const created = await tx.storeInvitation.create({
        data: {
          roomId: user.roomId,
          storeName: roomName,
          code: inviteCode,
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          invitedById: user.id,
          assignedRole: parsed.data.assignedRole,
          status: "PENDING",
          expiresAt,
        },
        include: {
          targetUser: {
            select: { id: true, name: true, username: true, role: true, isAssigned: true },
          },
          invitedBy: {
            select: { id: true, name: true, username: true, role: true },
          },
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "INVITATION_CREATED",
          actionSummary: `${user.name} mengundang @${targetUser.username} ke ruangan "${roomName}" sebagai ${formatRoleLabel(parsed.data.assignedRole)}`,
          entityType: "StoreInvitation",
          entityId: created.id,
          afterData: {
            roomId: user.roomId,
            code: inviteCode,
            targetUserId: targetUser.id,
            targetUsername: targetUser.username,
            assignedRole: parsed.data.assignedRole,
            status: "PENDING",
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: "/pengguna",
        },
        tx
      );

      await createNotification(
        {
          roomId: user.roomId,
          title: `Undangan Bergabung ke ${roomName}`,
          message: `${user.name} mengundang Anda bergabung sebagai ${formatRoleLabel(parsed.data.assignedRole)}.`,
          severity: "INFO",
          category: "SISTEM",
          userId: targetUser.id,
          linkUrl: "/menunggu-undangan",
        },
        tx
      );

      return created;
    });

    return NextResponse.json(
      {
        invitation,
        inviteCode: invitation.code,
        invitePath: `/register?invite=${encodeURIComponent(invitation.code || "")}`,
      },
      { status: 201 }
    );
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal membuat undangan.";
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}
