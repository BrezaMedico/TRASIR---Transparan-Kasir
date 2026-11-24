import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const requestAdjustmentSchema = z.object({
  action: z.literal("REQUEST_ADJUSTMENT"),
  productId: z.string().min(1, "Produk wajib dipilih"),
  adjustmentType: z.enum(["RUSAK", "KEDALUWARSA", "HILANG", "DIKEMBALIKAN", "PINDAH_GUDANG"]),
  quantity: z.number().positive("Jumlah perubahan stok harus > 0"),
  reason: z.string().min(5, "Alasan perubahan stok wajib diisi jelas"),
  proofImageData: z.string().min(10, "Bukti foto pendukung wajib dilampirkan"),
  fromWarehouseId: z.string().optional().nullable(),
  toWarehouseId: z.string().optional().nullable(),
});

const reviewAdjustmentSchema = z.object({
  action: z.literal("REVIEW_ADJUSTMENT"),
  adjustmentId: z.string().min(1),
  decision: z.enum(["DISETUJUI", "DITOLAK"]),
  reviewNotes: z.string().optional(),
});

const submitOpnameSchema = z.object({
  action: z.literal("SUBMIT_OPNAME"),
  title: z.string().min(3, "Judul sesi stok opname wajib diisi"),
  scheduleType: z.enum(["HARIAN", "MINGGUAN", "BULANAN", "INSIDENTAL"]),
  warehouseId: z.string().optional().nullable(),
  counts: z
    .array(
      z.object({
        productId: z.string().min(1),
        physicalStock: z.number().min(0, "Jumlah stok fisik tidak boleh negatif"),
      })
    )
    .min(1, "Minimal 1 barang harus dihitung"),
});

const explainOpnameItemSchema = z.object({
  action: z.literal("EXPLAIN_OPNAME_ITEM"),
  opnameItemId: z.string().min(1),
  employeeExplanation: z.string().min(5, "Penjelasan pegawai wajib diisi minimal 5 karakter"),
  proofImageData: z.string().optional().nullable(),
});

