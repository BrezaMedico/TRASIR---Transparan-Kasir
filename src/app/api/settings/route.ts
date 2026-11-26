import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  attachSessionCookie,
  createSessionToken,
  hashPassword,
  requireAssignedUser,
  verifyPassword,
} from "@/lib/auth";
import {
  DEFAULT_ROOM_ID,
  ensureSystemBaseline,
  hasMinimumRemainingOwners,
  isStoreAdmin,
  seedRoomDefaults,
  validateRoleManagementAction,
  validateUsername,
  type UserRole,
} from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    await ensureSystemBaseline();
    await seedRoomDefaults(prisma, user.roomId);
    const isOwner = isStoreAdmin(user.role);

    const [users, rolePermissions, room] = await Promise.all([
      isOwner
        ? prisma.user.findMany({
            where: { roomId: user.roomId, isAssigned: true },
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : prisma.user.findMany({
            where: { id: user.id },
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
          }),
      prisma.rolePermission.findMany({
        orderBy: [{ role: "asc" }, { module: "asc" }],
      }),
      prisma.room.findUnique({ where: { id: user.roomId } }),
    ]);

    const [units, categories, warehouses] = await Promise.all([
      prisma.unit.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] }),
      prisma.category.findMany({ where: { roomId: user.roomId }, orderBy: { name: "asc" } }),
      prisma.warehouse.findMany({ where: { roomId: user.roomId }, orderBy: { name: "asc" } }),
    ]);

    const settings = room
      ? {
          id: room.id,
          storeName: room.name,
          storeAddress: room.address,
          toleranceThresholdRp: room.toleranceThresholdRp,
          opnameSchedule: room.opnameSchedule,
          openAreaPolicy: room.openAreaPolicy,
          closedAreaPolicy: room.closedAreaPolicy,
          autoBackupInterval: room.autoBackupInterval,
          lastBackupAt: room.lastBackupAt,
        }
      : null;

    return NextResponse.json({
      users,
      rolePermissions,
      settings,
      units,
      categories,
      warehouses,
      isOwner,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat pengaturan sistem.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();
    const isOwner = isStoreAdmin(user.role);

    // 1. CREATE STAFF USER (Pemilik / Manajer — dengan perlindungan role Pemilik)
    if (body.action === "CREATE_USER") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat menambahkan akun pegawai baru." },
          { status: 403 }
        );
      }

      const schema = z.object({
        name: z.string().trim().min(2, "Nama minimal 2 karakter"),
        username: z.string().min(3, "Username minimal 3 karakter"),
        email: z.string().trim().email("Format email tidak valid"),
        password: z.string().min(6, "Kata sandi minimal 6 karakter"),
        role: z.enum(["PEMILIK", "MANAJER", "KASIR", "GUDANG", "KASIR_GUDANG"]),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data akun tidak valid" },
          { status: 400 }
        );
      }

      const guard = validateRoleManagementAction({
        actorRole: user.role,
        targetNextRole: parsed.data.role,
        action: "CREATE_USER",
      });
      if (!guard.allowed) {
        return NextResponse.json({ error: guard.error }, { status: guard.status ?? 403 });
      }

      const unameCheck = validateUsername(parsed.data.username);
      if (!unameCheck.valid) {
        return NextResponse.json({ error: unameCheck.error }, { status: 400 });
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const created = await prisma.user.create({
        data: {
          name: parsed.data.name.trim(),
          username: unameCheck.normalized,
          email: parsed.data.email.trim().toLowerCase(),
          passwordHash,
          role: parsed.data.role,
          isActive: true,
          isAssigned: true,
          roomId: user.roomId,
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "HAK_AKSES",
        actionSummary: `Menambahkan akun pegawai baru: ${created.name} (@${created.username}) sebagai ${created.role}`,
        entityType: "User",
        entityId: created.id,
        afterData: created,
        approvalState: "DISETUJUI",
        linkUrl: "/pengaturan",
      });

      return NextResponse.json({ user: created });
    }

    // 2. TOGGLE USER ACTIVE OR UPDATE ROLE (dengan proteksi akun Pemilik & anti-lockout Pemilik terakhir)
    if (body.action === "UPDATE_USER") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat mengubah status atau jabatan akun." },
          { status: 403 }
        );
      }

      const targetId = String(body.userId || "");
      const targetUser = await prisma.user.findFirst({
        where: { id: targetId, roomId: user.roomId },
      });
      if (!targetUser) {
        return NextResponse.json(
          { error: "Akun tidak ditemukan pada ruangan ini." },
          { status: 404 }
        );
      }

      const validRoles = ["PEMILIK", "MANAJER", "KASIR", "GUDANG", "KASIR_GUDANG"];
      const nextRole = body.role ? String(body.role) : targetUser.role;
      if (!validRoles.includes(nextRole)) {
        return NextResponse.json({ error: "Role tidak valid." }, { status: 400 });
      }
      const nextIsActive =
        typeof body.isActive === "boolean" ? body.isActive : targetUser.isActive;

      const guard = validateRoleManagementAction({
        actorRole: user.role,
        targetCurrentRole: targetUser.role,
        targetNextRole: nextRole,
        action: nextIsActive ? "CHANGE_ROLE" : "DEACTIVATE",
      });
      if (!guard.allowed) {
        return NextResponse.json({ error: guard.error }, { status: guard.status ?? 403 });
      }

      const activeOwnerCount = await prisma.user.count({
        where: {
          roomId: user.roomId,
          role: "PEMILIK",
          isActive: true,
          isAssigned: true,
        },
      });
      const targetIsActiveOwner =
        targetUser.isActive && targetUser.isAssigned && targetUser.role === "PEMILIK";
      const nextIsActiveOwner =
        nextIsActive && targetUser.isAssigned && nextRole === "PEMILIK";

      if (!hasMinimumRemainingOwners(activeOwnerCount, targetIsActiveOwner, nextIsActiveOwner)) {
        return NextResponse.json(
          {
            error:
              "Tidak dapat mengubah role atau menonaktifkan satu-satunya Pemilik aktif pada ruangan ini.",
          },
          { status: 400 }
        );
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data: {
          role: nextRole,
          isActive: nextIsActive,
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "HAK_AKSES",
        actionSummary: `Memperbarui akun ${updated.name}: Jabatan=${updated.role}, Aktif=${updated.isActive}`,
        entityType: "User",
        entityId: updated.id,
        beforeData: { role: targetUser.role, isActive: targetUser.isActive },
        afterData: { role: updated.role, isActive: updated.isActive },
        approvalState: "DISETUJUI",
        linkUrl: "/pengaturan",
      });

      return NextResponse.json({ user: updated });
    }

    // 3. UPDATE RBAC PERMISSION MATRIX (Ditutup: kebijakan RBAC bersifat global)
    if (body.action === "UPDATE_PERMISSIONS") {
      return NextResponse.json(
        {
          error:
            "Matriks hak akses dikelola oleh kebijakan sistem terpusat dan tidak dapat diubah per ruangan.",
        },
        { status: 403 }
      );
    }

    // 4. UPDATE ROOM & AUDIT SETTINGS (Pemilik / Manajer)
    if (body.action === "UPDATE_AUDIT_SETTINGS") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat mengubah pengaturan ruangan & audit." },
          { status: 403 }
        );
      }

      const auditSettingsSchema = z.object({
        storeName: z.string().trim().min(2, "Nama perusahaan minimal 2 karakter").max(120).optional(),
        storeAddress: z.string().trim().max(250).optional(),
        toleranceThresholdRp: z.number().finite().min(0).max(1_000_000_000).optional(),
        opnameSchedule: z.enum(["HARIAN", "MINGGUAN", "BULANAN"]).optional(),
        openAreaPolicy: z.string().trim().max(500).optional(),
        closedAreaPolicy: z.string().trim().max(500).optional(),
        autoBackupInterval: z.enum(["HARIAN", "MINGGUAN", "NONAKTIF"]).optional(),
      });
      const parsedSettings = auditSettingsSchema.safeParse(body);
      if (!parsedSettings.success) {
        return NextResponse.json(
          { error: parsedSettings.error.issues[0]?.message || "Data pengaturan ruangan tidak valid." },
          { status: 400 }
        );
      }
      const settingsData = parsedSettings.data;

      const prev = await prisma.room.findUnique({ where: { id: user.roomId } });
      const updatedRoom = await prisma.room.update({
        where: { id: user.roomId },
        data: {
          name: settingsData.storeName ? settingsData.storeName : prev?.name,
          address: settingsData.storeAddress !== undefined && settingsData.storeAddress !== "" ? settingsData.storeAddress : prev?.address,
          toleranceThresholdRp:
            typeof settingsData.toleranceThresholdRp === "number"
              ? Math.max(0, Math.round(settingsData.toleranceThresholdRp))
              : prev?.toleranceThresholdRp ?? 50000,
          opnameSchedule: settingsData.opnameSchedule || prev?.opnameSchedule,
          openAreaPolicy: settingsData.openAreaPolicy || prev?.openAreaPolicy,
          closedAreaPolicy: settingsData.closedAreaPolicy || prev?.closedAreaPolicy,
          autoBackupInterval: settingsData.autoBackupInterval || prev?.autoBackupInterval,
        },
      });

      if (user.roomId === DEFAULT_ROOM_ID) {
        await prisma.systemSetting
          .upsert({
            where: { id: "default" },
            update: {
              storeName: updatedRoom.name,
              storeAddress: updatedRoom.address,
              toleranceThresholdRp: updatedRoom.toleranceThresholdRp,
              opnameSchedule: updatedRoom.opnameSchedule,
              openAreaPolicy: updatedRoom.openAreaPolicy,
              closedAreaPolicy: updatedRoom.closedAreaPolicy,
              autoBackupInterval: updatedRoom.autoBackupInterval,
            },
            create: {
              id: "default",
              storeName: updatedRoom.name,
              storeAddress: updatedRoom.address,
              toleranceThresholdRp: updatedRoom.toleranceThresholdRp,
              opnameSchedule: updatedRoom.opnameSchedule,
            },
          })
          .catch(() => undefined);
      }

      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "PENGATURAN",
        actionSummary: `Memperbarui profil ruangan "${updatedRoom.name}" & batas toleransi selisih stok Rp ${updatedRoom.toleranceThresholdRp}`,
        entityType: "Room",
        entityId: updatedRoom.id,
        beforeData: prev,
        afterData: updatedRoom,
        approvalState: "DISETUJUI",
        linkUrl: "/pengaturan",
      });

      return NextResponse.json({
        settings: {
          id: updatedRoom.id,
          storeName: updatedRoom.name,
          storeAddress: updatedRoom.address,
          toleranceThresholdRp: updatedRoom.toleranceThresholdRp,
          opnameSchedule: updatedRoom.opnameSchedule,
          openAreaPolicy: updatedRoom.openAreaPolicy,
          closedAreaPolicy: updatedRoom.closedAreaPolicy,
          autoBackupInterval: updatedRoom.autoBackupInterval,
          lastBackupAt: updatedRoom.lastBackupAt,
        },
      });
    }

    // 5. CREATE MASTER UNIT / CATEGORY / WAREHOUSE
    if (body.action === "CREATE_UNIT") {
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const unitSchema = z.object({
        name: z.string().trim().min(1, "Nama satuan wajib diisi").max(30),
        label: z.string().trim().min(1).max(60).optional(),
        group: z.enum(["BERAT", "VOLUME", "PANJANG", "HITUNGAN"]).optional(),
      });
      const parsedUnit = unitSchema.safeParse(body);
      if (!parsedUnit.success) {
        return NextResponse.json(
          { error: parsedUnit.error.issues[0]?.message || "Data satuan tidak valid." },
          { status: 400 }
        );
      }
      const unit = await prisma.unit.create({
        data: {
          name: parsedUnit.data.name.toLowerCase(),
          label: parsedUnit.data.label || parsedUnit.data.name,
          group: parsedUnit.data.group || "HITUNGAN",
        },
      });
      return NextResponse.json({ unit });
    }

    if (body.action === "CREATE_CATEGORY") {
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const category = await prisma.category.create({
        data: {
          roomId: user.roomId,
          name: String(body.name).trim(),
          areaType: body.areaType === "TERTUTUP" ? "TERTUTUP" : "TERBUKA",
          description: body.description ? String(body.description).trim() : null,
        },
      });
      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "PENGATURAN",
        actionSummary: `Menambahkan kategori barang "${category.name}" (Mode Area: ${category.areaType})`,
        entityType: "Category",
        entityId: category.id,
        afterData: category,
        approvalState: "DISETUJUI",
        linkUrl: "/pengaturan",
      });
      return NextResponse.json({ category });
    }

    if (body.action === "CREATE_WAREHOUSE") {
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const warehouse = await prisma.warehouse.create({
        data: {
          roomId: user.roomId,
          name: String(body.name).trim(),
          location: body.location ? String(body.location).trim() : null,
        },
      });
      return NextResponse.json({ warehouse });
    }

    // 6. UPDATE OWN PROFILE & PASSWORD
    if (body.action === "UPDATE_PROFILE") {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) {
        return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};
      if (body.name && String(body.name).trim().length >= 2) {
        updateData.name = String(body.name).trim().slice(0, 120);
      }

      let passwordChanged = false;
      if (body.newPassword) {
        if (!body.currentPassword) {
          return NextResponse.json(
            { error: "Masukkan kata sandi saat ini untuk mengubah kata sandi." },
            { status: 400 }
          );
        }
        const valid = await verifyPassword(String(body.currentPassword), dbUser.passwordHash);
        if (!valid) {
          return NextResponse.json({ error: "Kata sandi saat ini tidak sesuai." }, { status: 400 });
        }
        const nextPassword = String(body.newPassword);
        if (nextPassword.length < 6 || nextPassword.length > 128) {
          return NextResponse.json(
            { error: "Kata sandi baru harus antara 6 hingga 128 karakter." },
            { status: 400 }
          );
        }
        updateData.passwordHash = await hashPassword(nextPassword);
        updateData.tokenVersion = { increment: 1 };
        passwordChanged = true;
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          isAssigned: true,
          roomId: true,
          tokenVersion: true,
        },
      });

      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: updated.name,
        actorRole: user.role,
        actionType: "PENGATURAN",
        actionSummary: `${updated.name} memperbarui profil/keamanan akun pribadi`,
        entityType: "User",
        entityId: user.id,
        approvalState: "TERCATAT",
        linkUrl: "/pengaturan",
      });

      const res = NextResponse.json({
        user: {
          id: updated.id,
          username: updated.username,
          email: updated.email,
          name: updated.name,
          role: updated.role,
        },
      });

      if (passwordChanged || updateData.name) {
        const refreshedToken = await createSessionToken({
          id: updated.id,
          username: updated.username,
          email: updated.email,
          name: updated.name,
          role: updated.role as UserRole,
          isAssigned: Boolean(updated.isAssigned && updated.roomId),
          roomId: updated.roomId,
          tokenVersion: updated.tokenVersion,
        });
        attachSessionCookie(res, refreshedToken);
      }

      return res;
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan pengaturan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
