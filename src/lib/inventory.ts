import { Prisma } from "@prisma/client";

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
    throw new Error("Produk tidak ditemukan di katalog.");
  }

  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Jumlah pembelian harus lebih dari 0.");
  }

  // Method 3: RESEP & VARIAN
  if (product.stockMethod === "RESEP") {
    const variant = params.variantId
      ? product.variants.find((v) => v.id === params.variantId)
      : product.variants[0];

    if (!variant) {
      throw new Error(`Produk resep "${product.name}" wajib memiliki varian ukuran/takaran.`);
    }

    if (variant.ingredients.length === 0) {
      throw new Error(`Varian "${variant.name}" pada "${product.name}" belum memiliki komposisi bahan baku.`);
    }

    let calculatedUnitCost = 0;
    const deductions: StockDeductionResult["deductions"] = [];

    // First verify all ingredient stocks are sufficient
    for (const ing of variant.ingredients) {
      const neededQty = Number((ing.quantity * qty).toFixed(4));
      if (ing.material.currentStock < neededQty) {
        throw new Error(
          `Stok bahan baku "${ing.material.name}" tidak mencukupi. Tersedia: ${ing.material.currentStock} ${ing.material.sellUnit}, dibutuhkan: ${neededQty} ${ing.material.sellUnit}.`
        );
      }
      calculatedUnitCost += Math.round(ing.quantity * ing.material.costPrice);
    }

    const effectiveUnitCost = calculatedUnitCost > 0 ? calculatedUnitCost : variant.costPrice;

    // Deduct each raw material
    for (const ing of variant.ingredients) {
      const neededQty = Number((ing.quantity * qty).toFixed(4));
      await tx.product.update({
        where: { id: ing.materialId },
        data: {
          currentStock: {
            decrement: neededQty,
          },
        },
      });
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

  // Method 1 (TETAP 1:1) & Method 2 (PECAH SATUAN)
  if (product.currentStock < qty) {
    throw new Error(
      `Stok "${product.name}" tidak mencukupi. Tersedia: ${product.currentStock} ${product.sellUnit}, diminta: ${qty} ${product.sellUnit}.`
    );
  }

  await tx.product.update({
    where: { id: product.id },
    data: {
      currentStock: {
        decrement: qty,
      },
    },
  });

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
          ingredients: true,
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

