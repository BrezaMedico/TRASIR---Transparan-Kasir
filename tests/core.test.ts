import { describe, it, expect, beforeEach, vi } from "vitest";
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
  analyzeProductRequestBatchWithGemini,
  NEUTRAL_AI_DISCLAIMER,
} from "../src/lib/gemini";
import {
  createEmailChangeToken,
  createPasswordResetToken,
  createSessionToken,
  hashVerificationCode,
  resolveSecretString,
  verifyEmailChangeToken,
  verifyPasswordResetToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth";
import {
  checkRateLimit,
  isOtpTokenBlocked,
  markOtpTokenConsumed,
  recordOtpFailedAttempt,
} from "../src/lib/rate-limit";
import {
  isPasswordPolicyCompliant,
  strongPasswordSchema,
} from "../src/lib/password-policy";
import { AppError, handleApiError } from "../src/lib/api-error";
import nextConfig from "../next.config";
import { recordAuditLog } from "../src/lib/audit";
import {
  formatActionTypeLabel,
  formatAuditChangePair,
  formatAuditSnapshot,
  formatNotificationText,
} from "../src/lib/audit-format";
import { getGrossProfitReport } from "../src/lib/queries/profit";
import {
  groupProductRequestsIntoBatches,
  parseProductRequestEnvelope,
  serializeProductRequestEnvelope,
} from "../src/lib/product-request-batch";
import {
  computeDenominationTotal,
  computeOperationalExpenseTotal,
  evaluateHandoverSync,
  evaluateShiftAudit,
  parseShiftEnvelope,
  serializeShiftEnvelope,
} from "../src/lib/shift-session";
import {
  buildInitialCounters,
  parseStoredCounters,
  slugifyCounterId,
} from "../src/lib/counters";
import {
  buildAreaPath,
  buildMonotonePath,
  computeNiceScale,
  formatCompactRupiahAxis,
  pickXAxisTickIndices,
} from "../src/components/charts/sales-line-chart-utils";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  decodeCursor,
  encodeCursor,
  parseJakartaDateRange,
  parseLimitParam,
} from "../src/lib/pagination";

