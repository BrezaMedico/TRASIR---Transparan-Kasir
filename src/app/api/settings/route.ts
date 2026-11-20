import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { ensureSystemBaseline } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureSystemBaseline();
    const isOwner = user.role === "PEMILIK";

    const [users, rolePermissions, settings, units, categories, warehouses] = await Promise.all([
      isOwner
        ? prisma.user.findMany({
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
      prisma.systemSetting.findUnique({ where: { id: "default" } }),
      prisma.unit.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    ]);

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
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const isOwner = user.role === "PEMILIK";

    // 1. CREATE STAFF USER (Owner Only)
    if (body.action === "CREATE_USER") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik yang dapat menambahkan akun pegawai baru." },
          { status: 403 }
        );
      }

      const schema = z.object({
        name: z.string().min(2),
        username: z.string().min(3),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["PEMILIK", "MANAJER", "KASIR", "GUDANG"]),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data akun tidak valid" },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const created = await prisma.user.create({
        data: {
          name: parsed.data.name.trim(),
          username: parsed.data.username.trim().toLowerCase(),
          email: parsed.data.email.trim().toLowerCase(),
          passwordHash,
          role: parsed.data.role,
          isActive: true,
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

    // 2. TOGGLE USER ACTIVE OR UPDATE ROLE (Owner Only)
    if (body.action === "UPDATE_USER") {
      if (!isOwner) {
        return NextResponse.json({ error: "Hanya Pemilik yang dapat mengubah status/jabatan akun." }, { status: 403 });
      }

      const targetId = String(body.userId || "");
      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser) {
        return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data: {
          role: body.role ? String(body.role) : targetUser.role,
          isActive: typeof body.isActive === "boolean" ? body.isActive : targetUser.isActive,
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

    // 3. UPDATE RBAC PERMISSION MATRIX (Owner Only)
    if (body.action === "UPDATE_PERMISSIONS") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik yang dapat mengubah matriks hak akses (RBAC)." },
          { status: 403 }
        );
      }

      const permissions = Array.isArray(body.permissions) ? body.permissions : [];
      await prisma.$transaction(async (tx) => {
        for (const p of permissions) {
          if (p.role === "PEMILIK") continue; // Pemilik selalu memiliki akses penuh
          await tx.rolePermission.upsert({
            where: {
              role_module: {
                role: String(p.role),
                module: String(p.module),
              },
            },
            update: {
              canView: Boolean(p.canView),
              canCreate: Boolean(p.canCreate),
              canEdit: Boolean(p.canEdit),
              canApprove: Boolean(p.canApprove),
            },
            create: {
              role: String(p.role),
              module: String(p.module),
              canView: Boolean(p.canView),
              canCreate: Boolean(p.canCreate),
              canEdit: Boolean(p.canEdit),
              canApprove: Boolean(p.canApprove),
            },
          });
        }

        await recordAuditLog(
          {
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

    // 4. UPDATE AUDIT & TOLERANCE RULES (Owner Only)
    if (body.action === "UPDATE_AUDIT_SETTINGS") {
      if (!isOwner) {
        return NextResponse.json(
          { error: "Hanya Pemilik yang dapat mengubah aturan toleransi audit." },
          { status: 403 }
        );
      }

      const prev = await prisma.systemSetting.findUnique({ where: { id: "default" } });
      const updated = await prisma.systemSetting.upsert({
        where: { id: "default" },
        update: {
          storeName: body.storeName ? String(body.storeName).trim() : prev?.storeName,
          storeAddress: body.storeAddress ? String(body.storeAddress).trim() : prev?.storeAddress,
          toleranceThresholdRp:
            typeof body.toleranceThresholdRp === "number"
              ? Math.max(0, Math.round(body.toleranceThresholdRp))
              : prev?.toleranceThresholdRp ?? 50000,
          opnameSchedule: body.opnameSchedule ? String(body.opnameSchedule) : prev?.opnameSchedule,
          openAreaPolicy: body.openAreaPolicy ? String(body.openAreaPolicy) : prev?.openAreaPolicy,
          closedAreaPolicy: body.closedAreaPolicy ? String(body.closedAreaPolicy) : prev?.closedAreaPolicy,
          autoBackupInterval: body.autoBackupInterval
            ? String(body.autoBackupInterval)
            : prev?.autoBackupInterval,
        },
        create: {
          id: "default",
          storeName: String(body.storeName || "TRASIR Toko Utama"),
          toleranceThresholdRp: Math.max(0, Math.round(Number(body.toleranceThresholdRp ?? 50000))),
          opnameSchedule: String(body.opnameSchedule || "MINGGUAN"),
        },
      });

      await recordAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "PENGATURAN",
        actionSummary: `Memperbarui aturan audit & batas toleransi selisih stok menjadi Rp ${updated.toleranceThresholdRp}`,
        entityType: "SystemSetting",
        entityId: "default",
        beforeData: prev,
        afterData: updated,
        approvalState: "DISETUJUI",
        linkUrl: "/pengaturan",
      });

      return NextResponse.json({ settings: updated });
    }

    // 5. CREATE MASTER UNIT / CATEGORY / WAREHOUSE (Owner Only)
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
          name: String(body.name).trim(),
          areaType: body.areaType === "TERTUTUP" ? "TERTUTUP" : "TERBUKA",
          description: body.description ? String(body.description).trim() : null,
        },
      });
      await recordAuditLog({
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
          name: String(body.name).trim(),
          location: body.location ? String(body.location).trim() : null,
        },
      });
      return NextResponse.json({ warehouse });
    }

    // 6. UPDATE OWN PROFILE & PASSWORD (Available to all logged-in roles)
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

