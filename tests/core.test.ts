import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { deductStockForSaleItem, restoreStockForSaleItem } from "../src/lib/inventory";
import { ensureSystemBaseline, checkUserPermission, getRolePermissionsMap } from "../src/lib/rbac";
import { computeReceiptHash, analyzePurchaseReceiptWithGemini, NEUTRAL_AI_DISCLAIMER } from "../src/lib/gemini";
import { createSessionToken, verifySessionToken, hashPassword, verifyPassword } from "../src/lib/auth";
import { recordAuditLog } from "../src/lib/audit";

describe("TRASIR Core Financial, Inventory, RBAC, & Anti-Fraud Engine", () => {
  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.saleAmendment.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.shiftClosing.deleteMany();
    await prisma.recipeIngredient.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.stockOpnameItem.deleteMany();
    await prisma.stockOpnameSession.deleteMany();
    await prisma.stockAdjustment.deleteMany();
    await prisma.purchaseItem.deleteMany();
    await prisma.purchase.deleteMany();
    await prisma.productStock.deleteMany();
    await prisma.product.deleteMany();
    await prisma.rolePermission.deleteMany();
    await ensureSystemBaseline();
  });

  it("enforces default RBAC permissions where MANAJER cannot approve by default", async () => {
    const ownerCanApprove = await checkUserPermission("PEMILIK", "pembelian", "approve");
    const managerCanApprove = await checkUserPermission("MANAJER", "pembelian", "approve");
    const cashierCanViewPos = await checkUserPermission("KASIR", "kasir", "view");
    const cashierCanViewReport = await checkUserPermission("KASIR", "laporan", "view");
    const warehouseCanViewDashboard = await checkUserPermission("GUDANG", "dashboard", "view");
    const warehouseCanViewPos = await checkUserPermission("GUDANG", "kasir", "view");

    expect(ownerCanApprove).toBe(true);
    expect(managerCanApprove).toBe(false);
    expect(cashierCanViewPos).toBe(true);
    expect(cashierCanViewReport).toBe(false);
    expect(warehouseCanViewDashboard).toBe(true);
    expect(warehouseCanViewPos).toBe(false);

    // Owner explicitly enables manager approval in RBAC matrix
    await prisma.rolePermission.update({
      where: { role_module: { role: "MANAJER", module: "pembelian" } },
      data: { canApprove: true },
    });
    const managerAfterToggle = await checkUserPermission("MANAJER", "pembelian", "approve");
    expect(managerAfterToggle).toBe(true);

    const map = await getRolePermissionsMap("MANAJER");
    expect(map.pembelian.canApprove).toBe(true);
  });

  it("hashes passwords with bcrypt and issues valid signed JWT session tokens", async () => {
    const hash = await hashPassword("RahasiaToko2026!");
    expect(hash).not.toBe("RahasiaToko2026!");
    expect(await verifyPassword("RahasiaToko2026!", hash)).toBe(true);
    expect(await verifyPassword("SalahPassword", hash)).toBe(false);

    const token = await createSessionToken({
      id: "usr-01",
      username: "pemilik",
      email: "pemilik@trasir.id",
      name: "Pemilik Utama",
      role: "PEMILIK",
    });

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe("PEMILIK");
    expect(verified?.username).toBe("pemilik");
  });

  it("handles Method 1: Satuan Tetap (1:1) stock deduction and restoration", async () => {
    const category = await prisma.category.findFirstOrThrow();
    const product = await prisma.product.create({
      data: {
        sku: "KURSI-01",
        name: "Kursi Lipat Toko",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 120000,
        sellPrice: 175000,
        currentStock: 10,
      },
    });

    const res = await prisma.$transaction((tx) =>
      deductStockForSaleItem(tx, { productId: product.id, quantity: 3 })
    );

    expect(res.unitCost).toBe(120000);
    expect(res.totalCost).toBe(360000);

    const afterSale = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(afterSale.currentStock).toBe(7);

    // Restore upon approved cancellation
    await prisma.$transaction((tx) =>
      restoreStockForSaleItem(tx, { productId: product.id, quantity: 3 })
    );

    const afterRestore = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(afterRestore.currentStock).toBe(10);
  });

  it("handles Method 2: Pecah Satuan (1 dus = 24 botol) purchase conversion and retail sale deduction", async () => {
    const category = await prisma.category.findFirstOrThrow();
    // Buy 2 dus of mineral water where 1 dus = 24 botol -> 48 botol in stock
    const product = await prisma.product.create({
      data: {
        sku: "AIR-600ML",
        name: "Air Mineral 600ml",
        categoryId: category.id,
        stockMethod: "PECAH",
        purchaseUnit: "dus",
        sellUnit: "botol",
        conversionRatio: 24,
        costPrice: 2000, // Rp 48.000 / dus = Rp 2.000 / botol
        sellPrice: 4000,
        currentStock: 48, // 2 dus * 24 botol
      },
    });

    // Sell 5 bottles
    const res = await prisma.$transaction((tx) =>
      deductStockForSaleItem(tx, { productId: product.id, quantity: 5 })
    );

    expect(res.unitCost).toBe(2000);
    expect(res.totalCost).toBe(10000);

    const afterSale = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(afterSale.currentStock).toBe(43);
  });

  it("handles Method 3: Resep & Varian (Regular vs Large) automatic raw material deduction and restoration", async () => {
    const category = await prisma.category.findFirstOrThrow();

    const susu = await prisma.product.create({
      data: {
        sku: "RAW-SUSU",
        name: "Susu Segar",
        categoryId: category.id,
        stockMethod: "PECAH",
        isRawMaterial: true,
        purchaseUnit: "liter",
        sellUnit: "ml",
        conversionRatio: 1000,
        costPrice: 25,
        sellPrice: 0,
        currentStock: 1000,
      },
    });

    const gula = await prisma.product.create({
      data: {
        sku: "RAW-GULA",
        name: "Gula Cair",
        categoryId: category.id,
        stockMethod: "PECAH",
        isRawMaterial: true,
        purchaseUnit: "liter",
        sellUnit: "ml",
        conversionRatio: 1000,
        costPrice: 15,
        sellPrice: 0,
        currentStock: 500,
      },
    });

    const kopi = await prisma.product.create({
      data: {
        sku: "RAW-KOPI",
        name: "Biji Kopi Espresso",
        categoryId: category.id,
        stockMethod: "PECAH",
        isRawMaterial: true,
        purchaseUnit: "kg",
        sellUnit: "g",
        conversionRatio: 1000,
        costPrice: 200,
        sellPrice: 0,
        currentStock: 300,
      },
    });

    const kopiSusu = await prisma.product.create({
      data: {
        sku: "MENU-KOPISUSU",
        name: "Es Kopi Susu",
        categoryId: category.id,
        stockMethod: "RESEP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 1650,
        sellPrice: 18000,
        currentStock: 0,
        variants: {
          create: [
            {
              name: "Regular",
              sellPrice: 18000,
              costPrice: 1650,
              ingredients: {
                create: [
                  { materialId: susu.id, quantity: 20, unit: "ml" },
                  { materialId: gula.id, quantity: 10, unit: "ml" },
                  { materialId: kopi.id, quantity: 5, unit: "g" },
                ],
              },
            },
            {
              name: "Large",
              sellPrice: 24000,
              costPrice: 2575,
              ingredients: {
                create: [
                  { materialId: susu.id, quantity: 30, unit: "ml" },
                  { materialId: gula.id, quantity: 15, unit: "ml" },
                  { materialId: kopi.id, quantity: 8, unit: "g" },
                ],
              },
            },
          ],
        },
      },
      include: { variants: true },
    });

    const largeVariant = kopiSusu.variants.find((v) => v.name === "Large")!;

    // Sell 2 cups of Large Kopi Susu -> should deduct 60ml susu, 30ml gula, 16g kopi
    const deduction = await prisma.$transaction((tx) =>
      deductStockForSaleItem(tx, {
        productId: kopiSusu.id,
        variantId: largeVariant.id,
        quantity: 2,
      })
    );

    expect(deduction.unitCost).toBe(2575);
    expect(deduction.totalCost).toBe(5150);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: susu.id } })).currentStock).toBe(940);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: gula.id } })).currentStock).toBe(470);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: kopi.id } })).currentStock).toBe(284);

    // Restore 2 cups of Large Kopi Susu when cancellation is approved by Pemilik
    await prisma.$transaction((tx) =>
      restoreStockForSaleItem(tx, {
        productId: kopiSusu.id,
        variantId: largeVariant.id,
        quantity: 2,
      })
    );

    expect((await prisma.product.findUniqueOrThrow({ where: { id: susu.id } })).currentStock).toBe(1000);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: gula.id } })).currentStock).toBe(500);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: kopi.id } })).currentStock).toBe(300);
  });

  it("detects duplicate receipt, arithmetic discrepancies, and uses neutral AI evaluation disclaimer", async () => {
    const hash1 = computeReceiptHash("data:image/jpeg;base64,abc123xyz");
    const hash2 = computeReceiptHash("abc123xyz");
    expect(hash1).toBe(hash2);

    const dupResult = await analyzePurchaseReceiptWithGemini({
      supplierName: "Agen Sembako Jaya",
      invoiceNumber: "INV-2026-001",
      purchaseDate: "2026-11-19",
      totalAmount: 240000,
      items: [{ itemName: "Air Mineral Dus", quantity: 10, unit: "dus", unitCost: 24000, subtotal: 240000 }],
      receiptImageData: "data:image/jpeg;base64,short",
      isDuplicateInDatabase: true,
      duplicateRef: "INV-2026-001",
    });

    expect(dupResult.status).toBe("NOTA_GANDA");
    expect(dupResult.duplicateDetected).toBe(true);
    expect(dupResult.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);

    const diffResult = await analyzePurchaseReceiptWithGemini({
      supplierName: "Agen Sembako Jaya",
      invoiceNumber: "INV-2026-002",
      purchaseDate: "2026-11-19",
      totalAmount: 350000, // Mismatches 10 * 24000 = 240000
      items: [{ itemName: "Air Mineral Dus", quantity: 10, unit: "dus", unitCost: 24000, subtotal: 240000 }],
      receiptImageData: "data:image/jpeg;base64,short",
      isDuplicateInDatabase: false,
    });

    expect(diffResult.status).toBe("ADA_SELISIH");
    expect(diffResult.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);
  });

  it("records immutable Audit Trail entries with beforeData and afterData", async () => {
    const log = await recordAuditLog({
      actorName: "Pemilik Utama",
      actorRole: "PEMILIK",
      actionType: "PENGATURAN",
      actionSummary: "Mengubah batas toleransi selisih stok",
      entityType: "SystemSetting",
      entityId: "default",
      beforeData: { toleranceThresholdRp: 50000 },
      afterData: { toleranceThresholdRp: 75000 },
      approvalState: "DISETUJUI",
      linkUrl: "/pengaturan",
    });

    expect(log.id).toBeDefined();
    expect(log.beforeData).toContain("50000");
    expect(log.afterData).toContain("75000");
  });
});
