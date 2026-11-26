import crypto from "node:crypto";
import { handleApiError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, ensureSystemBaseline, isStoreAdmin } from "@/lib/rbac";
import { getCatalogPayload } from "@/lib/queries/catalog";
import { createProductVariantsWithCost } from "@/lib/inventory";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { serializeProductRequestEnvelope } from "@/lib/product-request-batch";
import { z } from "zod";

const ingredientSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});

const variantSchema = z.object({
  name: z.string().min(1),
  sellPrice: z.number().int().min(0),
  costPrice: z.number().int().min(0).optional(),
  ingredients: z.array(ingredientSchema).optional(),
});

const productSchema = z.object({
  id: z.string().optional(),
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

export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    await ensureSystemBaseline();
    const canView =
      (await checkUserPermission(user.role, "produk", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view")) ||
      (await checkUserPermission(user.role, "pembelian", "view")) ||
      (await checkUserPermission(user.role, "inventaris", "view"));

    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin melihat katalog produk." },
        { status: 403 }
      );
    }

    const payload = await getCatalogPayload(user.roomId, {
      userId: user.id,
      isAdmin: isStoreAdmin(user.role),
    });
    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err, "/api/products", "Gagal memuat katalog produk.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canCreate = await checkUserPermission(user.role, "produk", "create");
    if (!canCreate) {
      return NextResponse.json(
        {
          error:
            "Peran Kasir tidak diizinkan menambahkan barang. Hanya Gudang, Kasir + Gudang, Manajer, atau Pemilik yang dapat menambahkan atau mengajukan barang.",
        },
        { status: 403 }
      );
    }

    const rawBody = await request.json();

    // Tolak upaya manipulasi status persetujuan oleh pegawai melalui body request
    if (
      !isStoreAdmin(user.role) &&
      rawBody &&
      typeof rawBody === "object" &&
      ("status" in rawBody || "approvalStatus" in rawBody || "bypassApproval" in rawBody)
    ) {
      return NextResponse.json(
        {
          error:
            "Pegawai tidak diizinkan menentukan atau memanipulasi status persetujuan produk.",
        },
        { status: 403 }
      );
    }

    const parsed = productSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data produk tidak valid." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const normalizedSku = data.sku.trim().toUpperCase();
    const normalizedBarcode = data.barcode?.trim() ? data.barcode.trim() : null;
    const normalizedName = data.name.trim();
    const ratio = data.stockMethod === "TETAP" ? 1 : data.conversionRatio;
    const resolvedSellUnit = data.stockMethod === "TETAP" ? data.purchaseUnit : data.sellUnit;
    const resolvedInitialStock =
      data.stockMethod === "RESEP"
        ? 0
        : Math.max(0, Number(data.currentStock ?? data.initialStock ?? 0));

    // Pastikan kategori berasal dari ruangan yang sama
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, roomId: user.roomId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan pada ruangan ini." },
        { status: 400 }
      );
    }

    // Hindari produk ganda di ruangan yang sama (cek SKU, barcode, atau nama persis)
    const duplicateActive = await prisma.product.findFirst({
      where: {
        roomId: user.roomId,
        OR: [
          { sku: normalizedSku },
          ...(normalizedBarcode ? [{ barcode: normalizedBarcode }] : []),
        ],
      },
      select: { id: true, sku: true, barcode: true, name: true },
    });

    if (duplicateActive) {
      const reason =
        duplicateActive.sku === normalizedSku
          ? `Kode SKU "${normalizedSku}" sudah terdaftar pada produk "${duplicateActive.name}".`
          : `Barcode "${normalizedBarcode}" sudah digunakan pada produk "${duplicateActive.name}".`;
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    // Cek nama ganda case-insensitive di katalog aktif ruangan
    const existingRoomProducts = await prisma.product.findMany({
      where: { roomId: user.roomId, isActive: true },
      select: { name: true },
    });
    if (
      existingRoomProducts.some(
        (p) => p.name.trim().toLowerCase() === normalizedName.toLowerCase()
      )
    ) {
      return NextResponse.json(
        { error: `Produk dengan nama "${normalizedName}" sudah ada di katalog aktif.` },
        { status: 409 }
      );
    }

    // JALUR 1: PEMILIK atau MANAJER -> Langsung masuk ke katalog aktif tanpa antrean persetujuan
    if (isStoreAdmin(user.role)) {
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            roomId: user.roomId,
            sku: normalizedSku,
            barcode: normalizedBarcode,
            name: normalizedName,
            categoryId: category.id,
            stockMethod: data.stockMethod,
            isRawMaterial: Boolean(data.isRawMaterial),
            purchaseUnit: data.purchaseUnit,
            sellUnit: resolvedSellUnit,
            conversionRatio: ratio,
            costPrice: data.costPrice,
            sellPrice: data.sellPrice,
            currentStock: resolvedInitialStock,
            minStockAlert: data.minStockAlert ?? 5,
            isActive: true,
          },
        });

        if (data.stockMethod === "RESEP" && data.variants && data.variants.length > 0) {
          await createProductVariantsWithCost(tx, {
            roomId: user.roomId,
            productId: product.id,
            sellPrice: data.sellPrice,
            variants: data.variants,
            missingIngredientError: "CONFLICT:Bahan baku resep tidak ditemukan pada ruangan ini.",
          });
        }

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "KATALOG",
            actionSummary: `Menambahkan produk "${product.name}" (Metode: ${product.stockMethod}) langsung ke katalog aktif`,
            entityType: "Product",
            entityId: product.id,
            afterData: product,
            approvalState: "DISETUJUI",
            linkUrl: "/produk",
          },
          tx
        );

        return tx.product.findUnique({
          where: { id: product.id },
          include: {
            category: true,
            variants: { include: { ingredients: { include: { material: true } } } },
          },
        });
      });

      return NextResponse.json({ mode: "DIRECT", product: created }, { status: 201 });
    }

    // JALUR 2: PEGAWAI (KASIR / GUDANG / KASIR_GUDANG) -> Masuk ke antrean persetujuan (MENUNGGU_PERSETUJUAN)
    const duplicatePending = await prisma.productRequest.findFirst({
      where: {
        roomId: user.roomId,
        status: "MENUNGGU_PERSETUJUAN",
        OR: [
          { sku: normalizedSku },
          ...(normalizedBarcode ? [{ barcode: normalizedBarcode }] : []),
        ],
      },
      select: { id: true, name: true, sku: true },
    });

    if (duplicatePending) {
      return NextResponse.json(
        {
          error: `Pengajuan produk dengan SKU/barcode serupa ("${duplicatePending.name}") sedang menunggu persetujuan.`,
        },
        { status: 409 }
      );
    }

    const productRequest = await prisma.$transaction(async (tx) => {
      const createdReq = await tx.productRequest.create({
        data: {
          roomId: user.roomId,
          requestedById: user.id,
          status: "MENUNGGU_PERSETUJUAN",
          sku: normalizedSku,
          barcode: normalizedBarcode,
          name: normalizedName,
          categoryId: category.id,
          stockMethod: data.stockMethod,
          isRawMaterial: Boolean(data.isRawMaterial),
          purchaseUnit: data.purchaseUnit,
          sellUnit: resolvedSellUnit,
          conversionRatio: ratio,
          costPrice: data.costPrice,
          sellPrice: data.sellPrice,
          minStockAlert: data.minStockAlert ?? 5,
          variantsJson:
            data.stockMethod === "RESEP" && data.variants
              ? JSON.stringify(data.variants)
              : resolvedInitialStock > 0
              ? JSON.stringify({ initialStock: resolvedInitialStock })
              : null,
        },
        include: {
          category: true,
          requestedBy: { select: { id: true, name: true, username: true, role: true } },
        },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${user.name} mengajukan penambahan produk baru "${createdReq.name}" (SKU: ${createdReq.sku}) untuk persetujuan`,
          entityType: "ProductRequest",
          entityId: createdReq.id,
          afterData: {
            sku: createdReq.sku,
            name: createdReq.name,
            sellPrice: createdReq.sellPrice,
            costPrice: createdReq.costPrice,
            status: "MENUNGGU_PERSETUJUAN",
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: "/produk",
        },
        tx
      );

      await createNotification(
        {
          roomId: user.roomId,
          title: `Pengajuan Produk Baru: ${createdReq.name}`,
          message: `${user.name} mengajukan produk baru "${createdReq.name}" (SKU: ${createdReq.sku}). Tinjau dan putuskan pada halaman Produk.`,
          severity: "INFO",
          category: "KATALOG",
          targetRole: null,
          linkUrl: "/produk",
        },
        tx
      );

      return createdReq;
    });

    return NextResponse.json(
      {
        mode: "REQUEST",
        productRequest,
        message:
          "Pengajuan produk baru telah dikirim dan menunggu persetujuan Pemilik atau Manajer.",
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9) }, { status: 409 });
    }
    return handleApiError(err, "/api/products", "Gagal menyimpan produk.");
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canEdit = await checkUserPermission(user.role, "produk", "edit");
    if (!canEdit) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengubah konfigurasi produk." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success || !parsed.data.id) {
      return NextResponse.json(
        { error: parsed.error?.issues[0]?.message || "ID produk wajib disertakan" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const productId = data.id!;
    const existing = await prisma.product.findFirst({
      where: { id: productId, roomId: user.roomId },
      include: { variants: { include: { ingredients: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Produk tidak ditemukan pada ruangan ini." }, { status: 404 });
    }

    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, roomId: user.roomId },
    });
    if (!category) {
      return NextResponse.json({ error: "Kategori tidak valid untuk ruangan ini." }, { status: 400 });
    }

    const normalizedSku = data.sku.trim().toUpperCase();
    const normalizedBarcode = data.barcode?.trim() ? data.barcode.trim() : null;

    const conflict = await prisma.product.findFirst({
      where: {
        roomId: user.roomId,
        id: { not: productId },
        OR: [
          { sku: normalizedSku },
          ...(normalizedBarcode ? [{ barcode: normalizedBarcode }] : []),
        ],
      },
      select: { name: true, sku: true },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `SKU atau barcode sudah digunakan oleh produk "${conflict.name}".` },
        { status: 409 }
      );
    }

    // Pegawai non-admin tidak boleh mengubah harga/produk secara langsung; kirim usulan persetujuan
    if (!isStoreAdmin(user.role)) {
      const ratio = data.stockMethod === "TETAP" ? 1 : data.conversionRatio;
      const resolvedSellUnit = data.stockMethod === "TETAP" ? data.purchaseUnit : data.sellUnit;
      const requestedStock =
        typeof data.currentStock === "number" && data.stockMethod !== "RESEP"
          ? Math.max(0, data.currentStock)
          : undefined;
      const hasStockChange =
        typeof requestedStock === "number" && requestedStock !== existing.currentStock;
      const batchId = `BATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const variantsJson = serializeProductRequestEnvelope({
        requestKind: "UPDATE",
        targetProductId: existing.id,
        previousSnapshot: {
          name: existing.name,
          sku: existing.sku,
          barcode: existing.barcode,
          costPrice: existing.costPrice,
          sellPrice: existing.sellPrice,
          currentStock: existing.currentStock,
          minStockAlert: existing.minStockAlert,
          stockMethod: existing.stockMethod,
          purchaseUnit: existing.purchaseUnit,
          sellUnit: existing.sellUnit,
          conversionRatio: existing.conversionRatio,
        },
        initialStock: hasStockChange ? requestedStock : undefined,
        variants: data.stockMethod === "RESEP" && data.variants ? data.variants : undefined,
        batchId,
        batchIndex: 0,
        batchSize: 1,
        batchTitle: `Ubah ${data.name.trim()}`,
      });

      const createdRequest = await prisma.$transaction(async (tx) => {
        const reqRow = await tx.productRequest.create({
          data: {
            roomId: user.roomId,
            requestedById: user.id,
            status: "MENUNGGU_PERSETUJUAN",
            sku: normalizedSku,
            barcode: normalizedBarcode,
            name: data.name.trim(),
            categoryId: category.id,
            stockMethod: data.stockMethod,
            isRawMaterial: Boolean(data.isRawMaterial),
            purchaseUnit: data.purchaseUnit,
            sellUnit: resolvedSellUnit,
            conversionRatio: ratio,
            costPrice: data.costPrice,
            sellPrice: data.sellPrice,
            minStockAlert: data.minStockAlert ?? existing.minStockAlert,
            variantsJson,
          },
          include: {
            category: { select: { id: true, name: true, areaType: true } },
            requestedBy: { select: { id: true, name: true, username: true, role: true } },
            reviewedBy: { select: { id: true, name: true, username: true, role: true } },
          },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PRODUCT_REQUEST",
            actionSummary: `${user.name} mengajukan perubahan harga/data "${reqRow.name}" (Rp ${existing.sellPrice.toLocaleString("id-ID")} -> Rp ${reqRow.sellPrice.toLocaleString("id-ID")})`,
            entityType: "ProductRequestBatch",
            entityId: batchId,
            beforeData: {
              productId: existing.id,
              name: existing.name,
              costPrice: existing.costPrice,
              sellPrice: existing.sellPrice,
              currentStock: existing.currentStock,
            },
            afterData: {
              productId: existing.id,
              name: reqRow.name,
              costPrice: reqRow.costPrice,
              sellPrice: reqRow.sellPrice,
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/produk?tab=requests",
          },
          tx
        );

        await createNotification(
          {
            roomId: user.roomId,
            title: "Usulan Perubahan Produk/Harga",
            message: `${user.name} mengusulkan perubahan pada "${reqRow.name}". Menunggu persetujuan Pemilik atau Manajer.`,
            severity: "INFO",
            category: "KATALOG",
            targetRole: null,
            linkUrl: "/produk?tab=requests",
          },
          tx
        );

        return reqRow;
      });

      return NextResponse.json(
        {
          mode: "REQUEST",
          productRequest: createdRequest,
          message: `Perubahan "${createdRequest.name}" diajukan dan menunggu persetujuan Pemilik atau Manajer.`,
        },
        { status: 202 }
      );
    }

    const ratio = data.stockMethod === "TETAP" ? 1 : data.conversionRatio;

    const updated = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id: productId },
        data: {
          sku: normalizedSku,
          barcode: normalizedBarcode,
          name: data.name.trim(),
          categoryId: category.id,
          stockMethod: data.stockMethod,
          isRawMaterial: Boolean(data.isRawMaterial),
          purchaseUnit: data.purchaseUnit,
          sellUnit: data.stockMethod === "TETAP" ? data.purchaseUnit : data.sellUnit,
          conversionRatio: ratio,
          costPrice: data.costPrice,
          sellPrice: data.sellPrice,
          ...(typeof data.currentStock === "number" && data.stockMethod !== "RESEP"
            ? { currentStock: Math.max(0, data.currentStock) }
            : {}),
          minStockAlert: data.minStockAlert ?? existing.minStockAlert,
        },
      });

      if (data.stockMethod === "RESEP" && data.variants) {
        await tx.productVariant.deleteMany({ where: { productId } });
        await createProductVariantsWithCost(tx, {
          roomId: user.roomId,
          productId: prod.id,
          sellPrice: data.sellPrice,
          variants: data.variants,
          missingIngredientError: "CONFLICT:Bahan baku resep tidak ditemukan pada ruangan ini.",
        });
      }

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "KATALOG",
          actionSummary: `Mengubah konfigurasi produk "${prod.name}" (Metode: ${prod.stockMethod})`,
          entityType: "Product",
          entityId: prod.id,
          beforeData: existing,
          afterData: prod,
          approvalState: "TERCATAT",
          linkUrl: "/produk",
        },
        tx
      );

      return tx.product.findUnique({
        where: { id: prod.id },
        include: {
          category: true,
          variants: { include: { ingredients: { include: { material: true } } } },
        },
      });
    });

    return NextResponse.json({ product: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9) }, { status: 409 });
    }
    return handleApiError(err, "/api/products", "Gagal memperbarui produk.");
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canEdit =
      isStoreAdmin(user.role) || (await checkUserPermission(user.role, "produk", "edit"));
    if (!canEdit) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin menghapus produk atau resep." },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    let productId = url.searchParams.get("id")?.trim() || "";
    if (!productId) {
      try {
        const body = (await request.json()) as { id?: unknown };
        if (typeof body?.id === "string") productId = body.id.trim();
      } catch {
        // body optional when ?id= is provided
      }
    }

    if (!productId) {
      return NextResponse.json({ error: "ID produk wajib disertakan." }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { id: productId, roomId: user.roomId, isActive: true },
      include: {
        usedInRecipes: {
          include: {
            variant: {
              include: {
                product: { select: { id: true, name: true, isActive: true } },
              },
            },
          },
        },
        _count: {
          select: {
            saleItems: true,
            purchaseItems: true,
            stockAdjustments: true,
            opnameItems: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan atau sudah dihapus." },
        { status: 404 }
      );
    }

    const activeDependentMenus = Array.from(
      new Set(
        existing.usedInRecipes
          .filter((r) => r.variant.product.isActive && r.variant.product.id !== existing.id)
          .map((r) => r.variant.product.name)
      )
    );

    if (activeDependentMenus.length > 0) {
      return NextResponse.json(
        {
          error: `Bahan baku "${existing.name}" masih dipakai pada resep menu: ${activeDependentMenus.join(", ")}. Hapus atau ubah resep menu tersebut terlebih dahulu.`,
        },
        { status: 409 }
      );
    }

    const hasHistory =
      existing._count.saleItems > 0 ||
      existing._count.purchaseItems > 0 ||
      existing._count.stockAdjustments > 0 ||
      existing._count.opnameItems > 0;

    await prisma.$transaction(async (tx) => {
      // Bersihkan relasi resep dari produk nonaktif jika ada agar penghapusan aman
      await tx.recipeIngredient.deleteMany({
        where: { materialId: existing.id },
      });

      if (hasHistory) {
        await tx.product.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            barcode: null,
            sku: `${existing.sku}__DEL_${Date.now().toString(36)}`,
          },
        });
      } else {
        await tx.product.delete({
          where: { id: existing.id },
        });
      }

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "KATALOG",
          actionSummary: `Menghapus ${existing.isRawMaterial ? "bahan baku" : existing.stockMethod === "RESEP" ? "produk resep" : "produk"} "${existing.name}" (${existing.sku})`,
          entityType: "Product",
          entityId: existing.id,
          beforeData: {
            id: existing.id,
            sku: existing.sku,
            name: existing.name,
            stockMethod: existing.stockMethod,
            isRawMaterial: existing.isRawMaterial,
          },
          approvalState: "TERCATAT",
          linkUrl: "/produk",
        },
        tx
      );
    });

    return NextResponse.json({
      deleted: true,
      mode: hasHistory ? "ARCHIVED" : "HARD_DELETED",
      id: existing.id,
      name: existing.name,
    });
  } catch (err) {
    return handleApiError(err, "/api/products", "Gagal menghapus produk.");
  }
}
