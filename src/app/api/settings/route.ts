import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser, hashPassword, verifyPassword } from "@/lib/auth";
import {
  DEFAULT_ROOM_ID,
  ensureSystemBaseline,
  hasMinimumRemainingOwners,
  isStoreAdmin,
  seedRoomDefaults,
  validateRoleManagementAction,
  validateUsername,
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

    // 3. UPDATE RBAC PERMISSION MATRIX (Pemilik / Manajer)
    if (body.action === "UPDATE_PERMISSIONS") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat mengubah matriks hak akses (RBAC)." },
          { status: 403 }
        );
      }

      const permissions = Array.isArray(body.permissions) ? body.permissions : [];
      await prisma.$transaction(async (tx) => {
        for (const p of permissions) {
          const roleKey = String(p.role);
          const modKey = String(p.module);
          if (isStoreAdmin(roleKey)) continue;
          // Modul keuangan & approval tidak boleh dibuka untuk pegawai lewat RBAC matrix
          const isFinancial = modKey === "dashboard" || modKey === "laporan";
          await tx.rolePermission.upsert({
            where: {
              role_module: { role: roleKey, module: modKey },
            },
            update: {
              canView: isFinancial ? false : Boolean(p.canView),
              canCreate: isFinancial ? false : Boolean(p.canCreate),
              canEdit: isFinancial ? false : Boolean(p.canEdit),
              canApprove: false,
            },
            create: {
              role: roleKey,
              module: modKey,
              canView: isFinancial ? false : Boolean(p.canView),
              canCreate: isFinancial ? false : Boolean(p.canCreate),
              canEdit: isFinancial ? false : Boolean(p.canEdit),
              canApprove: false,
            },
          });
        }

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "HAK_AKSES",
            actionSummary: "Memperbarui matriks hak akses (RBAC) jabatan pegawai",
            entityType: "RolePermission",
            afterData: { updatedRows: permissions.length },
            approvalState: "DISETUJUI",
            linkUrl: "/pengaturan",
          },
          tx
        );
      });

      const updatedPermissions = await prisma.rolePermission.findMany();
      return NextResponse.json({ rolePermissions: updatedPermissions });
    }

    // 4. UPDATE ROOM & AUDIT SETTINGS (Pemilik / Manajer)
    if (body.action === "UPDATE_AUDIT_SETTINGS") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat mengubah pengaturan ruangan & audit." },
          { status: 403 }
        );
      }

      const prev = await prisma.room.findUnique({ where: { id: user.roomId } });
      const updatedRoom = await prisma.room.update({
        where: { id: user.roomId },
        data: {
          name: body.storeName ? String(body.storeName).trim() : prev?.name,
          address: body.storeAddress ? String(body.storeAddress).trim() : prev?.address,
          toleranceThresholdRp:
            typeof body.toleranceThresholdRp === "number"
              ? Math.max(0, Math.round(body.toleranceThresholdRp))
              : prev?.toleranceThresholdRp ?? 50000,
          opnameSchedule: body.opnameSchedule
            ? String(body.opnameSchedule)
            : prev?.opnameSchedule,
          openAreaPolicy: body.openAreaPolicy
            ? String(body.openAreaPolicy)
            : prev?.openAreaPolicy,
          closedAreaPolicy: body.closedAreaPolicy
            ? String(body.closedAreaPolicy)
            : prev?.closedAreaPolicy,
          autoBackupInterval: body.autoBackupInterval
            ? String(body.autoBackupInterval)
            : prev?.autoBackupInterval,
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
      const unit = await prisma.unit.create({
        data: {
          name: String(body.name).trim().toLowerCase(),
          label: String(body.label || body.name).trim(),
          group: String(body.group || "HITUNGAN"),
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
        updateData.name = String(body.name).trim();
      }

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
        if (String(body.newPassword).length < 6) {
          return NextResponse.json({ error: "Kata sandi baru minimal 6 karakter." }, { status: 400 });
        }
        updateData.passwordHash = await hashPassword(String(body.newPassword));
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
        select: { id: true, username: true, email: true, name: true, role: true },
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

      return NextResponse.json({ user: updated });
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan pengaturan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
