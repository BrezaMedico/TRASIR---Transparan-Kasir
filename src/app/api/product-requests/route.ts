import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { validateProofAttachment } from "@/lib/attachment";
import {
  groupProductRequestsIntoBatches,
  isProductRequestHiddenForUser,
  parseProductRequestEnvelope,
  serializeProductRequestEnvelope,
} from "@/lib/product-request-batch";
import { z } from "zod";

const ingredientSchema = z.object({
  materialId: z.string().min(1),
  materialName: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});

const variantSchema = z.object({
  name: z.string().min(1),
  sellPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0).optional(),
  ingredients: z.array(ingredientSchema).optional(),
});

const batchItemSchema = z.object({
  clientTempId: z.string().trim().optional(),
  targetProductId: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1, "Kode SKU wajib diisi"),
  barcode: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, "Nama produk wajib diisi"),
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  stockMethod: z.enum(["TETAP", "PECAH", "RESEP"]),
  isRawMaterial: z.boolean().optional(),
  purchaseUnit: z.string().min(1),
  sellUnit: z.string().min(1),
  conversionRatio: z.number().positive(),
  costPrice: z.number().int().min(0),
  sellPrice: z.number().int().min(0),
  currentStock: z.number().min(0).optional(),
  initialStock: z.number().min(0).optional(),
  minStockAlert: z.number().min(0).optional(),
  variants: z.array(variantSchema).optional(),
});

