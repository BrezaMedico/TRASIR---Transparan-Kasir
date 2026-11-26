import { Prisma } from "@prisma/client";
import { parseProductRequestEnvelope } from "@/lib/product-request-batch";
import { AppError } from "@/lib/api-error";

export interface StockDeductionResult {
  unitCost: number;
  totalCost: number;
  deductions: {
    productId: string;
    productName: string;
    quantityDeducted: number;
    unit: string;
  }[];
}

/**
 * Calculates and executes stock deduction for the 3 stock management methods:
 * 1. TETAP (1:1): Directly deducts `qty` from `product.currentStock`.
 * 2. PECAH: Directly deducts `qty` (in sellUnit) from `product.currentStock` (which is stored in sellUnit).
 * 3. RESEP: Deducts each ingredient's `recipeQty * qty` from the ingredient material's `currentStock`.
 */
export async function deductStockForSaleItem(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    variantId?: string | null;
    quantity: number;
  }
): Promise<StockDeductionResult> {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    include: {
      variants: {
        include: {
          ingredients: {
            include: {
              material: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new AppError("Produk tidak ditemukan di katalog.", 400);
  }

  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new AppError("Jumlah pembelian harus lebih dari 0.", 400);
  }

  // Method 3: RESEP & VARIAN
  if (product.stockMethod === "RESEP") {
    const variant = params.variantId
      ? product.variants.find((v) => v.id === params.variantId)
      : product.variants[0];

    if (!variant) {
      throw new AppError(`Produk resep "${product.name}" wajib memiliki varian ukuran/takaran.`, 400);
    }

    if (variant.ingredients.length === 0) {
      throw new AppError(`Varian "${variant.name}" pada "${product.name}" belum memiliki komposisi bahan baku.`, 400);
    }

    let calculatedUnitCost = 0;
    const deductions: StockDeductionResult["deductions"] = [];

    // Validate room ownership and compute recipe unit cost
    for (const ing of variant.ingredients) {
      if (ing.material.roomId !== product.roomId) {
        throw new AppError("Komposisi bahan baku tidak valid untuk ruangan ini.", 400);
      }
      calculatedUnitCost += Math.round(ing.quantity * ing.material.costPrice);
    }

    const effectiveUnitCost = calculatedUnitCost > 0 ? calculatedUnitCost : variant.costPrice;

    // Atomically deduct each raw material only when currentStock >= neededQty
    for (const ing of variant.ingredients) {
      const neededQty = Number((ing.quantity * qty).toFixed(4));
      const updated = await tx.product.updateMany({
        where: {
          id: ing.materialId,
          roomId: product.roomId,
          currentStock: { gte: neededQty },
        },
        data: {
          currentStock: {
            decrement: neededQty,
          },
        },
      });
      if (updated.count === 0) {
        throw new AppError(
          `Stok bahan baku "${ing.material.name}" tidak mencukupi. Dibutuhkan: ${neededQty} ${ing.material.sellUnit}.`,
          400
        );
      }
      deductions.push({
        productId: ing.materialId,
        productName: ing.material.name,
        quantityDeducted: neededQty,
        unit: ing.material.sellUnit,
      });
    }

    return {
      unitCost: effectiveUnitCost,
      totalCost: Math.round(effectiveUnitCost * qty),
      deductions,
    };
  }

  // Method 1 (TETAP 1:1) & Method 2 (PECAH SATUAN): atomic conditional deduction
  const updated = await tx.product.updateMany({
    where: {
      id: product.id,
      roomId: product.roomId,
      currentStock: { gte: qty },
    },
    data: {
      currentStock: {
        decrement: qty,
      },
    },
  });

  if (updated.count === 0) {
    throw new AppError(
      `Stok "${product.name}" tidak mencukupi. Diminta: ${qty} ${product.sellUnit}.`,
      400
    );
  }

  return {
    unitCost: product.costPrice,
    totalCost: Math.round(product.costPrice * qty),
    deductions: [
      {
        productId: product.id,
        productName: product.name,
        quantityDeducted: qty,
        unit: product.sellUnit,
      },
    ],
  };
}

/**
 * Restores stock when a sale cancellation (PEMBATALAN) or return (RETUR) is approved by Pemilik.
 */
export async function restoreStockForSaleItem(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    variantId?: string | null;
    quantity: number;
  }
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    include: {
      variants: {
        include: {
          ingredients: {
            include: {
              material: { select: { roomId: true } },
            },
          },
        },
      },
    },
  });

  if (!product) return;

  const qty = Number(params.quantity);

  if (product.stockMethod === "RESEP") {
    const variant = params.variantId
      ? product.variants.find((v) => v.id === params.variantId)
      : product.variants[0];

    if (variant) {
      for (const ing of variant.ingredients) {
        if (ing.material.roomId !== product.roomId) continue;
        const restoreQty = Number((ing.quantity * qty).toFixed(4));
        await tx.product.update({
          where: { id: ing.materialId },
          data: {
            currentStock: {
              increment: restoreQty,
            },
          },
        });
      }
    }
    return;
  }

  await tx.product.update({
    where: { id: product.id },
    data: {
      currentStock: {
        increment: qty,
      },
    },
  });
}

