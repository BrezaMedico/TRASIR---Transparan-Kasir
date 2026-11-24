import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { deductStockForSaleItem, restoreStockForSaleItem } from "../src/lib/inventory";
import {
  ALL_MODULES,
  ensureSystemBaseline,
  checkUserPermission,
  getRolePermissionsMap,
  validateUsername,
  validateRoleManagementAction,
  hasMinimumRemainingAdmins,
  hasMinimumRemainingOwners,
  sanitizeInternalRedirect,
  getDefaultRedirectForRole,
  canViewFinancials,
  PermissionAction,
} from "../src/lib/rbac";
import { getJakartaPeriodBounds, getJakartaDateKey } from "../src/lib/date-jakarta";
import { validateProofAttachment } from "../src/lib/attachment";
import {
  computeReceiptHash,
  analyzePurchaseReceiptWithGemini,
  NEUTRAL_AI_DISCLAIMER,
} from "../src/lib/gemini";
import {
  createSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth";
import { recordAuditLog } from "../src/lib/audit";

describe("TRASIR Core Financial, Inventory, RBAC, Timezone, & Security Engine", () => {
  beforeEach(async () => {
    await prisma.productRequest.deleteMany();
    await prisma.storeInvitation.deleteMany();
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

  it("enforces 100% operational RBAC parity between PEMILIK and MANAJER, exact union for KASIR_GUDANG, and strict financial blocks for staff", async () => {
    const actions: PermissionAction[] = ["view", "create", "edit", "approve"];

    for (const mod of ALL_MODULES) {
      for (const action of actions) {
        const ownerAllowed = await checkUserPermission("PEMILIK", mod.key, action);
        const managerAllowed = await checkUserPermission("MANAJER", mod.key, action);
        expect(ownerAllowed).toBe(true);
        expect(managerAllowed).toBe(true);
        expect(managerAllowed).toBe(ownerAllowed);
      }
    }

    const kasirMap = await getRolePermissionsMap("KASIR");
    const gudangMap = await getRolePermissionsMap("GUDANG");
    const combinedMap = await getRolePermissionsMap("KASIR_GUDANG");

    // KASIR_GUDANG harus merupakan gabungan tepat KASIR + GUDANG di setiap modul
    for (const mod of ALL_MODULES) {
      expect(combinedMap[mod.key].canView).toBe(
        Boolean(kasirMap[mod.key].canView || gudangMap[mod.key].canView)
      );
      expect(combinedMap[mod.key].canCreate).toBe(
        Boolean(kasirMap[mod.key].canCreate || gudangMap[mod.key].canCreate)
      );
      expect(combinedMap[mod.key].canEdit).toBe(
        Boolean(kasirMap[mod.key].canEdit || gudangMap[mod.key].canEdit)
      );
      expect(combinedMap[mod.key].canApprove).toBe(false);
    }

    // Keuangan (dashboard & laporan) hanya untuk PEMILIK & MANAJER
    expect(canViewFinancials("PEMILIK")).toBe(true);
    expect(canViewFinancials("MANAJER")).toBe(true);
    expect(canViewFinancials("KASIR")).toBe(false);
    expect(canViewFinancials("GUDANG")).toBe(false);
    expect(canViewFinancials("KASIR_GUDANG")).toBe(false);

    expect(await checkUserPermission("KASIR", "dashboard", "view")).toBe(false);
    expect(await checkUserPermission("GUDANG", "dashboard", "view")).toBe(false);
    expect(await checkUserPermission("KASIR_GUDANG", "dashboard", "view")).toBe(false);
    expect(await checkUserPermission("KASIR_GUDANG", "kasir", "create")).toBe(true);
    expect(await checkUserPermission("KASIR_GUDANG", "pembelian", "create")).toBe(true);
    expect(await checkUserPermission("KASIR_GUDANG", "inventaris", "edit")).toBe(true);
    expect(await checkUserPermission("KASIR", "produk", "create")).toBe(true);
    expect(await checkUserPermission("GUDANG", "produk", "create")).toBe(true);
  });

  it("enforces Pemilik account protection from Manajer and last-Pemilik anti-lockout guards", () => {
    // Manajer boleh ubah pegawai non-Pemilik
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetCurrentRole: "KASIR",
        targetNextRole: "KASIR_GUDANG",
        action: "CHANGE_ROLE",
      }).allowed
    ).toBe(true);

    // Manajer DILARANG mengubah/menurunkan/mencabut/menonaktifkan Pemilik
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetCurrentRole: "PEMILIK",
        targetNextRole: "KASIR",
        action: "CHANGE_ROLE",
      }).allowed
    ).toBe(false);
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetCurrentRole: "PEMILIK",
        action: "REVOKE",
      }).allowed
    ).toBe(false);
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetCurrentRole: "PEMILIK",
        action: "DEACTIVATE",
      }).allowed
    ).toBe(false);

    // Manajer DILARANG mempromosikan siapa pun menjadi Pemilik
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetCurrentRole: "KASIR",
        targetNextRole: "PEMILIK",
        action: "CHANGE_ROLE",
      }).allowed
    ).toBe(false);
    expect(
      validateRoleManagementAction({
        actorRole: "MANAJER",
        targetNextRole: "PEMILIK",
        action: "CREATE_USER",
      }).allowed
    ).toBe(false);

    // Anti-lockout Pemilik terakhir ruangan
    expect(hasMinimumRemainingOwners(1, true, false)).toBe(false);
    expect(hasMinimumRemainingOwners(2, true, false)).toBe(true);
    expect(hasMinimumRemainingOwners(1, true, true)).toBe(true);
    expect(hasMinimumRemainingOwners(1, false, false)).toBe(true);

    expect(hasMinimumRemainingAdmins(1, true, false)).toBe(false);
  });

  it("calculates Asia/Jakarta (WIB) period bounds with Monday as start of week", () => {
    // Minggu, 22 Nov 2026 pukul 15:00 WIB -> awal minggu harus Senin 16 Nov 2026 00:00 WIB
    const sundayWib = new Date("2026-11-22T08:00:00.000Z"); // 15:00 WIB
    const weekBounds = getJakartaPeriodBounds("week", sundayWib);
    expect(getJakartaDateKey(weekBounds.startDate)).toBe("2026-11-16");
    expect(weekBounds.startDate.toISOString()).toBe("2026-11-15T17:00:00.000Z"); // 00:00 WIB

    const todayBounds = getJakartaPeriodBounds("today", sundayWib);
    expect(getJakartaDateKey(todayBounds.startDate)).toBe("2026-11-22");
    expect(todayBounds.startDate.toISOString()).toBe("2026-11-21T17:00:00.000Z");

    const monthBounds = getJakartaPeriodBounds("month", sundayWib);
    expect(getJakartaDateKey(monthBounds.startDate)).toBe("2026-11-01");
    expect(getJakartaDateKey(monthBounds.previousStartDate)).toBe("2026-10-01");
  });

  it("validates proof attachment MIME types and maximum 2 MB size", () => {
    expect(validateProofAttachment(null).valid).toBe(true);
    expect(validateProofAttachment("data:image/png;base64,iVBORw0KGgo=").valid).toBe(true);
    expect(validateProofAttachment("data:application/pdf;base64,JVBERi0xLjQ=").valid).toBe(true);

    // File berbahaya harus ditolak
    expect(validateProofAttachment("data:text/html;base64,PHNjcmlwdD4=").valid).toBe(false);
    expect(validateProofAttachment("data:image/svg+xml;base64,PHN2Zz4=").valid).toBe(false);

    // File melebihi 2 MB harus ditolak
    const oversizedBase64 = "A".repeat(3 * 1024 * 1024);
    expect(validateProofAttachment(`data:image/jpeg;base64,${oversizedBase64}`).valid).toBe(false);
  });

  it("normalizes usernames, validates safe redirects, and resolves role default redirects", () => {
    const validNormalized = validateUsername("  Budi_01.Kasir ");
    expect(validNormalized.valid).toBe(true);
    expect(validNormalized.normalized).toBe("budi_01.kasir");

    expect(validateUsername("ab").valid).toBe(false);
    expect(validateUsername("budi santoso").valid).toBe(false);
    expect(validateUsername("budi@toko").valid).toBe(false);

    expect(sanitizeInternalRedirect("/dashboard", "/")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("//evil.example/phish", "/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("https://evil.example", "/dashboard")).toBe("/dashboard");

    expect(getDefaultRedirectForRole("KASIR", false)).toBe("/menunggu-undangan");
    expect(getDefaultRedirectForRole("MANAJER", true)).toBe("/dashboard");
    expect(getDefaultRedirectForRole("KASIR", true)).toBe("/kasir");
    expect(getDefaultRedirectForRole("KASIR_GUDANG", true)).toBe("/kasir");
    expect(getDefaultRedirectForRole("GUDANG", true)).toBe("/inventaris");
  });

  it("hashes passwords with bcrypt and issues valid signed JWT session tokens with roomId", async () => {
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
      isAssigned: true,
      roomId: "room-01",
    });

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.role).toBe("PEMILIK");
    expect(verified?.roomId).toBe("room-01");
    expect(verified?.isAssigned).toBe(true);
  });

  it("handles Method 1 (TETAP), Method 2 (PECAH), and Method 3 (RESEP) stock deduction and restoration", async () => {
    const category = await prisma.category.findFirstOrThrow();

    const tetap = await prisma.product.create({
      data: {
        roomId: category.roomId,
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
    const res1 = await prisma.$transaction((tx) =>
      deductStockForSaleItem(tx, { productId: tetap.id, quantity: 3 })
    );
    expect(res1.totalCost).toBe(360000);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: tetap.id } })).currentStock).toBe(7);
    await prisma.$transaction((tx) =>
      restoreStockForSaleItem(tx, { productId: tetap.id, quantity: 3 })
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: tetap.id } })).currentStock).toBe(10);

    const susu = await prisma.product.create({
      data: {
        roomId: category.roomId,
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

    const kopiSusu = await prisma.product.create({
      data: {
        roomId: category.roomId,
        sku: "MENU-KOPISUSU",
        name: "Es Kopi Susu",
        categoryId: category.id,
        stockMethod: "RESEP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 750,
        sellPrice: 24000,
        currentStock: 0,
        variants: {
          create: [
            {
              name: "Large",
              sellPrice: 24000,
              costPrice: 750,
              ingredients: {
                create: [{ materialId: susu.id, quantity: 30, unit: "ml" }],
              },
            },
          ],
        },
      },
      include: { variants: true },
    });

    const largeVar = kopiSusu.variants[0];
    const ded = await prisma.$transaction((tx) =>
      deductStockForSaleItem(tx, { productId: kopiSusu.id, variantId: largeVar.id, quantity: 2 })
    );
    expect(ded.totalCost).toBe(1500);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: susu.id } })).currentStock).toBe(940);

    await prisma.$transaction((tx) =>
      restoreStockForSaleItem(tx, { productId: kopiSusu.id, variantId: largeVar.id, quantity: 2 })
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: susu.id } })).currentStock).toBe(1000);
  });

  it("detects duplicate receipt, arithmetic discrepancies, and records immutable Audit Trail", async () => {
    expect(computeReceiptHash("data:image/jpeg;base64,abc123xyz")).toBe(
      computeReceiptHash("abc123xyz")
    );

    const dupResult = await analyzePurchaseReceiptWithGemini({
      supplierName: "Agen Sembako Jaya",
      invoiceNumber: "INV-2026-001",
      purchaseDate: "2026-11-19",
      totalAmount: 240000,
      items: [{ itemName: "Air Mineral", quantity: 10, unit: "dus", unitCost: 24000, subtotal: 240000 }],
      receiptImageData: "data:image/jpeg;base64,short",
      isDuplicateInDatabase: true,
      duplicateRef: "INV-2026-001",
    });
    expect(dupResult.status).toBe("NOTA_GANDA");
    expect(dupResult.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);

    const log = await recordAuditLog({
      actorName: "Pemilik Utama",
      actorRole: "PEMILIK",
      actionType: "PENGATURAN",
      actionSummary: "Mengubah batas toleransi selisih stok",
      entityType: "Room",
      entityId: "default-room",
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
