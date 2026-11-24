import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const reviewSchema = z.object({
  decision: z.enum(["DISETUJUI", "DITOLAK"], {
    errorMap: () => ({ message: "Keputusan harus DISETUJUI atau DITOLAK." }),
  }),
  rejectionReason: z.string().trim().max(500).optional(),
});

interface StoredVariant {
  name: string;
  sellPrice: number;
  costPrice?: number;
  ingredients?: { materialId: string; quantity: number; unit: string }[];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const reviewer = auth.user;

    // Hanya Pemilik atau Manajer yang boleh menyetujui/menolak pengajuan produk baru
    if (!isStoreAdmin(reviewer.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang berwenang memutuskan pengajuan produk baru." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Keputusan review tidak valid." },
        { status: 400 }
      );
    }

    const { decision, rejectionReason } = parsed.data;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const reqRow = await tx.productRequest.findUnique({
        where: { id },
        include: {
          category: true,
          requestedBy: { select: { id: true, name: true, username: true, role: true } },
        },
      });

      if (!reqRow || reqRow.roomId !== reviewer.roomId) {
        throw new Error("NOT_FOUND:Pengajuan produk tidak ditemukan pada ruangan ini.");
      }

      if (reqRow.status !== "MENUNGGU_PERSETUJUAN") {
        throw new Error(
          `CONFLICT:Pengajuan produk ini sudah diproses sebelumnya (${reqRow.status}).`
        );
      }

      let approvedProduct = null;

      if (decision === "DISETUJUI") {
        // Cegah produk ganda sebelum aktivasi ke katalog
        const dup = await tx.product.findFirst({
          where: {
            roomId: reviewer.roomId,
            OR: [
              { sku: reqRow.sku },
              ...(reqRow.barcode ? [{ barcode: reqRow.barcode }] : []),
            ],
          },
          select: { name: true, sku: true },
        });
        if (dup) {
          throw new Error(
            `CONFLICT:Tidak dapat menyetujui karena SKU/barcode sudah dipakai oleh produk "${dup.name}".`
          );
        }

        let approvedInitialStock = 0;
        let parsedVariants: StoredVariant[] = [];
        if (reqRow.variantsJson) {
          try {
            const parsedJson = JSON.parse(reqRow.variantsJson) as
              | StoredVariant[]
              | { initialStock?: number; variants?: StoredVariant[] };
            if (Array.isArray(parsedJson)) {
              parsedVariants = parsedJson;
            } else if (parsedJson && typeof parsedJson === "object") {
              if (typeof parsedJson.initialStock === "number" && reqRow.stockMethod !== "RESEP") {
                approvedInitialStock = Math.max(0, Number(parsedJson.initialStock) || 0);
              }
              if (Array.isArray(parsedJson.variants)) {
                parsedVariants = parsedJson.variants;
              }
            }
          } catch {
            // abaikan jika JSON tidak valid
          }
        }

        const createdProd = await tx.product.create({
          data: {
            roomId: reviewer.roomId,
            sku: reqRow.sku,
            barcode: reqRow.barcode,
            name: reqRow.name,
            categoryId: reqRow.categoryId,
            stockMethod: reqRow.stockMethod,
            isRawMaterial: reqRow.isRawMaterial,
            purchaseUnit: reqRow.purchaseUnit,
            sellUnit: reqRow.sellUnit,
            conversionRatio: reqRow.conversionRatio,
            costPrice: reqRow.costPrice,
            sellPrice: reqRow.sellPrice,
            currentStock: approvedInitialStock,
            minStockAlert: reqRow.minStockAlert,
            isActive: true,
          },
        });

        if (reqRow.stockMethod === "RESEP" && parsedVariants.length > 0) {
          let primaryVariantCost: number | null = null;
          let primaryVariantSellPrice: number | null = null;

          for (const v of parsedVariants) {
            let calculatedCost = v.costPrice ?? 0;
            if (v.ingredients && v.ingredients.length > 0) {
              let sumCost = 0;
              for (const ing of v.ingredients) {
                const mat = await tx.product.findFirst({
                  where: { id: ing.materialId, roomId: reviewer.roomId },
                });
                if (mat) {
                  sumCost += Math.round(mat.costPrice * ing.quantity);
                }
              }
              if (sumCost > 0) calculatedCost = sumCost;
            }

            if (primaryVariantCost === null) {
              primaryVariantCost = calculatedCost;
              primaryVariantSellPrice = v.sellPrice;
            }

            await tx.productVariant.create({
              data: {
                productId: createdProd.id,
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

          if (primaryVariantCost !== null) {
            await tx.product.update({
              where: { id: createdProd.id },
              data: {
                costPrice: primaryVariantCost,
                ...(reqRow.sellPrice <= 0 && primaryVariantSellPrice !== null
                  ? { sellPrice: primaryVariantSellPrice }
                  : {}),
              },
            });
          }
        }

        approvedProduct = await tx.product.findUnique({
          where: { id: createdProd.id },
          include: {
            category: true,
            variants: { include: { ingredients: { include: { material: true } } } },
          },
        });
      }

      const updatedRequest = await tx.productRequest.update({
        where: { id: reqRow.id },
        data: {
          status: decision,
          reviewedById: reviewer.id,
          reviewedAt: now,
          rejectionReason: decision === "DITOLAK" ? rejectionReason?.trim() || null : null,
          approvedProductId: approvedProduct?.id ?? null,
        },
        include: {
          category: { select: { id: true, name: true, areaType: true } },
          requestedBy: { select: { id: true, name: true, username: true, role: true } },
          reviewedBy: { select: { id: true, name: true, username: true, role: true } },
        },
      });

      await recordAuditLog(
        {
          roomId: reviewer.roomId,
          actorId: reviewer.id,
          actorName: reviewer.name,
          actorRole: reviewer.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} pengajuan produk "${reqRow.name}" (SKU: ${reqRow.sku}) dari ${reqRow.requestedBy.name}`,
          entityType: "ProductRequest",
          entityId: reqRow.id,
          beforeData: { status: "MENUNGGU_PERSETUJUAN" },
          afterData: {
            status: decision,
            approvedProductId: approvedProduct?.id ?? null,
            rejectionReason: updatedRequest.rejectionReason,
          },
          approvalState: decision,
          linkUrl: "/produk",
        },
        tx
      );

      await createNotification(
        {
          roomId: reviewer.roomId,
          title:
            decision === "DISETUJUI"
              ? `Pengajuan Produk Disetujui: ${reqRow.name}`
              : `Pengajuan Produk Ditolak: ${reqRow.name}`,
          message:
            decision === "DISETUJUI"
              ? `Produk "${reqRow.name}" telah disetujui oleh ${reviewer.name} dan kini aktif di katalog.`
              : `Pengajuan produk "${reqRow.name}" ditolak oleh ${reviewer.name}.${
                  updatedRequest.rejectionReason ? ` Alasan: ${updatedRequest.rejectionReason}` : ""
                }`,
          severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
          category: "KATALOG",
          userId: reqRow.requestedById,
          linkUrl: "/produk",
        },
        tx
      );

      return { productRequest: updatedRequest, product: approvedProduct };
    });

    return NextResponse.json(result);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal memproses keputusan produk.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}