export interface VariantIngredientInput {
  materialId: string;
  quantity: number;
  unit: string;
}

export interface ProductVariantInput {
  name: string;
  sellPrice: number;
  costPrice?: number | null;
  ingredients?: VariantIngredientInput[];
}

/**
 * Creates ProductVariant and RecipeIngredient rows inside a transaction,
 * enforcing room ownership and syncing primary variant cost/sell price to the parent product.
 */
export async function createProductVariantsWithCost(
  tx: Prisma.TransactionClient,
  params: {
    roomId: string;
    productId: string;
    sellPrice: number;
    variants: ProductVariantInput[];
    tempIdToProductId?: Map<string, string>;
    missingIngredientError: string;
  }
): Promise<void> {
  let primaryVariantCost: number | null = null;
  let primaryVariantSellPrice: number | null = null;

  for (const v of params.variants) {
    let calculatedCost = v.costPrice ?? 0;
    const resolvedIngredients: VariantIngredientInput[] = [];

    if (v.ingredients && v.ingredients.length > 0) {
      let sumCost = 0;
      for (const ing of v.ingredients) {
        const resolvedMatId =
          params.tempIdToProductId?.get(ing.materialId) || ing.materialId;
        const mat = await tx.product.findFirst({
          where: { id: resolvedMatId, roomId: params.roomId },
        });
        if (!mat) {
          throw new Error(params.missingIngredientError);
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
        productId: params.productId,
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
      where: { id: params.productId },
      data: {
        costPrice: primaryVariantCost,
        ...(params.sellPrice <= 0 && primaryVariantSellPrice !== null
          ? { sellPrice: primaryVariantSellPrice }
          : {}),
      },
    });
  }
}

export async function applyApprovedProductRequest(
  tx: Prisma.TransactionClient,
  params: {
    roomId: string;
    reqRow: {
      id: string;
      sku: string;
      barcode: string | null;
      name: string;
      categoryId: string;
      stockMethod: string;
      isRawMaterial: boolean;
      purchaseUnit: string;
      sellUnit: string;
      conversionRatio: number;
      costPrice: number;
      sellPrice: number;
      minStockAlert: number;
      variantsJson: string | null;
    };
    tempIdToProductId?: Map<string, string>;
  }
) {
  const { roomId, reqRow, tempIdToProductId } = params;
  const env = parseProductRequestEnvelope(reqRow.variantsJson);
  const isUpdate = env.requestKind === "UPDATE" && Boolean(env.targetProductId);
  const targetProductId = isUpdate ? env.targetProductId! : undefined;

  if (targetProductId) {
    const existingTarget = await tx.product.findFirst({
      where: { id: targetProductId, roomId },
      select: { id: true },
    });
    if (!existingTarget) {
      throw new Error(
        `CONFLICT:Produk "${reqRow.name}" sudah dihapus atau tidak ditemukan di katalog ruangan ini.`
      );
    }
  }

  const dup = await tx.product.findFirst({
    where: {
      roomId,
      ...(targetProductId ? { id: { not: targetProductId } } : {}),
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

  const hasExplicitStock =
    reqRow.stockMethod !== "RESEP" && typeof env.initialStock === "number";
  const resolvedStock = hasExplicitStock ? Math.max(0, Number(env.initialStock) || 0) : 0;

  let productId: string;
  if (targetProductId) {
    const updatedProd = await tx.product.update({
      where: { id: targetProductId },
      data: {
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
        ...(hasExplicitStock ? { currentStock: resolvedStock } : {}),
        minStockAlert: reqRow.minStockAlert,
        isActive: true,
      },
    });
    productId = updatedProd.id;
    await tx.productVariant.deleteMany({ where: { productId } });
  } else {
    const createdProd = await tx.product.create({
      data: {
        roomId,
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
        currentStock: resolvedStock,
        minStockAlert: reqRow.minStockAlert,
        isActive: true,
      },
    });
    productId = createdProd.id;
    if (env.clientTempId && tempIdToProductId) {
      tempIdToProductId.set(env.clientTempId, productId);
    }
  }

  if (reqRow.stockMethod === "RESEP" && env.variants && env.variants.length > 0) {
    await createProductVariantsWithCost(tx, {
      roomId,
      productId,
      sellPrice: reqRow.sellPrice,
      variants: env.variants,
      tempIdToProductId,
      missingIngredientError: `CONFLICT:Bahan baku resep untuk "${reqRow.name}" tidak ditemukan atau belum aktif.`,
    });
  }

  return tx.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      variants: { include: { ingredients: { include: { material: true } } } },
    },
  });
}