const evaluateOpnameItemSchema = z.object({
  action: z.literal("EVALUATE_OPNAME_ITEM"),
  opnameItemId: z.string().min(1),
  ownerDecision: z.enum(["TERIMA_PENJELASAN", "MINTA_INFO_TAMBAHAN", "TANDAI_TINDAK_LANJUT"]),
  ownerNotes: z.string().optional(),
  syncPhysicalToSystem: z.boolean().optional(),
});

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView = await checkUserPermission(user.role, "inventaris", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses modul Inventaris & Audit Stok." },
        { status: 403 }
      );
    }

    const [products, warehouses, adjustments, opnameSessions, room] = await Promise.all([
      prisma.product.findMany({
        where: { roomId: user.roomId, isActive: true },
        include: {
          category: true,
          warehouseStocks: { include: { warehouse: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.warehouse.findMany({ where: { roomId: user.roomId }, orderBy: { name: "asc" } }),
      prisma.stockAdjustment.findMany({
        where: { roomId: user.roomId },
        include: {
          product: { include: { category: true } },
          fromWarehouse: true,
          toWarehouse: true,
          requestedBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.stockOpnameSession.findMany({
        where: { roomId: user.roomId },
        include: {
          warehouse: true,
          createdBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
          items: { include: { product: { include: { category: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.room.findUnique({ where: { id: user.roomId } }),
    ]);

    const blindCountProducts = products
      .filter((p) => p.stockMethod !== "RESEP")
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category.name,
        areaType: p.category.areaType,
        sellUnit: p.sellUnit,
      }));

    return NextResponse.json({
      products,
      blindCountProducts,
      warehouses,
      adjustments,
      opnameSessions,
      toleranceThresholdRp: room?.toleranceThresholdRp ?? 50000,
      opnameSchedule: room?.opnameSchedule ?? "MINGGUAN",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data inventaris.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();

    if (body.action === "REQUEST_ADJUSTMENT") {
      const canCreate = await checkUserPermission(user.role, "inventaris", "create");
      if (!canCreate) {
        return NextResponse.json(
          { error: "Anda tidak memiliki izin mengajukan perubahan stok." },
          { status: 403 }
        );
      }

      const parsed = requestAdjustmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data pengajuan tidak lengkap" },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const product = await prisma.product.findFirst({
        where: { id: data.productId, roomId: user.roomId },
      });
      if (!product) {
        return NextResponse.json(
          { error: "Produk tidak ditemukan pada ruangan ini." },
          { status: 404 }
        );
      }

      const adjustment = await prisma.$transaction(async (tx) => {
        const created = await tx.stockAdjustment.create({
          data: {
            roomId: user.roomId,
            productId: product.id,
            adjustmentType: data.adjustmentType,
            quantity: data.quantity,
            reason: data.reason.trim(),
            proofImageData: data.proofImageData,
            fromWarehouseId: data.fromWarehouseId || null,
            toWarehouseId: data.toWarehouseId || null,
            status: "MENUNGGU_PERSETUJUAN",
            requestedById: user.id,
          },
          include: { product: true },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PERUBAHAN_STOK",
            actionSummary: `Mengajukan perubahan stok (${data.adjustmentType}) ${data.quantity} ${product.sellUnit} untuk "${product.name}"`,
            entityType: "StockAdjustment",
            entityId: created.id,
            beforeData: { currentStock: product.currentStock },
            afterData: {
              adjustmentType: data.adjustmentType,
              quantity: data.quantity,
              reason: data.reason.trim(),
              status: "MENUNGGU_PERSETUJUAN",
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/inventaris",
          },
          tx
        );

        await createNotification(
          {
            roomId: user.roomId,
            title: `Pengajuan Perubahan Stok (${data.adjustmentType}): ${product.name}`,
            message: `${user.name} mengajukan perubahan stok ${data.adjustmentType} sebanyak ${data.quantity} ${product.sellUnit}. Alasan: ${data.reason.trim()}`,
            severity: "WARNING",
            category: "PERUBAHAN_STOK",
            targetRole: null,
            linkUrl: "/inventaris",
          },
          tx
        );

        return created;
      });

      return NextResponse.json({ adjustment });
    }

    if (body.action === "REVIEW_ADJUSTMENT") {
      if (!isStoreAdmin(user.role)) {
        return NextResponse.json(
          { error: "Hanya Pemilik atau Manajer yang dapat menyetujui perubahan stok." },
          { status: 403 }
        );
      }

      const parsed = reviewAdjustmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Keputusan tidak valid" },
          { status: 400 }
        );
      }

      const { adjustmentId, decision, reviewNotes } = parsed.data;
      const adj = await prisma.stockAdjustment.findFirst({
        where: { id: adjustmentId, roomId: user.roomId },
        include: { product: true },
      });

      if (!adj) {
        return NextResponse.json(
          { error: "Data pengajuan tidak ditemukan pada ruangan ini." },
          { status: 404 }
        );
      }

      if (adj.status !== "MENUNGGU_PERSETUJUAN") {
        return NextResponse.json({ error: "Pengajuan ini sudah diproses." }, { status: 400 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (decision === "DISETUJUI") {
          if (
            adj.adjustmentType === "RUSAK" ||
            adj.adjustmentType === "KEDALUWARSA" ||
            adj.adjustmentType === "HILANG" ||
            adj.adjustmentType === "DIKEMBALIKAN"
          ) {
            const newStock = Math.max(
              0,
              Number((adj.product.currentStock - adj.quantity).toFixed(4))
            );
            await tx.product.update({
              where: { id: adj.productId },
              data: { currentStock: newStock },
            });
          } else if (
            adj.adjustmentType === "PINDAH_GUDANG" &&
            adj.fromWarehouseId &&
            adj.toWarehouseId
          ) {
            await tx.productStock.upsert({
              where: {
                productId_warehouseId: {
                  productId: adj.productId,
                  warehouseId: adj.fromWarehouseId,
                },
              },
              update: { quantity: { decrement: adj.quantity } },
              create: {
                productId: adj.productId,
                warehouseId: adj.fromWarehouseId,
                quantity: 0,
              },
            });

            await tx.productStock.upsert({
              where: {
                productId_warehouseId: {
                  productId: adj.productId,
                  warehouseId: adj.toWarehouseId,
                },
              },
              update: { quantity: { increment: adj.quantity } },
              create: {
                productId: adj.productId,
                warehouseId: adj.toWarehouseId,
                quantity: adj.quantity,
              },
            });
          }
        }

        const rev = await tx.stockAdjustment.update({
          where: { id: adj.id },
          data: {
            status: decision,
            reviewedById: user.id,
            reviewNotes: reviewNotes?.trim() || null,
            reviewedAt: new Date(),
          },
          include: { product: true },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PERUBAHAN_STOK",
            actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} pengajuan perubahan stok (${adj.adjustmentType}) "${adj.product.name}"`,
            entityType: "StockAdjustment",
            entityId: adj.id,
            beforeData: { stockBefore: adj.product.currentStock, status: "MENUNGGU_PERSETUJUAN" },
            afterData: { decision, stockUpdated: decision === "DISETUJUI" },
            approvalState: decision,
            linkUrl: "/inventaris",
          },
          tx
        );

        return rev;
      });

      return NextResponse.json({ adjustment: updated });
    }

    if (body.action === "SUBMIT_OPNAME") {
      const canCreate = await checkUserPermission(user.role, "inventaris", "create");
      if (!canCreate) {
        return NextResponse.json(
          { error: "Anda tidak memiliki izin menjalankan Stok Opname." },
          { status: 403 }
        );
      }

      const parsed = submitOpnameSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data perhitungan fisik tidak valid" },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const room = await prisma.room.findUnique({ where: { id: user.roomId } });
      const toleranceRp = room?.toleranceThresholdRp ?? 50000;

      const session = await prisma.$transaction(async (tx) => {
        const preparedItems: {
          productId: string;
          areaType: string;
          systemStock: number;
          physicalStock: number;
          differenceUnit: number;
          unitCost: number;
          lossValueRp: number;
          exceedsTolerance: boolean;
          toleranceStatus: string;
        }[] = [];

        let anomalyCount = 0;

        for (const c of data.counts) {
          const prod = await tx.product.findFirst({
            where: { id: c.productId, roomId: user.roomId },
            include: { category: true },
          });
          if (!prod) continue;

          const systemStock = prod.currentStock;
          const physicalStock = Number(c.physicalStock);
          const differenceUnit = Number((physicalStock - systemStock).toFixed(4));
          const lossValueRp = Math.round(Math.abs(differenceUnit) * prod.costPrice);
          const exceedsTolerance = differenceUnit !== 0 && lossValueRp > toleranceRp;
          const areaType = prod.category.areaType || "TERBUKA";

          let toleranceStatus = "SESUAI";
          if (differenceUnit !== 0) {
            if (!exceedsTolerance) {
              toleranceStatus = "DALAM_TOLERANSI";
            } else {
              toleranceStatus = areaType === "TERTUTUP" ? "ANOMALI_TERTUTUP" : "ANOMALI_TERBUKA";
              anomalyCount++;
            }
          }

          preparedItems.push({
            productId: prod.id,
            areaType,
            systemStock,
            physicalStock,
            differenceUnit,
            unitCost: prod.costPrice,
            lossValueRp,
            exceedsTolerance,
            toleranceStatus,
          });
        }

        const createdSession = await tx.stockOpnameSession.create({
          data: {
            roomId: user.roomId,
            title: data.title.trim(),
            scheduleType: data.scheduleType,
            warehouseId: data.warehouseId || null,
            toleranceThreshold: toleranceRp,
            status: anomalyCount > 0 ? "SUBMITTED" : "EVALUATED",
            createdById: user.id,
            submittedAt: new Date(),
            items: { create: preparedItems },
          },
          include: {
            items: { include: { product: { include: { category: true } } } },
          },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "STOK_OPNAME",
            actionSummary: `Mengirim hasil Stok Opname Blind Count "${createdSession.title}" (${anomalyCount} item melewati batas toleransi Rp ${toleranceRp})`,
            entityType: "StockOpnameSession",
            entityId: createdSession.id,
            afterData: {
              title: createdSession.title,
              totalCounted: preparedItems.length,
              anomalyCount,
              toleranceRp,
            },
            approvalState: anomalyCount > 0 ? "MENUNGGU_PERSETUJUAN" : "DISETUJUI",
            linkUrl: "/inventaris",
          },
          tx
        );

        if (anomalyCount > 0) {
          await createNotification(
            {
              roomId: user.roomId,
              title: `Temuan Stok Opname: ${anomalyCount} Item Melewati Toleransi`,
              message: `Stok Opname "${createdSession.title}" oleh ${user.name} mencatat ${anomalyCount} barang dengan nilai selisih melewati batas toleransi Rp ${toleranceRp}.`,
              severity: "WARNING",
              category: "STOK_OPNAME",
              targetRole: null,
              linkUrl: "/inventaris",
            },
            tx
          );
        }

        return createdSession;
      });

      return NextResponse.json({ session });
    }

    if (body.action === "EXPLAIN_OPNAME_ITEM") {
      const parsed = explainOpnameItemSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Penjelasan tidak lengkap" },
          { status: 400 }
        );
      }

      const { opnameItemId, employeeExplanation, proofImageData } = parsed.data;
      const item = await prisma.stockOpnameItem.findFirst({
        where: { id: opnameItemId, session: { roomId: user.roomId } },
        include: { product: true },
      });

      if (!item) {
        return NextResponse.json({ error: "Item stok opname tidak ditemukan." }, { status: 404 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const res = await tx.stockOpnameItem.update({
          where: { id: item.id },
          data: {
            employeeExplanation: employeeExplanation.trim(),
            proofImageData: proofImageData || item.proofImageData,
          },
          include: { product: { include: { category: true } } },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "STOK_OPNAME",
            actionSummary: `Memberikan penjelasan selisih stok untuk "${item.product.name}" (${item.areaType})`,
            entityType: "StockOpnameItem",
            entityId: item.id,
            afterData: {
              employeeExplanation: employeeExplanation.trim(),
              hasProof: Boolean(proofImageData),
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/inventaris",
          },
          tx
        );

        return res;
      });

      return NextResponse.json({ item: updated });
    }

    if (body.action === "EVALUATE_OPNAME_ITEM") {
      if (!isStoreAdmin(user.role)) {
        return NextResponse.json(
          {
            error:
              "Hanya Pemilik atau Manajer yang dapat memberikan keputusan evaluasi selisih stok opname.",
          },
          { status: 403 }
        );
      }

      const parsed = evaluateOpnameItemSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Keputusan evaluasi tidak valid" },
          { status: 400 }
        );
      }

      const { opnameItemId, ownerDecision, ownerNotes, syncPhysicalToSystem } = parsed.data;
      const item = await prisma.stockOpnameItem.findFirst({
        where: { id: opnameItemId, session: { roomId: user.roomId } },
        include: { product: true, session: true },
      });

      if (!item) {
        return NextResponse.json({ error: "Item stok opname tidak ditemukan." }, { status: 404 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (syncPhysicalToSystem && ownerDecision === "TERIMA_PENJELASAN") {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: item.physicalStock },
          });
        }

        const res = await tx.stockOpnameItem.update({
          where: { id: item.id },
          data: {
            ownerDecision,
            ownerNotes: ownerNotes?.trim() || null,
          },
          include: { product: { include: { category: true } } },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "STOK_OPNAME",
            actionSummary: `Evaluasi (${ownerDecision}) atas selisih stok "${item.product.name}"`,
            entityType: "StockOpnameItem",
            entityId: item.id,
            beforeData: { systemStock: item.systemStock, physicalStock: item.physicalStock },
            afterData: {
              ownerDecision,
              ownerNotes: ownerNotes?.trim() || null,
              stockSynced: Boolean(syncPhysicalToSystem && ownerDecision === "TERIMA_PENJELASAN"),
            },
            approvalState:
              ownerDecision === "TERIMA_PENJELASAN"
                ? "DISETUJUI"
                : ownerDecision === "MINTA_INFO_TAMBAHAN"
                ? "PERLU_PERBAIKAN"
                : "MENUNGGU_PERSETUJUAN",
            linkUrl: "/inventaris",
          },
          tx
        );

        return res;
      });

      return NextResponse.json({ item: updated });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses operasi inventaris.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
