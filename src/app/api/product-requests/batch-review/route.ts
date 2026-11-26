import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { parseProductRequestEnvelope } from "@/lib/product-request-batch";
import { z } from "zod";

const batchReviewSchema = z.object({
  batchId: z.string().trim().optional(),
  requestIds: z.array(z.string().min(1)).optional(),
  decision: z.enum(["DISETUJUI", "DITOLAK"], {
    error: "Keputusan harus DISETUJUI atau DITOLAK.",
  }),
  rejectionReason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const reviewer = auth.user;

    if (!isStoreAdmin(reviewer.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang berwenang memproses paket pengajuan produk." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = batchReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Permintaan review paket tidak valid." },
        { status: 400 }
      );
    }

    const { batchId, requestIds, decision, rejectionReason } = parsed.data;
    if (!batchId && (!requestIds || requestIds.length === 0)) {
      return NextResponse.json(
        { error: "Sertakan batchId atau daftar requestIds yang akan diproses." },
        { status: 400 }
      );
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const candidateRows = await tx.productRequest.findMany({
        where: {
          roomId: reviewer.roomId,
          status: "MENUNGGU_PERSETUJUAN",
          ...(requestIds && requestIds.length > 0 ? { id: { in: requestIds } } : {}),
        },
        include: {
          category: true,
          requestedBy: { select: { id: true, name: true, username: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      const targetRows =
        requestIds && requestIds.length > 0
          ? candidateRows
          : candidateRows.filter((row) => parseProductRequestEnvelope(row.variantsJson).batchId === batchId);

      if (targetRows.length === 0) {
        throw new Error("NOT_FOUND:Tidak ada item pengajuan berstatus Menunggu Persetujuan pada paket ini.");
      }

      const approvedProducts: unknown[] = [];
      const updatedRequests: unknown[] = [];

      if (decision === "DISETUJUI") {
        // Urutkan agar Bahan Baku & Produk Langsung Jual dibuat lebih dulu sebelum Menu Resep
        const sortedRows = [...targetRows].sort((a, b) => {
          const rank = (r: typeof a) =>
            r.isRawMaterial ? 0 : r.stockMethod !== "RESEP" ? 1 : 2;
          return rank(a) - rank(b);
        });

        const tempIdToProductId = new Map<string, string>();

        for (const reqRow of sortedRows) {
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
              `CONFLICT:Tidak dapat menyetujui "${reqRow.name}" karena SKU/barcode sudah dipakai oleh produk "${dup.name}".`
            );
          }

          const env = parseProductRequestEnvelope(reqRow.variantsJson);
          const approvedInitialStock =
            reqRow.stockMethod !== "RESEP" && typeof env.initialStock === "number"
              ? Math.max(0, env.initialStock)
              : 0;

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

          if (env.clientTempId) {
            tempIdToProductId.set(env.clientTempId, createdProd.id);
          }

          if (reqRow.stockMethod === "RESEP" && env.variants && env.variants.length > 0) {
            let primaryVariantCost: number | null = null;
            let primaryVariantSellPrice: number | null = null;

            for (const v of env.variants) {
              let calculatedCost = v.costPrice ?? 0;
              const resolvedIngredients: {
                materialId: string;
                quantity: number;
                unit: string;
              }[] = [];

              if (v.ingredients && v.ingredients.length > 0) {
                let sumCost = 0;
                for (const ing of v.ingredients) {
                  const resolvedMatId = tempIdToProductId.get(ing.materialId) || ing.materialId;
                  const mat = await tx.product.findFirst({
                    where: { id: resolvedMatId, roomId: reviewer.roomId },
                  });
                  if (!mat) {
                    throw new Error(
                      `CONFLICT:Bahan baku resep untuk "${reqRow.name}" tidak ditemukan atau belum aktif.`
                    );
                  }
                  sumCost += Math.round(mat.costPrice * ing.quantity);
                  resolvedIngredients.push({
                    materialId: mat.id,
                    quantity: ing.quantity,
                    unit: ing.unit,
                  });
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
                  ingredients:
                    resolvedIngredients.length > 0
                      ? {
                          create: resolvedIngredients.map((ing) => ({
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

          const hydratedProd = await tx.product.findUnique({
            where: { id: createdProd.id },
            include: {
              category: true,
              variants: { include: { ingredients: { include: { material: true } } } },
            },
          });
          approvedProducts.push(hydratedProd);

          const updatedReq = await tx.productRequest.update({
            where: { id: reqRow.id },
            data: {
              status: "DISETUJUI",
              reviewedById: reviewer.id,
              reviewedAt: now,
              rejectionReason: null,
              approvedProductId: createdProd.id,
            },
          });
          updatedRequests.push(updatedReq);
        }
      } else {
        const cleanReason = rejectionReason?.trim() || null;
        for (const reqRow of targetRows) {
          const updatedReq = await tx.productRequest.update({
            where: { id: reqRow.id },
            data: {
              status: "DITOLAK",
              reviewedById: reviewer.id,
              reviewedAt: now,
              rejectionReason: cleanReason,
              approvedProductId: null,
            },
          });
          updatedRequests.push(updatedReq);
        }
      }

      const itemNamesSummary = targetRows
        .slice(0, 3)
        .map((r) => r.name)
        .join(", ");
      const extraSuffix = targetRows.length > 3 ? ` (+${targetRows.length - 3} lainnya)` : "";

      await recordAuditLog(
        {
          roomId: reviewer.roomId,
          actorId: reviewer.id,
          actorName: reviewer.name,
          actorRole: reviewer.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} paket pengajuan (${targetRows.length} item): ${itemNamesSummary}${extraSuffix}`,
          entityType: "ProductRequestBatch",
          entityId: batchId || targetRows[0].id,
          beforeData: { status: "MENUNGGU_PERSETUJUAN", count: targetRows.length },
          afterData: {
            status: decision,
            processedCount: targetRows.length,
            rejectionReason: decision === "DITOLAK" ? rejectionReason?.trim() || null : null,
          },
          approvalState: decision,
          linkUrl: "/produk?tab=requests",
        },
        tx
      );

      const requesterMap = new Map<string, string[]>();
      for (const r of targetRows) {
        const list = requesterMap.get(r.requestedById) || [];
        list.push(r.name);
        requesterMap.set(r.requestedById, list);
      }

      for (const [requesterId, names] of requesterMap.entries()) {
        const summary = names.slice(0, 3).join(", ") + (names.length > 3 ? ` (+${names.length - 3} lainnya)` : "");
        await createNotification(
          {
            roomId: reviewer.roomId,
            title:
              decision === "DISETUJUI"
                ? `Paket Pengajuan Disetujui (${names.length} Barang)`
                : `Paket Pengajuan Ditolak (${names.length} Barang)`,
            message:
              decision === "DISETUJUI"
                ? `${names.length} item (${summary}) disetujui oleh ${reviewer.name} dan kini aktif di katalog.`
                : `${names.length} item (${summary}) ditolak oleh ${reviewer.name}.${
                    rejectionReason?.trim() ? ` Alasan: ${rejectionReason.trim()}` : ""
                  }`,
            severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
            category: "KATALOG",
            userId: requesterId,
            linkUrl: "/produk?tab=requests",
          },
          tx
        );
      }

      return {
        decision,
        processedCount: targetRows.length,
        approvedProducts,
        updatedRequests,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal memproses paket pengajuan produk.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}