describe("TRASIR Core Financial, Inventory, RBAC, Timezone, & Security Engine", () => {
  beforeEach(async () => {
    await prisma.productRequest.deleteMany();
    await prisma.storeInvitation.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.saleAmendment.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.counter.deleteMany();
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
    expect(await checkUserPermission("KASIR_GUDANG", "produk", "create")).toBe(true);
    expect(await checkUserPermission("KASIR", "produk", "create")).toBe(false);
    expect(await checkUserPermission("KASIR", "produk", "edit")).toBe(false);
    expect(await checkUserPermission("KASIR", "kasir", "create")).toBe(true);
    expect(await checkUserPermission("GUDANG", "produk", "create")).toBe(true);
    expect(await checkUserPermission("GUDANG", "kasir", "view")).toBe(false);
    expect(await checkUserPermission("GUDANG", "kasir", "create")).toBe(false);
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

  it("computes readable Rupiah chart scales, monotone SVG paths, and non-overlapping ticks", () => {
    expect(formatCompactRupiahAxis(0)).toBe("Rp 0");
    expect(formatCompactRupiahAxis(25_000)).toBe("Rp 25 rb");
    expect(formatCompactRupiahAxis(1_500_000)).toBe("Rp 1,5 jt");
    expect(formatCompactRupiahAxis(2_000_000_000)).toBe("Rp 2 M");
    expect(formatCompactRupiahAxis(-500)).toBe("-Rp 500");

    const zeroScale = computeNiceScale(0, 0, 4);
    expect(zeroScale.min).toBe(0);
    expect(zeroScale.max).toBe(100_000);
    expect(zeroScale.ticks).toEqual([0, 25_000, 50_000, 75_000, 100_000]);

    const scale = computeNiceScale(0, 1_350_000, 4);
    expect(scale.min).toBe(0);
    expect(scale.max).toBeGreaterThanOrEqual(1_350_000);
    expect(scale.ticks[0]).toBe(0);

    const pts = [
      { x: 0, y: 100 },
      { x: 50, y: 100 },
      { x: 100, y: 20 },
      { x: 150, y: 20 },
    ];
    const linePath = buildMonotonePath(pts);
    expect(linePath.startsWith("M 0.00 100.00")).toBe(true);
    expect(linePath).not.toContain("NaN");

    const areaPath = buildAreaPath(linePath, pts, 100);
    expect(areaPath).toContain("L 150.00 100.00 L 0.00 100.00 Z");

    const singlePath = buildMonotonePath([{ x: 40, y: 60 }]);
    expect(singlePath).toBe("M 40.00 60.00");
    expect(buildAreaPath(singlePath, [{ x: 40, y: 60 }], 100)).toBe("");

    const ticks30 = pickXAxisTickIndices(30, 7);
    expect(ticks30.length).toBeLessThanOrEqual(7);
    expect(ticks30[0]).toBe(0);
    expect(ticks30[ticks30.length - 1]).toBe(29);
    for (let i = 1; i < ticks30.length; i += 1) {
      expect(ticks30[i]).toBeGreaterThan(ticks30[i - 1]);
    }
  });

  it("emits continuous hourly, weekly, and monthly chartSeries buckets with isFuture markers", async () => {
    const room = await prisma.room.create({
      data: {
        name: "Toko Uji Grafik",
      },
    });
    const roomId = room.id;
    const category = await prisma.category.create({
      data: {
        roomId,
        name: "Minuman Uji",
        areaType: "CAFE",
      },
    });
    const owner = await prisma.user.create({
      data: {
        roomId,
        name: "Owner Uji",
        username: `owner_chart_${Date.now()}`,
        email: `owner_chart_${Date.now()}@trasir.local`,
        passwordHash: "hash",
        role: "PEMILIK",
        isAssigned: true,
      },
    });

    const prod = await prisma.product.create({
      data: {
        roomId,
        sku: "CHART-KOPI-01",
        name: "Kopi Chart",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "cup",
        sellUnit: "cup",
        conversionRatio: 1,
        costPrice: 5000,
        sellPrice: 15000,
        currentStock: 50,
      },
    });

    // Reference time: Rabu, 18 Nov 2026 14:00 WIB (07:00 UTC)
    const refNow = new Date("2026-11-18T07:00:00.000Z");

    // Sale pada Rabu 18 Nov 2026 10:15 WIB (03:15 UTC)
    await prisma.sale.create({
      data: {
        roomId,
        receiptNumber: "INV-CHART-01",
        cashierId: owner.id,
        discountAmount: 0,
        totalAmount: 30000,
        totalCost: 10000,
        paymentMethod: "TUNAI",
        status: "NORMAL",
        createdAt: new Date("2026-11-18T03:15:00.000Z"),
        items: {
          create: [
            {
              productId: prod.id,
              productName: prod.name,
              quantity: 2,
              unitPrice: 15000,
              unitCost: 5000,
              subtotal: 30000,
              totalCost: 10000,
            },
          ],
        },
      },
    });

    const todayReport = await getGrossProfitReport(roomId, "today", refNow);
    expect(todayReport.chartSeries).toHaveLength(24);
    expect(todayReport.chartSeries[0].key).toBe("00:00");
    expect(todayReport.chartSeries[23].key).toBe("23:00");
    expect(todayReport.chartSeries[10].netRevenue).toBe(30000);
    expect(todayReport.chartSeries[10].grossProfit).toBe(20000);
    expect(todayReport.chartSeries[10].isFuture).toBe(false);
    expect(todayReport.chartSeries[14].isFuture).toBe(false);
    expect(todayReport.chartSeries[15].isFuture).toBe(true);

    const weekReport = await getGrossProfitReport(roomId, "week", refNow);
    expect(weekReport.chartSeries).toHaveLength(7);
    expect(weekReport.chartSeries[0].key).toBe("2026-11-16"); // Senin
    expect(weekReport.chartSeries[2].key).toBe("2026-11-18"); // Rabu
    expect(weekReport.chartSeries[2].netRevenue).toBe(30000);
    expect(weekReport.chartSeries[2].isFuture).toBe(false);
    expect(weekReport.chartSeries[3].isFuture).toBe(true);
    expect(weekReport.chartSeries[6].key).toBe("2026-11-22"); // Minggu

    const monthReport = await getGrossProfitReport(roomId, "month", refNow);
    expect(monthReport.chartSeries).toHaveLength(30); // November 2026 = 30 hari
    expect(monthReport.chartSeries[0].key).toBe("2026-11-01");
    expect(monthReport.chartSeries[17].key).toBe("2026-11-18");
    expect(monthReport.chartSeries[17].netRevenue).toBe(30000);
    expect(monthReport.chartSeries[17].isFuture).toBe(false);
    expect(monthReport.chartSeries[18].isFuture).toBe(true);
    expect(monthReport.chartSeries[29].key).toBe("2026-11-30");
  });

  it("parses legacy & batch ProductRequest envelopes and groups items cleanly into batches", () => {
    const legacy = parseProductRequestEnvelope(
      JSON.stringify([{ name: "Reguler", sellPrice: 15000, ingredients: [] }])
    );
    expect(legacy.variants).toHaveLength(1);

    const serialized = serializeProductRequestEnvelope({
      batchId: "BATCH-001",
      batchIndex: 0,
      batchSize: 2,
      batchTitle: "Belanja Pagi",
      initialStock: 1000,
      clientTempId: "tmp-susu",
      receiptImageData: "data:image/png;base64,AAAA",
      receiptSource: "FISIK",
    });
    expect(serialized).toBeTruthy();
    const roundTrip = parseProductRequestEnvelope(serialized);
    expect(roundTrip.batchId).toBe("BATCH-001");
    expect(roundTrip.initialStock).toBe(1000);
    expect(roundTrip.receiptSource).toBe("FISIK");

    const batches = groupProductRequestsIntoBatches([
      {
        id: "r-2",
        name: "Es Susu",
        stockMethod: "RESEP",
        isRawMaterial: false,
        costPrice: 2000,
        sellPrice: 12000,
        status: "MENUNGGU_PERSETUJUAN",
        variantsJson: serializeProductRequestEnvelope({ batchId: "BATCH-001", batchIndex: 1 }),
        createdAt: "2026-11-24T10:00:00.000Z",
        requestedBy: { id: "u1", name: "Budi", role: "GUDANG" },
      },
      {
        id: "r-1",
        name: "Susu Segar",
        stockMethod: "PECAH",
        isRawMaterial: true,
        costPrice: 20,
        sellPrice: 0,
        status: "MENUNGGU_PERSETUJUAN",
        variantsJson: serialized,
        createdAt: "2026-11-24T10:00:00.000Z",
        requestedBy: { id: "u1", name: "Budi", role: "GUDANG" },
      },
      {
        id: "r-legacy",
        name: "Roti Satuan",
        stockMethod: "TETAP",
        isRawMaterial: false,
        costPrice: 5000,
        sellPrice: 8000,
        status: "DISETUJUI",
        variantsJson: null,
        createdAt: "2026-11-23T09:00:00.000Z",
        requestedBy: { id: "u1", name: "Budi", role: "GUDANG" },
      },
    ]);

    expect(batches).toHaveLength(2);
    expect(batches[0].batchId).toBe("BATCH-001");
    expect(batches[0].items.map((i) => i.id)).toEqual(["r-1", "r-2"]);
    expect(batches[0].totalEstimatedCost).toBe(20000);
    expect(batches[0].receiptSource).toBe("FISIK");
    expect(batches[1].batchId).toBe("single-r-legacy");
    expect(batches[1].status).toBe("DISETUJUI");
  });

  it("computes packaging counts and unit prices cleanly for AI batch receipt comparison", async () => {
    const batchRes = await analyzeProductRequestBatchWithGemini({
      supplierName: "Toko Sembako Jaya",
      receiptSource: "FISIK",
      receiptImageData: "data:image/jpeg;base64,short",
      items: [
        {
          name: "Gula Pasir",
          kind: "BAHAN_BAKU",
          sku: "BHN-GULA-01",
          initialStock: 5000,
          sellUnit: "g",
          purchaseUnit: "kemasan",
          conversionRatio: 1000,
          unitCostPrice: 18,
          estimatedTotalCost: 90000,
          sellPrice: 0,
        },
        {
          name: "Teh Manis",
          kind: "MENU_RESEP",
          sku: "MNU-TEH-01",
          initialStock: 0,
          sellUnit: "pcs",
          purchaseUnit: "pcs",
          conversionRatio: 1,
          unitCostPrice: 2000,
          estimatedTotalCost: 0,
          sellPrice: 8000,
        },
      ],
    });

    expect(batchRes.status).toBe("SESUAI");
    expect(batchRes.submittedEstimatedTotal).toBe(90000);
    expect(batchRes.items[0].packCount).toBe(5);
    expect(batchRes.items[0].packSize).toBe(1000);
    expect(batchRes.items[0].packUnitPrice).toBe(18000);
    expect(batchRes.items[1].matchStatus).toBe("RESEP_NON_NOTA");
    expect(batchRes.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);
  });

  it("formats technical audit JSON snapshots and notifications into plain Indonesian for non-technical users", () => {
    const entries = formatAuditSnapshot(
      '{"batchId":"BATCH-3113F23F","hasReceipt":true,"receiptSource":"DIGITAL"}'
    );
    expect(entries).toEqual([
      { key: "hasReceipt", label: "Lampiran Nota", value: "Ada" },
      { key: "receiptSource", label: "Sumber Nota", value: "Nota digital" },
    ]);
    expect(JSON.stringify(entries)).not.toContain("BATCH-3113F23F");

    // Non-admin must not see aiValidationStatus in audit details
    const staffPurchaseEntries = formatAuditSnapshot(
      '{"hasReceipt":true,"captureMethod":"LIVE_CAMERA","aiValidationStatus":"BELUM_DICEK"}',
      { isAdmin: false }
    );
    expect(staffPurchaseEntries).toEqual([
      { key: "hasReceipt", label: "Lampiran Nota", value: "Ada" },
      { key: "captureMethod", label: "Cara Input Nota", value: "Foto kamera" },
    ]);

    const { beforeItems, afterItems } = formatAuditChangePair(
      '{"id":"p1","roomId":"r1","name":"Gula Pasir","costPrice":15000,"sellPrice":18000,"sku":"GUL-1","stockMethod":"TETAP"}',
      '{"id":"p1","roomId":"r1","name":"Gula Pasir","costPrice":16000,"sellPrice":18000,"sku":"GUL-1","stockMethod":"TETAP"}'
    );
    expect(beforeItems).toEqual([{ key: "costPrice", label: "Harga Modal", value: "Rp\u00a015.000" }]);
    expect(afterItems.map((i) => i.key)).toEqual(["name", "costPrice"]);

    expect(formatActionTypeLabel("PRODUCT_REQUEST")).toBe("Pengajuan Barang");
    expect(formatActionTypeLabel("PASSWORD_RESET")).toBe("Reset Kata Sandi");
    expect(formatNotificationText("Bergabung sebagai KASIR_GUDANG (PINDAH_GUDANG)")).toBe(
      "Bergabung sebagai Kasir + Gudang (Pindah Gudang)"
    );
  });

  it("creates and verifies single-use password reset tokens tied to password fingerprint", async () => {
    const hash1 = await hashPassword("SandiLama123");
    const token = await createPasswordResetToken({
      userId: "user-reset-1",
      email: "pemilik@toko.id",
      tokenVersion: 1,
      passwordHash: hash1,
    });

    const verified = await verifyPasswordResetToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("user-reset-1");
    expect(verified?.email).toBe("pemilik@toko.id");
    expect(verified?.tokenVersion).toBe(1);

    const invalid = await verifyPasswordResetToken("invalid.token.value");
    expect(invalid).toBeNull();
  });

  it("computes Rupiah denominations, handover sync, and blind shift audit accuracy", () => {
    const openingTotal = computeDenominationTotal({
      "100000": 2,
      "50000": 1,
      "2000": 3,
      "500": 2,
    });
    expect(openingTotal).toBe(257000);

    const opsTotal = computeOperationalExpenseTotal([
      { description: "Es batu", amount: 12000 },
      { description: "Plastik", amount: 8000 },
    ]);
    expect(opsTotal).toBe(20000);

    expect(evaluateHandoverSync(257000, null)).toEqual({
      handoverSyncStatus: "SHIFT_PERTAMA",
      handoverDifference: 0,
    });
    expect(evaluateHandoverSync(300000, 300000)).toEqual({
      handoverSyncStatus: "SINKRON",
      handoverDifference: 0,
    });
    expect(evaluateHandoverSync(250000, 300000)).toEqual({
      handoverSyncStatus: "TIDAK_SINKRON",
      handoverDifference: -50000,
    });

    // Expected = 257000 + 100000 - 20000 = 337000
    const exactAudit = evaluateShiftAudit({
      openingCashTotal: 257000,
      systemCashTotal: 100000,
      actualCashTotal: 337000,
      operationalExpenseTotal: 20000,
    });
    expect(exactAudit.expectedCashAtClose).toBe(337000);
    expect(exactAudit.cashDifference).toBe(0);
    expect(exactAudit.status).toBe("SESUAI");

    const tolAudit = evaluateShiftAudit({
      openingCashTotal: 257000,
      systemCashTotal: 100000,
      actualCashTotal: 334000,
      operationalExpenseTotal: 20000,
    });
    expect(tolAudit.cashDifference).toBe(-3000);
    expect(tolAudit.status).toBe("DALAM_TOLERANSI");

    const anomalyAudit = evaluateShiftAudit({
      openingCashTotal: 257000,
      systemCashTotal: 100000,
      actualCashTotal: 310000,
      operationalExpenseTotal: 20000,
    });
    expect(anomalyAudit.cashDifference).toBe(-27000);
    expect(anomalyAudit.status).toBe("PERLU_DIPERIKSA");

    const raw = serializeShiftEnvelope({
      version: 2,
      openedAt: "2026-11-26T08:00:00.000Z",
      closedAt: "2026-11-26T16:00:00.000Z",
      openingCashTotal: 257000,
      openingDenominations: { "100000": 2, "50000": 1, "2000": 3, "500": 2 },
      openingNote: "Laci aman",
      previousShiftId: null,
      previousShiftClosingCash: null,
      handoverSyncStatus: "SHIFT_PERTAMA",
      handoverDifference: 0,
      closingDenominations: { "100000": 3, "10000": 1 },
      operationalExpenses: [{ description: "Es batu", amount: 12000 }],
      operationalExpenseTotal: 12000,
      closingNote: "Selesai",
      expectedCashAtClose: 345000,
      closingCashDifference: -35000,
    });
    const parsed = parseShiftEnvelope(raw);
    expect(parsed?.openingCashTotal).toBe(257000);
    expect(parsed?.closingCashDifference).toBe(-35000);
    expect(parseShiftEnvelope("Catatan biasa")).toBeNull();
  });

  it("builds, parses, and slugifies room counters cleanly with single-default fallback", () => {
    const existing = new Set<string>(["loket-1"]);
    expect(slugifyCounterId("Loket 1", existing)).toBe("loket-1-2");
    expect(slugifyCounterId("Kasir Drive Thru!", existing)).toBe("kasir-drive-thru");

    const built = buildInitialCounters({
      counterNames: ["Loket 1", "  Loket 2 ", "loket 1", "Kasir Atas"],
    });
    expect(built.map((c) => c.name)).toEqual(["Loket 1", "Loket 2", "Kasir Atas"]);
    expect(built[0].id).toBe("loket-1");

    const parsedFallback = parseStoredCounters(null);
    expect(parsedFallback).toHaveLength(1);
    expect(parsedFallback[0].id).toBe("loket-1");
    expect(parsedFallback[0].name).toBe("Loket 1");

    const parsedRoundTrip = parseStoredCounters(JSON.stringify(built));
    expect(parsedRoundTrip.map((c) => c.id)).toEqual(built.map((c) => c.id));
    expect(parsedRoundTrip.map((c) => c.name)).toEqual(["Loket 1", "Loket 2", "Kasir Atas"]);
  });

  it("creates and verifies email-change verification tokens with hashed OTP codes", async () => {
    const code = "482910";
    const token = await createEmailChangeToken({
      userId: "usr-email-1",
      currentEmail: "lama@toko.id",
      newEmail: "baru@toko.id",
      tokenVersion: 2,
      code,
    });
    const decoded = await verifyEmailChangeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("usr-email-1");
    expect(decoded?.currentEmail).toBe("lama@toko.id");
    expect(decoded?.newEmail).toBe("baru@toko.id");
    expect(decoded?.codeHash).toBe(hashVerificationCode(code));
    expect(decoded?.codeHash).not.toBe(hashVerificationCode("000000"));
  });

  it("enforces attachment magic bytes, hardens internal redirects, isolates JWT purposes, requires production AUTH_SECRET, and enforces rate/OTP limits", async () => {
    // 1. Magic-byte validation: HTML/SVG disguised as PNG or PDF must be rejected
    expect(validateProofAttachment("data:image/png;base64,PHNjcmlwdD4=").valid).toBe(false);
    expect(validateProofAttachment("data:application/pdf;base64,PHN2Zz4=").valid).toBe(false);
    // Valid magic headers (PNG, JPEG, WEBP, PDF)
    expect(validateProofAttachment("data:image/png;base64,iVBORw0KGgo=").valid).toBe(true);
    expect(validateProofAttachment("data:image/jpeg;base64,/9j/4AAQSkZJRg==").valid).toBe(true);
    expect(validateProofAttachment("data:image/webp;base64,UklGRgAAAABXRUJQ").valid).toBe(true);
    expect(validateProofAttachment("data:application/pdf;base64,JVBERi0xLjQ=").valid).toBe(true);

    // 2. Redirect hardening against backslash and control-char smuggling
    expect(sanitizeInternalRedirect("/\\evil.example", "/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/ok\t/evil.example", "/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/ok\r\nSet-Cookie:x", "/dashboard")).toBe("/dashboard");

    // 3. Fail-closed production AUTH_SECRET check
    expect(() => resolveSecretString({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      resolveSecretString({ NODE_ENV: "production", AUTH_SECRET: "short-secret" })
    ).toThrow();
    const strongSecret = "a".repeat(32);
    expect(resolveSecretString({ NODE_ENV: "production", AUTH_SECRET: strongSecret })).toBe(
      strongSecret
    );

    // 4. Purpose isolation: password-reset and email-change tokens must never validate as sessions
    const resetTok = await createPasswordResetToken({
      userId: "u-sec-1",
      email: "sec@toko.id",
      tokenVersion: 1,
      passwordHash: "$2b$12$examplehashvalue1234567890",
    });
    const emailTok = await createEmailChangeToken({
      userId: "u-sec-1",
      currentEmail: "sec@toko.id",
      newEmail: "next@toko.id",
      tokenVersion: 1,
      code: "123456",
    });
    expect(await verifySessionToken(resetTok)).toBeNull();
    expect(await verifySessionToken(emailTok)).toBeNull();

    // 5. Shared DB-backed rate limiter + OTP attempt lockout + expiry + single-use replay guard
    const rateKey = `unit-rate-${Date.now()}`;
    expect((await checkRateLimit(rateKey, 2, 60_000, { forceEnforce: true })).limited).toBe(false);
    expect((await checkRateLimit(rateKey, 2, 60_000, { forceEnforce: true })).limited).toBe(false);
    expect((await checkRateLimit(rateKey, 2, 60_000, { forceEnforce: true })).limited).toBe(true);

    const lockTok = `lock-tok-${Date.now()}`;
    for (let i = 0; i < 4; i++) {
      expect((await recordOtpFailedAttempt(lockTok, 5)).locked).toBe(false);
    }
    expect((await recordOtpFailedAttempt(lockTok, 5)).locked).toBe(true);
    expect(await isOtpTokenBlocked(lockTok)).toEqual({ blocked: true, reason: "LOCKED" });

    const singleTok = `single-tok-${Date.now()}`;
    expect(await markOtpTokenConsumed(singleTok)).toBe(true);
    expect(await markOtpTokenConsumed(singleTok)).toBe(false);
    expect(await isOtpTokenBlocked(singleTok)).toEqual({ blocked: true, reason: "USED" });
  });

  it("enforces Tahap 4 hardening: 10-char non-common password policy, CSP/security headers, and redacted handleApiError with errorId", async () => {
    // 1. Password policy: >= 10 karakter & menolak sandi umum/repetitif
    expect(strongPasswordSchema.safeParse("Pendek9").success).toBe(false);
    expect(strongPasswordSchema.safeParse("password123").success).toBe(false);
    expect(strongPasswordSchema.safeParse("1234567890").success).toBe(false);
    expect(strongPasswordSchema.safeParse("qwerty1234").success).toBe(false);
    expect(strongPasswordSchema.safeParse("rahasia123").success).toBe(false);
    expect(strongPasswordSchema.safeParse("aaaaaaaaaa").success).toBe(false);
    expect(isPasswordPolicyCompliant("KopiTubruk#2026")).toBe(true);

    // 2. Security headers di next.config.ts
    const headerRules = await nextConfig.headers!();
    const globalHeaders = headerRules[0]?.headers ?? [];
    const headerMap = new Map(globalHeaders.map((h) => [h.key, h.value]));
    expect(headerMap.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerMap.get("Strict-Transport-Security")).toContain("max-age=");

    // 3. Centralized error handler menyembunyikan pesan internal & mengembalikan errorId
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const unexpectedRes = handleApiError(
        new Error("FATAL: password authentication failed for user postgres"),
        "TEST /api/internal",
        "Gagal memproses permintaan."
      );
      expect(unexpectedRes.status).toBe(500);
      const unexpectedJson = await unexpectedRes.json();
      expect(unexpectedJson.errorId).toMatch(/^[a-f0-9-]{8,}$/i);
      expect(unexpectedJson.error).toContain("Gagal memproses permintaan.");
      expect(unexpectedJson.error).not.toContain("postgres");
      expect(unexpectedJson.error).not.toContain("authentication failed");
      expect(errSpy).toHaveBeenCalledTimes(1);

      const appErrRes = handleApiError(
        new AppError("Stok barang tidak cukup", 400, "INSUFFICIENT_STOCK"),
        "TEST /api/sales"
      );
      expect(appErrRes.status).toBe(400);
      expect(await appErrRes.json()).toEqual({
        error: "Stok barang tidak cukup",
        code: "INSUFFICIENT_STOCK",
      });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("enforces cursor pagination bounds, lossless cursor encode/decode, and Jakarta date range validation (Tahap 6)", () => {
    expect(parseLimitParam(null)).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimitParam("0")).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimitParam("-5")).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimitParam("25")).toBe(25);
    expect(parseLimitParam("500")).toBe(MAX_PAGE_LIMIT);

    const now = new Date("2026-11-15T10:20:30.456Z");
    const token = encodeCursor({ createdAt: now, id: "cuid_12345" });
    const decoded = decodeCursor(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe("cuid_12345");
    expect(decoded?.createdAt.toISOString()).toBe(now.toISOString());
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();

    const validRange = parseJakartaDateRange(new URLSearchParams("from=2026-11-01&to=2026-11-05"));
    expect(validRange.error).toBeUndefined();
    expect(validRange.range?.gte?.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(validRange.range?.lte?.toISOString()).toBe("2026-11-05T16:59:59.999Z");

    const invalidRange = parseJakartaDateRange(new URLSearchParams("from=2026-11-10&to=2026-11-01"));
    expect(invalidRange.error).toBeTruthy();
  });
});
