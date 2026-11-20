import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission, ensureSystemBaseline } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
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
  sku: z.string().min(1, "Kode SKU wajib diisi"),
  barcode: z.string().optional().nullable(),
  name: z.string().min(1, "Nama produk wajib diisi"),
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  stockMethod: z.enum(["TETAP", "PECAH", "RESEP"]),
  isRawMaterial: z.boolean().optional(),
  purchaseUnit: z.string().min(1),
  sellUnit: z.string().min(1),
  conversionRatio: z.number().positive(),
  costPrice: z.number().int().min(0),
  sellPrice: z.number().int().min(0),
  minStockAlert: z.number().min(0).optional(),
  variants: z.array(variantSchema).optional(),
});

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sesi berakhir. Silakan login kembali." }, { status: 401 });
    }

    await ensureSystemBaseline();
    const canView =
      (await checkUserPermission(user.role, "produk", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view")) ||
      (await checkUserPermission(user.role, "pembelian", "view")) ||
      (await checkUserPermission(user.role, "inventaris", "view"));

    if (!canView) {
      return NextResponse.json({ error: "Anda tidak memiliki izin melihat katalog produk." }, { status: 403 });
    }

    const [products, categories, units, warehouses] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        include: {
          category: true,
          variants: {
            include: {
              ingredients: {
                include: { material: true },
              },
            },
          },
          warehouseStocks: {
            include: { warehouse: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.unit.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] }),
      prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    ]);

    return NextResponse.json({ products, categories, units, warehouses });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat katalog produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canCreate = await checkUserPermission(user.role, "produk", "create");
    if (!canCreate) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin menambahkan produk baru." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data produk tidak valid" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const ratio = data.stockMethod === "TETAP" ? 1 : data.conversionRatio;

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: data.sku.trim().toUpperCase(),
          barcode: data.barcode?.trim() ? data.barcode.trim() : null,
          name: data.name.trim(),
          categoryId: data.categoryId,
          stockMethod: data.stockMethod,
          isRawMaterial: Boolean(data.isRawMaterial),
          purchaseUnit: data.purchaseUnit,
          sellUnit: data.stockMethod === "TETAP" ? data.purchaseUnit : data.sellUnit,
          conversionRatio: ratio,
          costPrice: data.costPrice,
          sellPrice: data.sellPrice,
          currentStock: 0, // Stok hanya boleh bertambah melalui Pembelian yang Disetujui Pemilik
          minStockAlert: data.minStockAlert ?? 5,
        },
      });

      if (data.stockMethod === "RESEP" && data.variants && data.variants.length > 0) {
        for (const v of data.variants) {
          let calculatedCost = v.costPrice ?? 0;
          if (v.ingredients && v.ingredients.length > 0) {
            let sumCost = 0;
            for (const ing of v.ingredients) {
              const mat = await tx.product.findUnique({ where: { id: ing.materialId } });
              if (mat) {
                sumCost += Math.round(mat.costPrice * ing.quantity);
              }
            }
            if (sumCost > 0) calculatedCost = sumCost;
          }

          await tx.productVariant.create({
            data: {
              productId: product.id,
              name: v.name.trim(),
              sellPrice: v.sellPrice,
              costPrice: calculatedCost,
              ingredients: v.ingredients
                ? {
                    create: v.ingredients.map((ing) => ({
                      materialId: ing.materialId,
                      quantity: ing.quantity,
                      unit: ing.unit,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      await recordAuditLog(
        {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "KATALOG",
          actionSummary: `Menambahkan produk "${product.name}" (Metode: ${product.stockMethod}) ke katalog`,
          entityType: "Product",
          entityId: product.id,
          afterData: product,
          approvalState: "TERCATAT",
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

    return NextResponse.json({ product: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const existing = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { include: { ingredients: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    }

    const ratio = data.stockMethod === "TETAP" ? 1 : data.conversionRatio;

    const updated = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id: productId },
        data: {
          sku: data.sku.trim().toUpperCase(),
          barcode: data.barcode?.trim() ? data.barcode.trim() : null,
          name: data.name.trim(),
          categoryId: data.categoryId,
          stockMethod: data.stockMethod,
          isRawMaterial: Boolean(data.isRawMaterial),
          purchaseUnit: data.purchaseUnit,
          sellUnit: data.stockMethod === "TETAP" ? data.purchaseUnit : data.sellUnit,
          conversionRatio: ratio,
          costPrice: data.costPrice,
          sellPrice: data.sellPrice,
          minStockAlert: data.minStockAlert ?? existing.minStockAlert,
        },
      });

      if (data.stockMethod === "RESEP" && data.variants) {
        await tx.productVariant.deleteMany({ where: { productId } });
        for (const v of data.variants) {
          let calculatedCost = v.costPrice ?? 0;
          if (v.ingredients && v.ingredients.length > 0) {
            let sumCost = 0;
            for (const ing of v.ingredients) {
              const mat = await tx.product.findUnique({ where: { id: ing.materialId } });
              if (mat) {
                sumCost += Math.round(mat.costPrice * ing.quantity);
              }
            }
            if (sumCost > 0) calculatedCost = sumCost;
          }

          await tx.productVariant.create({
            data: {
              productId: prod.id,
              name: v.name.trim(),
              sellPrice: v.sellPrice,
              costPrice: calculatedCost,
              ingredients: v.ingredients
                ? {
                    create: v.ingredients.map((ing) => ({
                      materialId: ing.materialId,
                      quantity: ing.quantity,
                      unit: ing.unit,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      await recordAuditLog(
        {
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
    const message = err instanceof Error ? err.message : "Gagal memperbarui produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