const createBatchSchema = z.object({
  batchTitle: z.string().trim().max(120).optional(),
  batchNote: z.string().trim().max(500).optional(),
  supplierName: z.string().trim().max(120).optional(),
  receiptImageData: z.string().optional().nullable(),
  receiptSource: z.enum(["FISIK", "DIGITAL"]).optional().nullable(),
  items: z
    .array(batchItemSchema)
    .min(1, "Daftar pengajuan minimal berisi 1 barang.")
    .max(50, "Maksimal 50 barang per paket pengajuan."),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView =
      (await checkUserPermission(user.role, "produk", "view")) ||
      (await checkUserPermission(user.role, "produk", "create"));
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin melihat pengajuan produk." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const whereClause: Record<string, unknown> = {
      roomId: user.roomId,
    };

    // Pegawai hanya melihat pengajuan miliknya sendiri; Pemilik & Manajer melihat seluruh ruangan
    if (!isStoreAdmin(user.role)) {
      whereClause.requestedById = user.id;
    }

    if (
      statusFilter &&
      ["MENUNGGU_PERSETUJUAN", "DISETUJUI", "DITOLAK"].includes(statusFilter)
    ) {
      whereClause.status = statusFilter;
    }

    const rawRequests = await prisma.productRequest.findMany({
      where: whereClause,
      include: {
        category: { select: { id: true, name: true, areaType: true } },
        requestedBy: { select: { id: true, name: true, username: true, role: true } },
        reviewedBy: { select: { id: true, name: true, username: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const requests = rawRequests.filter(
      (r) => !isProductRequestHiddenForUser(r.variantsJson, user.id)
    );

    const pendingRows = requests.filter((r) => r.status === "MENUNGGU_PERSETUJUAN");
    const pendingCount = pendingRows.length;
    const pendingBatchCount = groupProductRequestsIntoBatches(
      pendingRows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))
    ).length;

    return NextResponse.json({ requests, pendingCount, pendingBatchCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar pengajuan produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const [canCreate, canEdit] = await Promise.all([
      checkUserPermission(user.role, "produk", "create"),
      checkUserPermission(user.role, "produk", "edit"),
    ]);
    if (!canCreate && !canEdit) {
      return NextResponse.json(
        {
          error:
            "Peran Kasir tidak diizinkan menambahkan atau mengubah barang. Hanya Gudang, Kasir + Gudang, Manajer, atau Pemilik yang dapat mengajukan barang.",
        },
        { status: 403 }
      );
    }

    const rawBody = await request.json();

    // Cegah manipulasi status oleh pegawai non-admin di payload utama maupun per item
    if (!isStoreAdmin(user.role) && rawBody && typeof rawBody === "object") {
      const hasForbiddenTopField =
        "status" in rawBody || "approvalStatus" in rawBody || "bypassApproval" in rawBody;
      const rawItems = Array.isArray((rawBody as { items?: unknown }).items)
        ? ((rawBody as { items: unknown[] }).items)
        : [];
      const hasForbiddenItemField = rawItems.some(
        (it) =>
          it &&
          typeof it === "object" &&
          ("status" in it || "approvalStatus" in it || "bypassApproval" in it)
      );
      if (hasForbiddenTopField || hasForbiddenItemField) {
        return NextResponse.json(
          {
            error:
              "Pegawai tidak diizinkan menentukan atau memanipulasi status persetujuan produk.",
          },
          { status: 403 }
        );
      }
    }

    const parsed = createBatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data paket pengajuan tidak valid." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    for (const item of data.items) {
      if (item.targetProductId && !canEdit) {
        return NextResponse.json(
          { error: `Anda tidak memiliki izin mengajukan perubahan untuk "${item.name}".` },
          { status: 403 }
        );
      }
      if (!item.targetProductId && !canCreate) {
        return NextResponse.json(
          { error: `Anda tidak memiliki izin mengajukan barang baru "${item.name}".` },
          { status: 403 }
        );
      }
    }

    const seenTargetIds = new Set<string>();
    for (const item of data.items) {
      if (item.targetProductId) {
        if (seenTargetIds.has(item.targetProductId)) {
          return NextResponse.json(
            {
              error: `Barang "${item.name}" hanya boleh memiliki satu usulan perubahan dalam satu paket.`,
            },
            { status: 409 }
          );
        }
        seenTargetIds.add(item.targetProductId);
      }
    }

    const targetProductIds = Array.from(seenTargetIds);
    const targetProducts =
      targetProductIds.length > 0
        ? await prisma.product.findMany({
            where: { roomId: user.roomId, id: { in: targetProductIds }, isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              costPrice: true,
              sellPrice: true,
              currentStock: true,
              minStockAlert: true,
              stockMethod: true,
              purchaseUnit: true,
              sellUnit: true,
              conversionRatio: true,
            },
          })
        : [];
    const targetProductMap = new Map(targetProducts.map((p) => [p.id, p]));
    for (const item of data.items) {
      if (item.targetProductId && !targetProductMap.has(item.targetProductId)) {
        return NextResponse.json(
          { error: `Produk target untuk "${item.name}" tidak ditemukan pada ruangan ini.` },
          { status: 404 }
        );
      }
    }

    if (data.receiptImageData) {
      const proofCheck = validateProofAttachment(data.receiptImageData);
      if (!proofCheck.valid) {
        return NextResponse.json(
          { error: proofCheck.error || "Format lampiran nota tidak valid." },
          { status: 400 }
        );
      }
    }

    // Pastikan seluruh kategori berasal dari ruangan yang sama
    const categoryIds = Array.from(new Set(data.items.map((it) => it.categoryId)));
    const validCategories = await prisma.category.findMany({
      where: { roomId: user.roomId, id: { in: categoryIds } },
      select: { id: true },
    });
    const validCategorySet = new Set(validCategories.map((c) => c.id));
    for (const item of data.items) {
      if (!validCategorySet.has(item.categoryId)) {
        return NextResponse.json(
          { error: `Kategori untuk "${item.name}" tidak ditemukan pada ruangan ini.` },
          { status: 400 }
        );
      }
    }

    // Validasi tidak ada duplikasi internal di dalam daftar pengajuan yang sama
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const seenNames = new Set<string>();

    const normalizedItems = data.items.map((item) => {
      const normalizedSku = item.sku.trim().toUpperCase();
      const normalizedBarcode = item.barcode?.trim() ? item.barcode.trim() : null;
      const normalizedName = item.name.trim();
      const ratio = item.stockMethod === "TETAP" ? 1 : item.conversionRatio;
      const resolvedSellUnit = item.stockMethod === "TETAP" ? item.purchaseUnit : item.sellUnit;
      const resolvedInitialStock =
        item.stockMethod === "RESEP"
          ? 0
          : Math.max(0, Number(item.currentStock ?? item.initialStock ?? 0));
      return {
        raw: item,
        normalizedSku,
        normalizedBarcode,
        normalizedName,
        ratio,
        resolvedSellUnit,
        resolvedInitialStock,
      };
    });

    for (const item of normalizedItems) {
      if (seenSkus.has(item.normalizedSku)) {
        return NextResponse.json(
          { error: `Kode SKU "${item.normalizedSku}" terduplikasi di dalam daftar pengajuan.` },
          { status: 409 }
        );
      }
      seenSkus.add(item.normalizedSku);

      if (item.normalizedBarcode) {
        if (seenBarcodes.has(item.normalizedBarcode)) {
          return NextResponse.json(
            { error: `Barcode "${item.normalizedBarcode}" terduplikasi di dalam daftar pengajuan.` },
            { status: 409 }
          );
        }
        seenBarcodes.add(item.normalizedBarcode);
      }

      const nameKey = item.normalizedName.toLowerCase();
      if (seenNames.has(nameKey)) {
        return NextResponse.json(
          { error: `Nama barang "${item.normalizedName}" terduplikasi di dalam daftar pengajuan.` },
          { status: 409 }
        );
      }
      seenNames.add(nameKey);
    }

    // Cek bentrok dengan katalog aktif & antrean pengajuan yang masih MENUNGGU_PERSETUJUAN
    const [existingProducts, existingPending] = await Promise.all([
      prisma.product.findMany({
        where: { roomId: user.roomId },
        select: { id: true, sku: true, barcode: true, name: true, isActive: true },
      }),
      prisma.productRequest.findMany({
        where: { roomId: user.roomId, status: "MENUNGGU_PERSETUJUAN" },
        select: { sku: true, barcode: true, name: true, variantsJson: true },
      }),
    ]);

    for (const item of normalizedItems) {
      const targetId = item.raw.targetProductId;
      const conflictProd = existingProducts.find(
        (p) =>
          p.id !== targetId &&
          (p.sku === item.normalizedSku ||
            (item.normalizedBarcode && p.barcode === item.normalizedBarcode) ||
            (p.isActive && p.name.trim().toLowerCase() === item.normalizedName.toLowerCase()))
      );
      if (conflictProd) {
        return NextResponse.json(
          {
            error: `Barang "${item.normalizedName}" bentrok dengan katalog yang sudah ada ("${conflictProd.name}").`,
          },
          { status: 409 }
        );
      }

      const conflictReq = existingPending.find((r) => {
        const rEnv = parseProductRequestEnvelope(r.variantsJson);
        if (targetId && rEnv.targetProductId === targetId) return true;
        return (
          r.sku === item.normalizedSku ||
          (item.normalizedBarcode && r.barcode === item.normalizedBarcode) ||
          r.name.trim().toLowerCase() === item.normalizedName.toLowerCase()
        );
      });
      if (conflictReq) {
        return NextResponse.json(
          {
            error: `Barang "${item.normalizedName}" serupa dengan "${conflictReq.name}" yang sedang menunggu persetujuan.`,
          },
          { status: 409 }
        );
      }
    }

    const updateCount = normalizedItems.filter((it) => Boolean(it.raw.targetProductId)).length;
    const allUpdates = updateCount === normalizedItems.length;
    const batchId = `BATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const resolvedBatchTitle =
      data.batchTitle?.trim() ||
      (normalizedItems.length === 1
        ? allUpdates
          ? `Ubah ${normalizedItems[0].normalizedName}`
          : normalizedItems[0].normalizedName
        : allUpdates
          ? `Paket ${normalizedItems.length} Perubahan Barang`
          : updateCount > 0
            ? `Paket ${normalizedItems.length} Pengajuan & Perubahan`
            : `Paket ${normalizedItems.length} Barang Baru`);

    const createdRequests = await prisma.$transaction(async (tx) => {
      const created = [];
      for (let idx = 0; idx < normalizedItems.length; idx += 1) {
        const item = normalizedItems[idx];
        const targetProd = item.raw.targetProductId
          ? targetProductMap.get(item.raw.targetProductId)
          : undefined;
        const hasStockInput =
          typeof item.raw.currentStock === "number" || typeof item.raw.initialStock === "number";
        const updateStockValue =
          targetProd &&
          item.raw.stockMethod !== "RESEP" &&
          hasStockInput &&
          item.resolvedInitialStock !== targetProd.currentStock
            ? item.resolvedInitialStock
            : undefined;

        const variantsJson = serializeProductRequestEnvelope({
          requestKind: targetProd ? "UPDATE" : "CREATE",
          targetProductId: targetProd?.id,
          previousSnapshot: targetProd
            ? {
                name: targetProd.name,
                sku: targetProd.sku,
                barcode: targetProd.barcode,
                costPrice: targetProd.costPrice,
                sellPrice: targetProd.sellPrice,
                currentStock: targetProd.currentStock,
                minStockAlert: targetProd.minStockAlert,
                stockMethod: targetProd.stockMethod,
                purchaseUnit: targetProd.purchaseUnit,
                sellUnit: targetProd.sellUnit,
                conversionRatio: targetProd.conversionRatio,
              }
            : undefined,
          initialStock: targetProd
            ? updateStockValue
            : item.raw.stockMethod !== "RESEP" && item.resolvedInitialStock > 0
              ? item.resolvedInitialStock
              : undefined,
          variants:
            item.raw.stockMethod === "RESEP" && item.raw.variants
              ? item.raw.variants
              : undefined,
          clientTempId: item.raw.clientTempId || undefined,
          batchId,
          batchIndex: idx,
          batchSize: normalizedItems.length,
          batchTitle: resolvedBatchTitle,
          batchNote: idx === 0 && data.batchNote ? data.batchNote : undefined,
          supplierName: idx === 0 && data.supplierName ? data.supplierName : undefined,
          receiptImageData: idx === 0 && data.receiptImageData ? data.receiptImageData : undefined,
          receiptSource:
            idx === 0 && data.receiptImageData
              ? data.receiptSource || "DIGITAL"
              : undefined,
        });

        const row = await tx.productRequest.create({
          data: {
            roomId: user.roomId,
            requestedById: user.id,
            status: "MENUNGGU_PERSETUJUAN",
            sku: item.normalizedSku,
            barcode: item.normalizedBarcode,
            name: item.normalizedName,
            categoryId: item.raw.categoryId,
            stockMethod: item.raw.stockMethod,
            isRawMaterial: Boolean(item.raw.isRawMaterial),
            purchaseUnit: item.raw.purchaseUnit,
            sellUnit: item.resolvedSellUnit,
            conversionRatio: item.ratio,
            costPrice: item.raw.costPrice,
            sellPrice: item.raw.sellPrice,
            minStockAlert: item.raw.minStockAlert ?? 5,
            variantsJson,
          },
          include: {
            category: { select: { id: true, name: true, areaType: true } },
            requestedBy: { select: { id: true, name: true, username: true, role: true } },
            reviewedBy: { select: { id: true, name: true, username: true, role: true } },
          },
        });
        created.push(row);
      }

      const itemNamesSummary = normalizedItems
        .slice(0, 3)
        .map((i) => i.normalizedName)
        .join(", ");
      const extraCount =
        normalizedItems.length > 3 ? ` (+${normalizedItems.length - 3} lainnya)` : "";

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${user.name} mengirim paket pengajuan ${normalizedItems.length} barang: ${itemNamesSummary}${extraCount}`,
          entityType: "ProductRequestBatch",
          entityId: batchId,
          afterData: {
            batchId,
            itemCount: normalizedItems.length,
            hasReceipt: Boolean(data.receiptImageData),
            receiptSource: data.receiptImageData ? data.receiptSource || "DIGITAL" : null,
            names: normalizedItems.map((i) => i.normalizedName),
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: "/produk?tab=requests",
        },
        tx
      );

      await createNotification(
        {
          roomId: user.roomId,
          title: `Paket Pengajuan Baru (${normalizedItems.length} Barang)`,
          message: `${user.name} mengajukan ${itemNamesSummary}${extraCount}${
            data.receiptImageData ? " dengan lampiran nota" : ""
          }. Buka tab Persetujuan untuk meninjau sekaligus.`,
          severity: "INFO",
          category: "KATALOG",
          targetRole: null,
          linkUrl: "/produk?tab=requests",
        },
        tx
      );

      return created;
    });

    return NextResponse.json(
      {
        mode: "REQUEST_BATCH",
        batchId,
        requests: createdRequests,
        message: `${createdRequests.length} item berhasil dikirim sekaligus untuk disetujui Pemilik atau Manajer.`,
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mengirim paket pengajuan produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Status pengajuan produk hanya dapat diproses melalui endpoint review Pemilik/Manajer." },
    { status: 403 }
  );
}

const deleteBatchSchema = z
  .object({
    batchId: z.string().trim().min(1).optional(),
    requestIds: z.array(z.string().trim().min(1)).optional(),
    scope: z.enum(["FOR_ME", "FOR_ALL"]),
  })
  .refine((v) => Boolean(v.batchId || (v.requestIds && v.requestIds.length > 0)), {
    message: "Sertakan batchId atau daftar requestIds yang akan dihapus.",
  });

export async function DELETE(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canAccess =
      (await checkUserPermission(user.role, "produk", "view")) ||
      (await checkUserPermission(user.role, "produk", "create"));
    if (!canAccess) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengelola pengajuan produk." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = deleteBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Permintaan hapus pengajuan tidak valid." },
        { status: 400 }
      );
    }

    const { batchId, requestIds, scope } = parsed.data;
    const isAdmin = isStoreAdmin(user.role);

    if (scope === "FOR_ALL" && !isAdmin) {
      return NextResponse.json(
        {
          error:
            "Hanya Pemilik atau Manajer yang berwenang menghapus pengajuan untuk semua orang.",
        },
        { status: 403 }
      );
    }

    const whereClause: Record<string, unknown> = {
      roomId: user.roomId,
    };
    if (!isAdmin) {
      whereClause.requestedById = user.id;
    }
    if (requestIds && requestIds.length > 0) {
      whereClause.id = { in: requestIds };
    } else if (batchId) {
      if (batchId.startsWith("single-")) {
        whereClause.id = batchId.slice("single-".length);
      } else {
        whereClause.variantsJson = { contains: batchId };
      }
    }

    const candidates = await prisma.productRequest.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        variantsJson: true,
      },
    });

    const targetRows =
      requestIds && requestIds.length > 0
        ? candidates
        : candidates.filter((row) => {
            if (!batchId) return false;
            if (batchId.startsWith("single-")) {
              return row.id === batchId.slice("single-".length);
            }
            return parseProductRequestEnvelope(row.variantsJson).batchId === batchId;
          });

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "Pengajuan tidak ditemukan atau tidak dapat diakses." },
        { status: 404 }
      );
    }

    if (scope === "FOR_ME") {
      await prisma.$transaction(async (tx) => {
        for (const row of targetRows) {
          const env = parseProductRequestEnvelope(row.variantsJson);
          const nextHidden = Array.from(new Set([...(env.hiddenByUserIds ?? []), user.id]));
          const nextJson = serializeProductRequestEnvelope({
            ...env,
            hiddenByUserIds: nextHidden,
          });
          await tx.productRequest.update({
            where: { id: row.id },
            data: { variantsJson: nextJson },
          });
        }
      });

      return NextResponse.json({
        deleted: true,
        scope: "FOR_ME",
        affectedCount: targetRows.length,
        message: "Pengajuan dihapus dari daftar tampilan Anda.",
      });
    }

    const targetIds = targetRows.map((r) => r.id);
    const leadTitle =
      parseProductRequestEnvelope(targetRows[0].variantsJson).batchTitle ||
      (targetRows.length === 1
        ? targetRows[0].name
        : `Paket ${targetRows.length} Barang`);

    await prisma.$transaction(async (tx) => {
      await tx.productRequest.deleteMany({
        where: {
          id: { in: targetIds },
          roomId: user.roomId,
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${user.name} menghapus permanen paket pengajuan "${leadTitle}" (${targetIds.length} item) untuk semua pengguna`,
          entityType: "ProductRequestBatch",
          entityId: batchId || targetIds[0],
          beforeData: {
            batchId: batchId || null,
            deletedCount: targetIds.length,
            names: targetRows.map((r) => r.name),
          },
          approvalState: "TERCATAT",
          linkUrl: "/produk?tab=requests",
        },
        tx
      );
    });

    return NextResponse.json({
      deleted: true,
      scope: "FOR_ALL",
      affectedCount: targetIds.length,
      message: "Pengajuan berhasil dihapus untuk semua pengguna.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menghapus pengajuan produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
