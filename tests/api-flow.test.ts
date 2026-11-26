import { describe, it, expect, beforeEach, vi } from "vitest";

let activeSessionToken: string | null = null;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "trasir_session" && activeSessionToken
        ? { name, value: activeSessionToken }
        : undefined,
  })),
}));

import { prisma } from "../src/lib/prisma";
import { createPasswordResetToken } from "../src/lib/auth";
import { POST as registerUser } from "../src/app/api/auth/register/route";
import { POST as loginUser } from "../src/app/api/auth/login/route";
import { POST as forgotPasswordApi } from "../src/app/api/auth/forgot-password/route";
import {
  GET as verifyResetApi,
  POST as resetPasswordApi,
} from "../src/app/api/auth/reset-password/route";
import { GET as getProfit } from "../src/app/api/profit/route";
import { GET as getDashboard } from "../src/app/api/dashboard/route";
import { GET as getReports } from "../src/app/api/reports/route";
import {
  POST as createProduct,
  PUT as updateProduct,
  GET as listProducts,
  DELETE as deleteProduct,
} from "../src/app/api/products/route";
import {
  GET as listProductRequests,
  POST as submitProductRequestBatch,
  DELETE as deleteProductRequest,
} from "../src/app/api/product-requests/route";
import { POST as reviewProductRequest } from "../src/app/api/product-requests/[id]/review/route";
import { POST as reviewProductBatch } from "../src/app/api/product-requests/batch-review/route";
import { POST as analyzeProductBatch } from "../src/app/api/product-requests/analyze/route";
import { PATCH as updateProductRequestReceipt } from "../src/app/api/product-requests/receipt/route";
import { GET as listSales, POST as createSale } from "../src/app/api/sales/route";
import { POST as handleSaleAmendment } from "../src/app/api/sales/amendments/route";
import { GET as getShifts, POST as postShift } from "../src/app/api/shifts/route";
import {
  GET as getCounters,
  POST as createCounter,
  DELETE as deleteCounter,
} from "../src/app/api/counters/route";
import { GET as getPurchases, POST as createPurchase } from "../src/app/api/purchases/route";
import { POST as analyzePurchase } from "../src/app/api/purchases/analyze/route";
import { PATCH as updatePurchaseReceipt } from "../src/app/api/purchases/receipt/route";
import { POST as reviewPurchase } from "../src/app/api/purchases/review/route";
import { NEUTRAL_AI_DISCLAIMER } from "../src/lib/gemini";
import { GET as getInventory, POST as postInventory } from "../src/app/api/inventory/route";
import { POST as postAudit } from "../src/app/api/audit/route";
import { POST as createInvitation } from "../src/app/api/invitations/route";
import { DELETE as revokeInvitation } from "../src/app/api/invitations/[id]/route";
import { GET as verifyInvitation } from "../src/app/api/invitations/verify/route";
import { PATCH as updateUserRole } from "../src/app/api/users/[id]/role/route";
import { PATCH as revokeUserAccess } from "../src/app/api/users/[id]/revoke/route";
import { GET as getUsers } from "../src/app/api/users/route";
import { POST as postSettings } from "../src/app/api/settings/route";
import { POST as changeEmailApi } from "../src/app/api/account/change-email/route";

function extractSessionToken(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/trasir_session=([^;]+)/);
  return match ? match[1] : null;
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function resetDb() {
  activeSessionToken = null;
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
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();
  await prisma.room.deleteMany();
}

describe("TRASIR 25-Scenario Full-Stack Verification Suite", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("Scenarios 1-9 & 25: Room creation, invite-code join, self-role escalation block, Kasir/Gudang/Kasir+Gudang/Manajer roles, Pemilik protection, & multi-room isolation", async () => {
    // Skenario 1: Pengguna mendaftar & membuat ruangan baru -> otomatis PEMILIK
    const regOwnerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Raka Pemilik",
        username: "raka_owner",
        email: "raka@trasir.id",
        password: "PasswordAman123",
        roomName: "Kedai Kopi Nusantara",
        roomAddress: "Jakarta Selatan",
      })
    );
    expect(regOwnerRes.status).toBe(201);
    const ownerJson = await regOwnerRes.json();
    expect(ownerJson.user.role).toBe("PEMILIK");
    expect(ownerJson.user.roomId).toBeTruthy();
    expect(ownerJson.room.name).toBe("Kedai Kopi Nusantara");
    expect(ownerJson.redirectTo).toBe("/dashboard");
    const ownerToken = extractSessionToken(regOwnerRes)!;

    // Skenario 3: Pengguna mencoba menentukan role sendiri saat registrasi -> ditolak (403)
    const selfRoleRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Hacker Role",
        username: "hacker_role",
        password: "PasswordAman123",
        roomName: "Fake Room",
        role: "PEMILIK",
      })
    );
    expect(selfRoleRes.status).toBe(403);

    const selfRegisterRoleRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Hacker Join",
        username: "hacker_join",
        password: "PasswordAman123",
        inviteCode: "TRS-FAKE-CODE",
        registerRole: "PEMILIK",
      })
    );
    expect(selfRegisterRoleRes.status).toBe(403);

    // Buat 4 kode undangan oleh Pemilik: KASIR, GUDANG, KASIR_GUDANG, MANAJER (+ uji cabut undangan)
    activeSessionToken = ownerToken;

    const invKasirRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "KASIR",
      })
    );
    expect(invKasirRes.status).toBe(201);
    const invKasirCode = (await invKasirRes.json()).inviteCode as string;

    const invGudangRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "GUDANG",
      })
    );
    expect(invGudangRes.status).toBe(201);
    const invGudangCode = (await invGudangRes.json()).inviteCode as string;

    const invComboRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "KASIR_GUDANG",
      })
    );
    expect(invComboRes.status).toBe(201);
    const invComboCode = (await invComboRes.json()).inviteCode as string;

    const invMgrRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "MANAJER",
      })
    );
    expect(invMgrRes.status).toBe(201);
    const invMgrCode = (await invMgrRes.json()).inviteCode as string;

    // Uji undangan yang dicabut tidak boleh digunakan
    const invRevokedRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "KASIR",
      })
    );
    const invRevokedData = await invRevokedRes.json();
    const revokeInvRes = await revokeInvitation(
      new Request(`http://localhost/api/invitations/${invRevokedData.invitation.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: invRevokedData.invitation.id }) }
    );
    expect(revokeInvRes.status).toBe(200);

    const joinRevokedRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Budi Dicabut",
        username: "budi_dicabut",
        password: "PasswordAman123",
        inviteCode: invRevokedData.inviteCode,
      })
    );
    expect(joinRevokedRes.status).toBe(400);

    // Uji verifikasi publik kode undangan
    const verifyRes = await verifyInvitation(
      new Request(`http://localhost/api/invitations/verify?code=${invComboCode}`)
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson = await verifyRes.json();
    expect(verifyJson.valid).toBe(true);
    expect(verifyJson.roomName).toBe("Kedai Kopi Nusantara");
    expect(verifyJson.assignedRole).toBe("KASIR_GUDANG");

    // Skenario 2 & 4: Pegawai bergabung sebagai KASIR
    const joinKasirRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Andi Kasir",
        username: "andi_kasir",
        password: "PasswordAman123",
        inviteCode: invKasirCode,
      })
    );
    expect(joinKasirRes.status).toBe(201);
    const kasirData = await joinKasirRes.json();
    expect(kasirData.user.role).toBe("KASIR");
    expect(kasirData.user.roomId).toBe(ownerJson.user.roomId);
    const kasirToken = extractSessionToken(joinKasirRes)!;

    // Cek pembatasan hak akses KASIR: boleh sales, ditolak pembelian & profit
    activeSessionToken = kasirToken;
    expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(200);
    expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(403);
    expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);

    // Skenario 5: Pegawai bergabung sebagai GUDANG
    const joinGudangRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Dewi Gudang",
        username: "dewi_gudang",
        password: "PasswordAman123",
        inviteCode: invGudangCode,
      })
    );
    expect(joinGudangRes.status).toBe(201);
    const gudangData = await joinGudangRes.json();
    expect(gudangData.user.role).toBe("GUDANG");
    const gudangToken = extractSessionToken(joinGudangRes)!;

    activeSessionToken = gudangToken;
    expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(200);
    expect((await getInventory()).status).toBe(200);
    expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(403);
    expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);

    // Skenario 6: Pegawai bergabung sebagai KASIR + GUDANG (gabungan hak akses)
    const joinComboRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Citra Kombo",
        username: "citra_kombo",
        password: "PasswordAman123",
        inviteCode: invComboCode,
      })
    );
    expect(joinComboRes.status).toBe(201);
    const comboData = await joinComboRes.json();
    expect(comboData.user.role).toBe("KASIR_GUDANG");
    const comboToken = extractSessionToken(joinComboRes)!;

    activeSessionToken = comboToken;
    expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(200);
    expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(200);
    expect((await getInventory()).status).toBe(200);
    expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);

    // Bergabung sebagai MANAJER
    const joinMgrRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Siti Manajer",
        username: "siti_manajer",
        password: "PasswordAman123",
        inviteCode: invMgrCode,
      })
    );
    expect(joinMgrRes.status).toBe(201);
    const mgrToken = extractSessionToken(joinMgrRes)!;

    // Skenario 7: Manajer mengubah role pegawai non-Pemilik -> berhasil
    activeSessionToken = mgrToken;
    const changeKasirRes = await updateUserRole(
      jsonReq(`http://localhost/api/users/${kasirData.user.id}/role`, "PATCH", {
        role: "KASIR_GUDANG",
      }),
      { params: Promise.resolve({ id: kasirData.user.id }) }
    );
    expect(changeKasirRes.status).toBe(200);
    expect((await changeKasirRes.json()).user.role).toBe("KASIR_GUDANG");

    // Skenario 8: Manajer mencoba mengubah role / mencabut / menonaktifkan akun Pemilik -> DITOLAK (403)
    const mgrDemoteOwner = await updateUserRole(
      jsonReq(`http://localhost/api/users/${ownerJson.user.id}/role`, "PATCH", {
        role: "KASIR",
      }),
      { params: Promise.resolve({ id: ownerJson.user.id }) }
    );
    expect(mgrDemoteOwner.status).toBe(403);

    const mgrRevokeOwner = await revokeUserAccess(
      jsonReq(`http://localhost/api/users/${ownerJson.user.id}/revoke`, "PATCH", {}),
      { params: Promise.resolve({ id: ownerJson.user.id }) }
    );
    expect(mgrRevokeOwner.status).toBe(403);

    const mgrDeactivateOwner = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_USER",
        userId: ownerJson.user.id,
        isActive: false,
      })
    );
    expect(mgrDeactivateOwner.status).toBe(403);

    // Skenario 9: Manajer mencoba memberikan role PEMILIK kepada pegawai -> DITOLAK (403)
    const mgrPromoteToOwner = await updateUserRole(
      jsonReq(`http://localhost/api/users/${gudangData.user.id}/role`, "PATCH", {
        role: "PEMILIK",
      }),
      { params: Promise.resolve({ id: gudangData.user.id }) }
    );
    expect(mgrPromoteToOwner.status).toBe(403);

    const mgrInviteOwner = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "PEMILIK",
      })
    );
    expect(mgrInviteOwner.status).toBe(403);

    // Anti-lockout: Pemilik tunggal tidak boleh diturunkan atau dicabut aksesnya sendiri
    activeSessionToken = ownerToken;
    const demoteLastOwner = await updateUserRole(
      jsonReq(`http://localhost/api/users/${ownerJson.user.id}/role`, "PATCH", {
        role: "MANAJER",
      }),
      { params: Promise.resolve({ id: ownerJson.user.id }) }
    );
    expect(demoteLastOwner.status).toBe(400);

    // Skenario Bonus 25: Isolasi Multi-Ruangan (Ruangan B tidak bisa melihat/mengubah data Ruangan A)
    const regRoomB = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Pemilik Ruangan B",
        username: "owner_room_b",
        password: "PasswordAman123",
        roomName: "Toko Sebelah B",
      })
    );
    expect(regRoomB.status).toBe(201);
    const ownerBToken = extractSessionToken(regRoomB)!;

    activeSessionToken = ownerBToken;
    const crossRoomRoleChange = await updateUserRole(
      jsonReq(`http://localhost/api/users/${kasirData.user.id}/role`, "PATCH", {
        role: "GUDANG",
      }),
      { params: Promise.resolve({ id: kasirData.user.id }) }
    );
    expect(crossRoomRoleChange.status).toBe(404);
  });

  it("Scenarios 10-15: Gross profit calculation (historical HPP, incomplete cost warning, role guard) & Product addition approval workflow", async () => {
    // Setup Room + Owner + Manager + Kasir
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Pemilik Toko",
        username: "owner_gp",
        password: "PasswordAman123",
        roomName: "Warung Maju",
      })
    );
    const ownerData = await ownerRes.json();
    const ownerToken = extractSessionToken(ownerRes)!;
    const roomId = ownerData.user.roomId as string;

    activeSessionToken = ownerToken;
    const invMgr = await (
      await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "MANAJER",
        })
      )
    ).json();
    const invKasir = await (
      await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "KASIR",
        })
      )
    ).json();
    const invGudang = await (
      await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "GUDANG",
        })
      )
    ).json();

    const mgrRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Manajer Toko",
        username: "mgr_gp",
        password: "PasswordAman123",
        inviteCode: invMgr.inviteCode,
      })
    );
    const mgrToken = extractSessionToken(mgrRes)!;

    const kasirRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir Toko",
        username: "kasir_gp",
        password: "PasswordAman123",
        inviteCode: invKasir.inviteCode,
      })
    );
    const kasirToken = extractSessionToken(kasirRes)!;

    const gudangRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Gudang Toko",
        username: "gudang_gp",
        password: "PasswordAman123",
        inviteCode: invGudang.inviteCode,
      })
    );
    const gudangToken = extractSessionToken(gudangRes)!;

    const category = await prisma.category.findFirstOrThrow({ where: { roomId } });

    // Skenario 13: Pemilik/Manajer menambahkan produk -> langsung masuk katalog aktif tanpa persetujuan
    activeSessionToken = mgrToken;
    const directProdRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "KOPI-001",
        name: "Kopi Hitam Sachet",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 10000,
        sellPrice: 18000,
      })
    );
    expect(directProdRes.status).toBe(201);
    const directProdJson = await directProdRes.json();
    expect(directProdJson.mode).toBe("DIRECT");
    const productA = directProdJson.product;

    // Produk kedua tanpa HPP (costPrice = 0) untuk menguji peringatan data harga modal belum lengkap
    const zeroCostProdRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "SNACK-000",
        name: "Keripik Tanpa Modal",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 0,
        sellPrice: 12000,
      })
    );
    expect(zeroCostProdRes.status).toBe(201);
    const productZeroCost = (await zeroCostProdRes.json()).product;

    // Isi stok produk untuk pengujian penjualan
    await prisma.product.update({ where: { id: productA.id }, data: { currentStock: 50 } });
    await prisma.product.update({ where: { id: productZeroCost.id }, data: { currentStock: 20 } });

    // Pemisahan tugas ketat: Kasir dilarang tambah produk (403); Gudang dilarang transaksi kasir (403)
    activeSessionToken = kasirToken;
    const kasirAddBlocked = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "KSR-BLK-01",
        name: "Produk Ditolak Kasir",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 5000,
        sellPrice: 10000,
      })
    );
    expect(kasirAddBlocked.status).toBe(403);

    activeSessionToken = gudangToken;
    const gudangSaleBlocked = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        items: [{ productId: productA.id, quantity: 1 }],
      })
    );
    expect(gudangSaleBlocked.status).toBe(403);

    // Skenario 12: Pegawai Gudang menambahkan produk -> masuk antrean MENUNGGU_PERSETUJUAN, tidak langsung aktif
    const tamperedProdRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "HACK-01",
        name: "Produk Manipulasi",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 5000,
        sellPrice: 10000,
        status: "DISETUJUI",
      })
    );
    expect(tamperedProdRes.status).toBe(403);

    const empReq1Res = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "TEH-001",
        name: "Teh Tarik Botol",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "botol",
        sellUnit: "botol",
        conversionRatio: 1,
        costPrice: 6000,
        sellPrice: 10000,
      })
    );
    expect(empReq1Res.status).toBe(202);
    const empReq1Json = await empReq1Res.json();
    expect(empReq1Json.mode).toBe("REQUEST");
    expect(empReq1Json.productRequest.status).toBe("MENUNGGU_PERSETUJUAN");

    const empReq2Res = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "ROTI-001",
        name: "Roti Cokelat Ditolak",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 7000,
        sellPrice: 12000,
      })
    );
    expect(empReq2Res.status).toBe(202);
    const empReq2Id = (await empReq2Res.json()).productRequest.id as string;

    // Pastikan produk yang diajukan belum masuk ke katalog aktif
    const catalogBefore = await (await listProducts()).json();
    expect(catalogBefore.products.some((p: { sku: string }) => p.sku === "TEH-001")).toBe(false);

    // Pegawai tidak boleh menyetujui permintaannya sendiri melalui API review
    const empSelfApprove = await reviewProductRequest(
      jsonReq(`http://localhost/api/product-requests/${empReq1Json.productRequest.id}/review`, "POST", {
        decision: "DISETUJUI",
      }),
      { params: Promise.resolve({ id: empReq1Json.productRequest.id }) }
    );
    expect(empSelfApprove.status).toBe(403);

    // Skenario 14: Manajer menyetujui permintaan produk -> masuk katalog aktif
    activeSessionToken = mgrToken;
    const listReqRes = await listProductRequests(new Request("http://localhost/api/product-requests"));
    expect(listReqRes.status).toBe(200);
    expect((await listReqRes.json()).pendingCount).toBe(2);

    const approveReq1 = await reviewProductRequest(
      jsonReq(`http://localhost/api/product-requests/${empReq1Json.productRequest.id}/review`, "POST", {
        decision: "DISETUJUI",
      }),
      { params: Promise.resolve({ id: empReq1Json.productRequest.id }) }
    );
    expect(approveReq1.status).toBe(200);
    const approveJson = await approveReq1.json();
    expect(approveJson.productRequest.status).toBe("DISETUJUI");
    expect(approveJson.product.sku).toBe("TEH-001");

    // Skenario 15: Manajer menolak permintaan produk -> tidak masuk katalog aktif
    const rejectReq2 = await reviewProductRequest(
      jsonReq(`http://localhost/api/product-requests/${empReq2Id}/review`, "POST", {
        decision: "DITOLAK",
        rejectionReason: "Harga modal belum sesuai daftar pemasok.",
      }),
      { params: Promise.resolve({ id: empReq2Id }) }
    );
    expect(rejectReq2.status).toBe(200);
    expect((await rejectReq2.json()).productRequest.status).toBe("DITOLAK");

    const catalogAfter = await (await listProducts()).json();
    expect(catalogAfter.products.some((p: { sku: string }) => p.sku === "TEH-001")).toBe(true);
    expect(catalogAfter.products.some((p: { sku: string }) => p.sku === "ROTI-001")).toBe(false);

    // Catat penjualan dengan HPP historis 10.000 (jual 3 pcs @ 18.000 = 54.000, diskon 4.000 -> bersih 50.000, HPP 30.000 -> laba kotor 20.000)
    activeSessionToken = kasirToken;
    const saleRes = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        discountAmount: 4000,
        cashReceived: 50000,
        items: [{ productId: productA.id, quantity: 3 }],
      })
    );
    expect(saleRes.status).toBe(200);

    // Ubah costPrice master produk menjadi 15.000 SETELAH penjualan -> transaksi lama harus tetap pakai HPP historis 10.000!
    await prisma.product.update({ where: { id: productA.id }, data: { costPrice: 15000 } });

    // Skenario 10: Manajer membuka dashboard & API keuntungan kotor -> akurat berbasis HPP historis
    activeSessionToken = mgrToken;
    const profitTodayRes = await getProfit(new Request("http://localhost/api/profit?period=today"));
    expect(profitTodayRes.status).toBe(200);
    const profitToday = await profitTodayRes.json();
    expect(profitToday.timezone).toBe("Asia/Jakarta");
    expect(profitToday.metrics.netSalesRevenue).toBe(50000);
    expect(profitToday.metrics.totalDiscounts).toBe(4000);
    expect(profitToday.metrics.totalCogs).toBe(30000); // HPP historis 3 x 10.000, BUKAN 3 x 15.000!
    expect(profitToday.metrics.grossProfit).toBe(20000);
    expect(profitToday.metrics.grossMarginPct).toBe(40);
    expect(profitToday.dataQuality.isCalculationComplete).toBe(true);

    const dashMgrRes = await getDashboard(new Request("http://localhost/api/dashboard?range=week"));
    expect(dashMgrRes.status).toBe(200);
    const dashMgr = await dashMgrRes.json();
    expect(dashMgr.profit.metrics.grossProfit).toBe(20000);
    expect(dashMgr.anomalies).not.toHaveProperty("discrepantShifts");

    // Uji deteksi data harga modal tidak lengkap (jual produk tanpa HPP)
    activeSessionToken = kasirToken;
    await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "QRIS",
        items: [{ productId: productZeroCost.id, quantity: 1 }],
      })
    );
    activeSessionToken = mgrToken;
    const profitIncomplete = await (
      await getProfit(new Request("http://localhost/api/profit?period=month"))
    ).json();
    expect(profitIncomplete.dataQuality.hasIncompleteCostData).toBe(true);
    expect(profitIncomplete.dataQuality.isCalculationComplete).toBe(false);
    expect(profitIncomplete.dataQuality.warningMessage).toContain("Keripik Tanpa Modal");

    // Skenario 11: Kasir mencoba mengakses API keuntungan, dashboard, & laporan -> DITOLAK backend (403)
    activeSessionToken = kasirToken;
    expect((await getProfit(new Request("http://localhost/api/profit?period=month"))).status).toBe(403);
    expect((await getDashboard(new Request("http://localhost/api/dashboard?range=month"))).status).toBe(403);
    expect((await getReports(new Request("http://localhost/api/reports?period=monthly"))).status).toBe(403);
  });

  it("Scenarios 16-24: Transaction cancellation approval workflow, self-approval block, double-cancel prevention, shift closing preserved, & shift discrepancy feature removed", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Pemilik Resto",
        username: "owner_tx",
        password: "PasswordAman123",
        roomName: "Resto Transparan",
      })
    );
    const ownerData = await ownerRes.json();
    const ownerToken = extractSessionToken(ownerRes)!;
    const roomId = ownerData.user.roomId as string;

    activeSessionToken = ownerToken;
    const invMgr = await (
      await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "MANAJER",
        })
      )
    ).json();
    const invKasir = await (
      await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "KASIR",
        })
      )
    ).json();

    const mgrToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Manajer Resto",
          username: "mgr_tx",
          password: "PasswordAman123",
          inviteCode: invMgr.inviteCode,
        })
      )
    )!;
    const kasirToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Kasir Resto",
          username: "kasir_tx",
          password: "PasswordAman123",
          inviteCode: invKasir.inviteCode,
        })
      )
    )!;

    const category = await prisma.category.findFirstOrThrow({ where: { roomId } });
    const prod = await prisma.product.create({
      data: {
        roomId,
        sku: "NASI-01",
        name: "Nasi Goreng Spesial",
        categoryId: category.id,
        stockMethod: "TETAP",
        purchaseUnit: "porsi",
        sellUnit: "porsi",
        conversionRatio: 1,
        costPrice: 12000,
        sellPrice: 25000,
        currentStock: 20,
      },
    });

    // Buat 2 transaksi penjualan oleh Kasir (masing-masing 2 porsi -> stok tersisa 16)
    activeSessionToken = kasirToken;
    const sale1 = (
      await (
        await createSale(
          jsonReq("http://localhost/api/sales", "POST", {
            paymentMethod: "TUNAI",
            cashReceived: 50000,
            items: [{ productId: prod.id, quantity: 2 }],
          })
        )
      ).json()
    ).sale;

    const sale2 = (
      await (
        await createSale(
          jsonReq("http://localhost/api/sales", "POST", {
            paymentMethod: "QRIS",
            items: [{ productId: prod.id, quantity: 2 }],
          })
        )
      ).json()
    ).sale;

    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod.id } })).currentStock).toBe(16);

    // Skenario 16: Pengajuan pembatalan tanpa alasan -> DITOLAK (400)
    const emptyReasonRes = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: sale1.id,
        amendmentType: "PEMBATALAN",
        reason: "   ",
      })
    );
    expect(emptyReasonRes.status).toBe(400);

    // Uji validasi tipe file lampiran berbahaya -> DITOLAK (400)
    const badMimeRes = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: sale1.id,
        amendmentType: "PEMBATALAN",
        reason: "Pelanggan membatalkan pesanan",
        proofImageData: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      })
    );
    expect(badMimeRes.status).toBe(400);

    // Skenario 17: Pengajuan pembatalan dengan alasan & bukti valid -> MENUNGGU_PERSETUJUAN (stok & laba BELUM berubah!)
    const reqCancel1Res = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: sale1.id,
        amendmentType: "PEMBATALAN",
        reason: "Salah input jumlah pesanan pelanggan",
        proofImageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      })
    );
    expect(reqCancel1Res.status).toBe(201);
    const am1 = (await reqCancel1Res.json()).amendment;
    expect(am1.status).toBe("MENUNGGU_PERSETUJUAN");

    // Stok belum kembali sebelum disetujui
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod.id } })).currentStock).toBe(16);

    // Keuntungan kotor belum berkurang sebelum disetujui (2 transaksi x 2 porsi x margin 13.000 = 52.000)
    activeSessionToken = mgrToken;
    const profitBeforeApprove = await (
      await getProfit(new Request("http://localhost/api/profit?period=today"))
    ).json();
    expect(profitBeforeApprove.metrics.grossProfit).toBe(52000);

    // Skenario 18: Manajer menyetujui pembatalan -> status DIBATALKAN, stok kembali 18, laba kotor turun jadi 26.000
    const approveCancel1 = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REVIEW",
        amendmentId: am1.id,
        decision: "DISETUJUI",
        reviewNotes: "Diverifikasi dengan struk fisik.",
      })
    );
    expect(approveCancel1.status).toBe(200);
    expect((await approveCancel1.json()).amendment.status).toBe("DISETUJUI");
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale1.id } })).status).toBe("DIBATALKAN");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod.id } })).currentStock).toBe(18);

    const profitAfterApprove = await (
      await getProfit(new Request("http://localhost/api/profit?period=today"))
    ).json();
    expect(profitAfterApprove.metrics.grossProfit).toBe(26000);
    expect(profitAfterApprove.metrics.cancelledSalesCount).toBe(1);

    // Skenario 20: Pengguna mencoba membatalkan transaksi yang sudah DIBATALKAN -> dicegah (409)
    activeSessionToken = kasirToken;
    const doubleCancelRes = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: sale1.id,
        amendmentType: "PEMBATALAN",
        reason: "Mencoba pembatalan kedua kali",
      })
    );
    expect(doubleCancelRes.status).toBe(409);

    // Skenario Bonus 24: Pengaju (meski Manajer!) TIDAK BOLEH menyetujui permintaannya sendiri (403)
    activeSessionToken = mgrToken;
    const mgrSelfReqRes = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: sale2.id,
        amendmentType: "PEMBATALAN",
        reason: "Manajer mengajukan pembatalan untuk diuji",
      })
    );
    expect(mgrSelfReqRes.status).toBe(201);
    const mgrAm2 = (await mgrSelfReqRes.json()).amendment;

    const selfApproveBlocked = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REVIEW",
        amendmentId: mgrAm2.id,
        decision: "DISETUJUI",
      })
    );
    expect(selfApproveBlocked.status).toBe(403);

    // Skenario 19: Pemilik (pihak berbeda) menolak pembatalan -> transaksi tetap aktif & alasan penolakan tercatat
    activeSessionToken = ownerToken;
    const rejectAm2 = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REVIEW",
        amendmentId: mgrAm2.id,
        decision: "DITOLAK",
        reviewNotes: "Barang sudah dikonsumsi pelanggan.",
      })
    );
    expect(rejectAm2.status).toBe(200);
    const rejectJson = await rejectAm2.json();
    expect(rejectJson.amendment.status).toBe("DITOLAK");
    expect(rejectJson.amendment.reviewNotes).toBe("Barang sudah dikonsumsi pelanggan.");
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale2.id } })).status).toBe("NORMAL");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod.id } })).currentStock).toBe(18);

    // Skenario 21: Riwayat transaksi lama tetap tersedia (baik NORMAL maupun DIBATALKAN tidak terhapus)
    const historyRes = await listSales(new Request("http://localhost/api/sales"));
    expect(historyRes.status).toBe(200);
    const historyJson = await historyRes.json();
    expect(historyJson.sales.length).toBe(2);
    expect(historyJson.sales.some((s: { id: string; status: string }) => s.id === sale1.id && s.status === "DIBATALKAN")).toBe(true);
    expect(historyJson.sales.some((s: { id: string; status: string }) => s.id === sale2.id && s.status === "NORMAL")).toBe(true);

    // Skenario 22 & 23: Fitur Tutup Shift tetap berjalan, dan fitur melihat selisih hasil tutup shift sudah tidak ada
    activeSessionToken = kasirToken;
    const shiftGetBefore = await getShifts(new Request("http://localhost/api/shifts"));
    expect(shiftGetBefore.status).toBe(200);

    const shiftPostRes = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        actualCashTotal: 15000,
        actualDigitalTotal: 50000,
        notes: "Shift sore selesai.",
      })
    );
    expect(shiftPostRes.status).toBe(201);
    const shiftPostJson = await shiftPostRes.json();
    expect(shiftPostJson.closing.actualCashTotal).toBe(15000);
    expect(shiftPostJson.closing.actualDigitalTotal).toBe(50000);

    // Pastikan API shifts tidak mengembalikan field selisih hasil tutup shift
    expect(shiftPostJson.closing).not.toHaveProperty("cashDifference");
    expect(shiftPostJson.closing).not.toHaveProperty("digitalDifference");
    expect(shiftPostJson.closing).not.toHaveProperty("totalDifference");

    const shiftGetAfter = await (await getShifts(new Request("http://localhost/api/shifts"))).json();
    expect(shiftGetAfter.closings.length).toBe(1);
    expect(shiftGetAfter.closings[0]).not.toHaveProperty("cashDifference");
    expect(shiftGetAfter.closings[0]).not.toHaveProperty("digitalDifference");
    expect(shiftGetAfter.closings[0]).not.toHaveProperty("totalDifference");

    // Pastikan tidak ada notifikasi selisih kas shift yang dibuat
    const shiftNotifs = await prisma.notification.findMany({ where: { category: "SHIFT" } });
    expect(shiftNotifs.length).toBe(0);
  });

  it("Scenario 26: Delete product, recipe product, and raw material with dependency & history safety", async () => {
    const regOwnerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Kafe",
        username: "owner_kafe_del",
        password: "PasswordAman123",
        roomName: "Kafe Uji Hapus",
      })
    );
    expect(regOwnerRes.status).toBe(201);
    const ownerJson = await regOwnerRes.json();
    const ownerToken = extractSessionToken(regOwnerRes)!;

    activeSessionToken = ownerToken;
    const invRes = await createInvitation(
      jsonReq("http://localhost/api/invitations", "POST", {
        inviteType: "CODE",
        assignedRole: "KASIR",
      })
    );
    expect(invRes.status).toBe(201);
    const invCode = (await invRes.json()).inviteCode as string;

    const category = await prisma.category.create({
      data: { roomId: ownerJson.user.roomId, name: "Minuman", areaType: "CAFE" },
    });

    // 1. Tambah bahan baku Susu Ultra Milk
    const matRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "BHN-SUSU-01",
        name: "Susu Ultra Milk",
        categoryId: category.id,
        stockMethod: "PECAH",
        isRawMaterial: true,
        purchaseUnit: "dus",
        sellUnit: "ml",
        conversionRatio: 1000,
        costPrice: 20,
        sellPrice: 0,
        initialStock: 2000,
      })
    );
    expect(matRes.status).toBe(201);
    const susu = (await matRes.json()).product;

    // 2. Tambah menu resep Es Teh Susu memakai Susu Ultra Milk
    const recipeRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "MNU-SUSU-01",
        name: "Es Susu Manis",
        categoryId: category.id,
        stockMethod: "RESEP",
        isRawMaterial: false,
        purchaseUnit: "gelas",
        sellUnit: "gelas",
        conversionRatio: 1,
        costPrice: 0,
        sellPrice: 15000,
        variants: [
          {
            name: "Reguler",
            sellPrice: 15000,
            costPrice: 0,
            ingredients: [{ materialId: susu.id, quantity: 150, unit: "ml" }],
          },
        ],
      })
    );
    expect(recipeRes.status).toBe(201);
    const recipeProd = (await recipeRes.json()).product;

    // 3. Tambah produk reguler dengan riwayat transaksi
    const regProdRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "PRD-AIR-01",
        barcode: "8990001112223",
        name: "Air Mineral",
        categoryId: category.id,
        stockMethod: "TETAP",
        isRawMaterial: false,
        purchaseUnit: "botol",
        sellUnit: "botol",
        conversionRatio: 1,
        costPrice: 2000,
        sellPrice: 5000,
        initialStock: 10,
      })
    );
    expect(regProdRes.status).toBe(201);
    const regProd = (await regProdRes.json()).product;

    const saleRes = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        items: [{ productId: regProd.id, quantity: 1 }],
      })
    );
    expect(saleRes.status).toBe(200);

    // 4. Kasir tidak boleh menghapus produk (403)
    const joinKasir = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir Uji",
        username: "kasir_uji_del",
        password: "PasswordAman123",
        inviteCode: invCode,
      })
    );
    expect(joinKasir.status).toBe(201);
    activeSessionToken = extractSessionToken(joinKasir)!;
    const kasirDel = await deleteProduct(
      new Request(`http://localhost/api/products?id=${regProd.id}`, { method: "DELETE" })
    );
    expect(kasirDel.status).toBe(403);

    // 5. Bahan baku yang masih dipakai di resep aktif ditolak (409)
    activeSessionToken = ownerToken;
    const delMatBlocked = await deleteProduct(
      new Request(`http://localhost/api/products?id=${susu.id}`, { method: "DELETE" })
    );
    expect(delMatBlocked.status).toBe(409);

    // 6. Hapus produk resep (belum ada transaksi -> HARD_DELETED), lalu bahan baku bisa dihapus
    const delRecipe = await deleteProduct(
      new Request(`http://localhost/api/products?id=${recipeProd.id}`, { method: "DELETE" })
    );
    expect(delRecipe.status).toBe(200);
    expect((await delRecipe.json()).mode).toBe("HARD_DELETED");

    const delMatOk = await deleteProduct(
      new Request(`http://localhost/api/products?id=${susu.id}`, { method: "DELETE" })
    );
    expect(delMatOk.status).toBe(200);
    expect((await delMatOk.json()).mode).toBe("HARD_DELETED");

    // 7. Hapus produk yang sudah punya transaksi -> ARCHIVED (barcode dilepas, hilang dari katalog aktif)
    const delRegProd = await deleteProduct(
      new Request(`http://localhost/api/products?id=${regProd.id}`, { method: "DELETE" })
    );
    expect(delRegProd.status).toBe(200);
    const delRegJson = await delRegProd.json();
    expect(delRegJson.mode).toBe("ARCHIVED");

    const archivedRow = await prisma.product.findUniqueOrThrow({ where: { id: regProd.id } });
    expect(archivedRow.isActive).toBe(false);
    expect(archivedRow.barcode).toBeNull();

    const activeList = await (await listProducts()).json();
    expect(activeList.products).toHaveLength(0);
  });

  it("Scenario 27: Strict Kasir vs Gudang separation, Kasir+Gudang union, Batch Proposal Cart, Optional AI Receipt Scan, & Batch Review", async () => {
    const regOwner = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Pemilik Batch",
        username: "owner_batch",
        password: "PasswordAman123",
        roomName: "Kopi Paket Batch",
      })
    );
    expect(regOwner.status).toBe(201);
    const ownerJson = await regOwner.json();
    const ownerToken = extractSessionToken(regOwner)!;
    const roomId = ownerJson.user.roomId as string;

    activeSessionToken = ownerToken;
    const invKasir = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;
    const invGudang = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "GUDANG",
          })
        )
      ).json()
    ).inviteCode as string;
    const invCombo = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR_GUDANG",
          })
        )
      ).json()
    ).inviteCode as string;

    const kasirToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Kasir Murni",
          username: "kasir_murni",
          password: "PasswordAman123",
          inviteCode: invKasir,
        })
      )
    )!;
    const gudangToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Staf Gudang",
          username: "staf_gudang",
          password: "PasswordAman123",
          inviteCode: invGudang,
        })
      )
    )!;
    const comboToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Kasir Gudang Gabungan",
          username: "combo_user",
          password: "PasswordAman123",
          inviteCode: invCombo,
        })
      )
    )!;

    const category = await prisma.category.findFirstOrThrow({ where: { roomId } });

    // Kasir dilarang mengirim daftar pengajuan barang (403)
    activeSessionToken = kasirToken;
    const kasirBatchBlocked = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        items: [
          {
            sku: "BLK-01",
            name: "Tidak Boleh",
            categoryId: category.id,
            stockMethod: "TETAP",
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 1000,
            sellPrice: 2000,
          },
        ],
      })
    );
    expect(kasirBatchBlocked.status).toBe(403);

    // Gudang mengirim 1 paket berisi Bahan Baku + Produk Jual + Resep (memakai clientTempId bahan baku di daftar pengajuan) + Nota Fisik
    activeSessionToken = gudangToken;
    const sampleReceipt = "data:image/png;base64,iVBORw0KGgo=";

    const batchSubmitRes = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        batchTitle: "Belanja Pagi Susu & Menu",
        supplierName: "Agen Susu Nusantara",
        batchNote: "Pembelian awal minggu",
        receiptImageData: sampleReceipt,
        receiptSource: "FISIK",
        items: [
          {
            clientTempId: "cart-mat-susu",
            sku: "BHN-SUSU-B1",
            name: "Susu Ultra Milk Batch",
            categoryId: category.id,
            stockMethod: "PECAH",
            isRawMaterial: true,
            purchaseUnit: "kemasan",
            sellUnit: "ml",
            conversionRatio: 1000,
            costPrice: 20,
            sellPrice: 0,
            currentStock: 1000,
          },
          {
            sku: "PRD-AIR-B1",
            name: "Air Mineral Batch",
            categoryId: category.id,
            stockMethod: "TETAP",
            isRawMaterial: false,
            purchaseUnit: "botol",
            sellUnit: "botol",
            conversionRatio: 1,
            costPrice: 2000,
            sellPrice: 5000,
            currentStock: 24,
          },
          {
            sku: "MNU-SUSU-B1",
            name: "Es Susu Segar Batch",
            categoryId: category.id,
            stockMethod: "RESEP",
            isRawMaterial: false,
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 2000,
            sellPrice: 15000,
            variants: [
              {
                name: "Standar",
                sellPrice: 15000,
                costPrice: 2000,
                ingredients: [
                  {
                    materialId: "cart-mat-susu",
                    materialName: "Susu Ultra Milk Batch",
                    quantity: 100,
                    unit: "ml",
                  },
                ],
              },
            ],
          },
        ],
      })
    );
    expect(batchSubmitRes.status).toBe(202);
    const batchJson = await batchSubmitRes.json();
    expect(batchJson.mode).toBe("REQUEST_BATCH");
    expect(batchJson.requests).toHaveLength(3);
    const batchId = batchJson.batchId as string;

    // Gudang tidak boleh menjalankan AI scan atau batch review (403)
    const gudangAnalyzeBlocked = await analyzeProductBatch(
      jsonReq("http://localhost/api/product-requests/analyze", "POST", { batchId })
    );
    expect(gudangAnalyzeBlocked.status).toBe(403);

    const gudangReviewBlocked = await reviewProductBatch(
      jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
        batchId,
        decision: "DISETUJUI",
      })
    );
    expect(gudangReviewBlocked.status).toBe(403);

    // Pemilik memindai nota secara opsional dengan AI lalu menyetujui seluruh paket 1 klik
    activeSessionToken = ownerToken;
    const analyzeRes = await analyzeProductBatch(
      jsonReq("http://localhost/api/product-requests/analyze", "POST", { batchId })
    );
    expect(analyzeRes.status).toBe(200);
    const analyzeJson = await analyzeRes.json();
    expect(analyzeJson.analysis.items).toHaveLength(3);
    expect(analyzeJson.analysis.items[2].matchStatus).toBe("RESEP_NON_NOTA");

    // Gudang mengganti foto nota saat masih menunggu persetujuan -> diizinkan (200) & mereset hasil AI lama
    const updatedSampleReceipt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    activeSessionToken = gudangToken;
    const replaceBatchReceiptRes = await updateProductRequestReceipt(
      jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
        batchId,
        receiptImageData: updatedSampleReceipt,
        receiptSource: "DIGITAL",
      })
    );
    expect(replaceBatchReceiptRes.status).toBe(200);
    const replaceBatchJson = await replaceBatchReceiptRes.json();
    expect(replaceBatchJson.receiptImageData).toBe(updatedSampleReceipt);
    expect(replaceBatchJson.receiptSource).toBe("DIGITAL");
    expect(replaceBatchJson.aiScanResult).toBeNull();

    // Pengguna lain selain pengaju/admin (Kasir) dilarang mengganti nota pengajuan (403)
    activeSessionToken = kasirToken;
    const kasirReplaceBlocked = await updateProductRequestReceipt(
      jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
        batchId,
        receiptImageData: sampleReceipt,
        receiptSource: "FISIK",
      })
    );
    expect(kasirReplaceBlocked.status).toBe(403);

    activeSessionToken = ownerToken;
    const approveBatchRes = await reviewProductBatch(
      jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
        batchId,
        decision: "DISETUJUI",
      })
    );
    expect(approveBatchRes.status).toBe(200);
    const approveBatchJson = await approveBatchRes.json();
    expect(approveBatchJson.processedCount).toBe(3);

    // Setelah pengajuan disetujui, penggantian nota ditolak (400)
    activeSessionToken = gudangToken;
    const replaceAfterApproveBlocked = await updateProductRequestReceipt(
      jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
        batchId,
        receiptImageData: sampleReceipt,
        receiptSource: "FISIK",
      })
    );
    expect(replaceAfterApproveBlocked.status).toBe(400);

    // Pastikan bahan baku, produk jual, dan resep aktif dengan relasi materialId asli (bukan clientTempId)
    const activeCatalog = await (await listProducts()).json();
    const susuCreated = activeCatalog.products.find(
      (p: { sku: string }) => p.sku === "BHN-SUSU-B1"
    );
    const airCreated = activeCatalog.products.find(
      (p: { sku: string }) => p.sku === "PRD-AIR-B1"
    );
    const recipeCreated = activeCatalog.products.find(
      (p: { sku: string }) => p.sku === "MNU-SUSU-B1"
    );
    expect(susuCreated.currentStock).toBe(1000);
    expect(airCreated.currentStock).toBe(24);
    expect(recipeCreated.costPrice).toBe(2000);
    expect(recipeCreated.variants[0].ingredients[0].materialId).toBe(susuCreated.id);

    // KASIR_GUDANG bisa melakukan penjualan di Kasir SEKALIGUS mengajukan paket barang (lalu ditolak Pemilik)
    activeSessionToken = comboToken;
    const comboSale = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        items: [{ productId: recipeCreated.id, quantity: 1 }],
      })
    );
    expect(comboSale.status).toBe(200);

    const comboBatch = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        batchTitle: "Paket Ditolak",
        items: [
          {
            sku: "PRD-REJ-B2",
            name: "Produk Akan Ditolak",
            categoryId: category.id,
            stockMethod: "TETAP",
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 5000,
            sellPrice: 9000,
            currentStock: 5,
          },
        ],
      })
    );
    expect(comboBatch.status).toBe(202);
    const rejectBatchId = (await comboBatch.json()).batchId as string;

    activeSessionToken = ownerToken;
    const rejectBatchRes = await reviewProductBatch(
      jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
        batchId: rejectBatchId,
        decision: "DITOLAK",
        rejectionReason: "Belum diperlukan minggu ini.",
      })
    );
    expect(rejectBatchRes.status).toBe(200);
    expect((await rejectBatchRes.json()).decision).toBe("DITOLAK");

    // GUDANG mencatat pembelian TANPA nota (opsional) -> sukses dengan status TANPA_NOTA dan tanpa auto-AI
    activeSessionToken = gudangToken;
    const noReceiptPurchaseRes = await createPurchase(
      jsonReq("http://localhost/api/purchases", "POST", {
        invoiceNumber: "INV-OPT-001",
        supplierName: "Agen Tanpa Nota",
        purchaseDate: "2026-11-25",
        fundingSource: "DANA_TOKO",
        captureMethod: "TANPA_NOTA",
        receiptImageData: null,
        totalAmount: 50000,
        items: [
          {
            itemName: "Gula Pasir 1kg",
            quantity: 5,
            unit: "kg",
            unitCost: 10000,
            subtotal: 50000,
          },
        ],
      })
    );
    expect(noReceiptPurchaseRes.status).toBe(200);
    const noReceiptPurchaseJson = await noReceiptPurchaseRes.json();
    expect(noReceiptPurchaseJson.purchase.aiValidationStatus).toBe("TANPA_NOTA");
    expect(noReceiptPurchaseJson.purchase.captureMethod).toBe("TANPA_NOTA");
    expect(noReceiptPurchaseJson.purchase.receiptImageData).toBe("");
    expect(noReceiptPurchaseJson.purchase.aiAnalysisJson).toBeNull();

    // GUDANG mencatat pembelian DENGAN nota -> status BELUM_DICEK, AI tidak berjalan otomatis saat pegawai kirim
    const withReceiptPurchaseRes = await createPurchase(
      jsonReq("http://localhost/api/purchases", "POST", {
        invoiceNumber: "INV-OPT-002",
        supplierName: "Agen Dengan Nota",
        purchaseDate: "2026-11-25",
        fundingSource: "DANA_TOKO",
        captureMethod: "DIGITAL_UPLOAD",
        receiptImageData: sampleReceipt,
        totalAmount: 100000,
        items: [
          {
            itemName: "Minyak Goreng 2L",
            quantity: 4,
            unit: "pcs",
            unitCost: 25000,
            subtotal: 100000,
          },
        ],
      })
    );
    expect(withReceiptPurchaseRes.status).toBe(200);
    const withReceiptJson = await withReceiptPurchaseRes.json();
    expect(withReceiptJson.purchase.aiValidationStatus).toBe("BELUM_DICEK");
    expect(withReceiptJson.purchase.aiAnalysisJson).toBeNull();
    const withReceiptId = withReceiptJson.purchase.id as string;

    // GUDANG dilarang menjalankan cek AI pembelian (403)
    const gudangAnalyzePurchaseBlocked = await analyzePurchase(
      jsonReq("http://localhost/api/purchases/analyze", "POST", {
        purchaseId: withReceiptId,
      })
    );
    expect(gudangAnalyzePurchaseBlocked.status).toBe(403);

    // PEMILIK menjalankan cek AI pembelian secara on-demand dan hasil tersimpan ke database
    activeSessionToken = ownerToken;
    const ownerAnalyzePurchaseRes = await analyzePurchase(
      jsonReq("http://localhost/api/purchases/analyze", "POST", {
        purchaseId: withReceiptId,
      })
    );
    expect(ownerAnalyzePurchaseRes.status).toBe(200);
    const ownerAnalyzeJson = await ownerAnalyzePurchaseRes.json();
    expect(ownerAnalyzeJson.analysis.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);

    const updatedPurchaseRow = await prisma.purchase.findUniqueOrThrow({
      where: { id: withReceiptId },
    });
    expect(updatedPurchaseRow.aiValidationStatus).toBe(ownerAnalyzeJson.analysis.status);
    expect(updatedPurchaseRow.aiAnalysisJson).toBeTruthy();

    // Pengaju (GUDANG) boleh mengganti foto nota pembelian selama masih MENUNGGU_PERSETUJUAN -> status AI direset ke BELUM_DICEK
    activeSessionToken = gudangToken;
    const replacePurchaseReceiptRes = await updatePurchaseReceipt(
      jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
        purchaseId: withReceiptId,
        receiptImageData: updatedSampleReceipt,
        captureMethod: "LIVE_CAMERA",
      })
    );
    expect(replacePurchaseReceiptRes.status).toBe(200);
    const replacePurchaseJson = await replacePurchaseReceiptRes.json();
    expect(replacePurchaseJson.purchase.receiptImageData).toBe(updatedSampleReceipt);
    expect(replacePurchaseJson.purchase.captureMethod).toBe("LIVE_CAMERA");
    expect(replacePurchaseJson.purchase.aiValidationStatus).toBe("BELUM_DICEK");
    expect(replacePurchaseJson.purchase.aiAnalysisJson).toBeNull();

    // Pengguna lain non-admin (KASIR) dilarang mengganti nota pembelian (403)
    activeSessionToken = kasirToken;
    const kasirReplacePurchaseBlocked = await updatePurchaseReceipt(
      jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
        purchaseId: withReceiptId,
        receiptImageData: sampleReceipt,
        captureMethod: "DIGITAL_UPLOAD",
      })
    );
    expect(kasirReplacePurchaseBlocked.status).toBe(403);

    // Pemilik menyetujui pembelian, setelah itu foto nota terkunci dan tidak bisa diganti lagi (400)
    activeSessionToken = ownerToken;
    const approvePurchaseRes = await reviewPurchase(
      jsonReq("http://localhost/api/purchases/review", "POST", {
        purchaseId: withReceiptId,
        decision: "DISETUJUI",
      })
    );
    expect(approvePurchaseRes.status).toBe(200);

    activeSessionToken = gudangToken;
    const replaceApprovedPurchaseBlocked = await updatePurchaseReceipt(
      jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
        purchaseId: withReceiptId,
        receiptImageData: sampleReceipt,
        captureMethod: "DIGITAL_UPLOAD",
      })
    );
    expect(replaceApprovedPurchaseBlocked.status).toBe(400);
  });

  it("Scenario 28: Forgot Password request, single-use reset token validation, password update, and session invalidation", async () => {
    const regOwner = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Budi Pemilik",
        username: "budi_reset",
        email: "budi@tokosehat.id",
        password: "PasswordLama123",
        roomName: "Toko Sehat",
      })
    );
    expect(regOwner.status).toBe(201);
    const ownerJson = await regOwner.json();

    // Email yang tidak terdaftar tetap memberi respons generik 200 (anti-enumerasi)
    const unknownEmailRes = await forgotPasswordApi(
      jsonReq("http://localhost/api/auth/forgot-password", "POST", {
        email: "tidakterdaftar@example.com",
      })
    );
    expect(unknownEmailRes.status).toBe(200);

    // Email terdaftar memicu pencatatan request reset password tanpa membocorkan token di test/prod response
    const validReqRes = await forgotPasswordApi(
      jsonReq("http://localhost/api/auth/forgot-password", "POST", {
        email: "budi@tokosehat.id",
      })
    );
    expect(validReqRes.status).toBe(200);
    const validReqJson = await validReqRes.json();
    expect(validReqJson.devPreviewUrl).toBeUndefined();

    const dbUserBefore = await prisma.user.findUniqueOrThrow({
      where: { id: ownerJson.user.id },
    });
    const resetToken = await createPasswordResetToken({
      userId: dbUserBefore.id,
      email: dbUserBefore.email,
      tokenVersion: dbUserBefore.tokenVersion,
      passwordHash: dbUserBefore.passwordHash,
    });

    const checkValidRes = await verifyResetApi(
      new Request(`http://localhost/api/auth/reset-password?token=${encodeURIComponent(resetToken)}`)
    );
    expect(checkValidRes.status).toBe(200);
    expect((await checkValidRes.json()).valid).toBe(true);

    const doResetRes = await resetPasswordApi(
      jsonReq("http://localhost/api/auth/reset-password", "POST", {
        token: resetToken,
        newPassword: "PasswordBaru456",
      })
    );
    expect(doResetRes.status).toBe(200);

    // Kata sandi lama tidak bisa login lagi
    const oldLoginRes = await loginUser(
      jsonReq("http://localhost/api/auth/login", "POST", {
        identifier: "budi@tokosehat.id",
        password: "PasswordLama123",
      })
    );
    expect(oldLoginRes.status).toBe(401);

    // Kata sandi baru berhasil login
    const newLoginRes = await loginUser(
      jsonReq("http://localhost/api/auth/login", "POST", {
        identifier: "budi@tokosehat.id",
        password: "PasswordBaru456",
      })
    );
    expect(newLoginRes.status).toBe(200);

    // Token yang sama otomatis hangus (single-use) setelah password berubah
    const reuseRes = await resetPasswordApi(
      jsonReq("http://localhost/api/auth/reset-password", "POST", {
        token: resetToken,
        newPassword: "PasswordKetiga789",
      })
    );
    expect(reuseRes.status).toBe(400);
  });

  it("Scenario 29: Product request batch deletion (FOR_ME vs FOR_ALL RBAC, visibility isolation, and catalog safety)", async () => {
    const regOwner = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Pemilik Hapus Pengajuan",
        username: "owner_delreq",
        password: "PasswordAman123",
        roomName: "Toko Uji Hapus Pengajuan",
      })
    );
    expect(regOwner.status).toBe(201);
    const ownerJson = await regOwner.json();
    const ownerToken = extractSessionToken(regOwner)!;
    const roomId = ownerJson.user.roomId as string;

    activeSessionToken = ownerToken;
    const invMgr = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "MANAJER",
          })
        )
      ).json()
    ).inviteCode as string;
    const invGudang = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "GUDANG",
          })
        )
      ).json()
    ).inviteCode as string;

    const mgrToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Manajer Hapus",
          username: "mgr_delreq",
          password: "PasswordAman123",
          inviteCode: invMgr,
        })
      )
    )!;
    const gudangToken = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Gudang Hapus",
          username: "gudang_delreq",
          password: "PasswordAman123",
          inviteCode: invGudang,
        })
      )
    )!;

    const category = await prisma.category.findFirstOrThrow({ where: { roomId } });

    activeSessionToken = gudangToken;
    const batch1Res = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        batchTitle: "Paket Uji Hapus Satu",
        items: [
          {
            sku: "DEL-REQ-01",
            name: "Kopi Kemasan Uji",
            categoryId: category.id,
            stockMethod: "TETAP",
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 5000,
            sellPrice: 9000,
          },
        ],
      })
    );
    expect(batch1Res.status).toBe(202);
    const batch1Id = (await batch1Res.json()).batchId as string;

    const batch2Res = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        batchTitle: "Paket Uji Hapus Dua",
        items: [
          {
            sku: "DEL-REQ-02",
            name: "Teh Kemasan Uji",
            categoryId: category.id,
            stockMethod: "TETAP",
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 4000,
            sellPrice: 7000,
          },
        ],
      })
    );
    expect(batch2Res.status).toBe(202);
    const batch2Id = (await batch2Res.json()).batchId as string;

    // 1. Pegawai dilarang menghapus untuk semua orang (403)
    const empForAllBlocked = await deleteProductRequest(
      jsonReq("http://localhost/api/product-requests", "DELETE", {
        batchId: batch1Id,
        scope: "FOR_ALL",
      })
    );
    expect(empForAllBlocked.status).toBe(403);

    // 2. Pegawai menghapus Paket 1 hanya untuk dirinya sendiri (FOR_ME -> 200)
    const empForMeRes = await deleteProductRequest(
      jsonReq("http://localhost/api/product-requests", "DELETE", {
        batchId: batch1Id,
        scope: "FOR_ME",
      })
    );
    expect(empForMeRes.status).toBe(200);

    const empListAfter = await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json();
    expect(empListAfter.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-01")).toBe(false);
    expect(empListAfter.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-02")).toBe(true);

    // Pemilik masih tetap melihat Paket 1
    activeSessionToken = ownerToken;
    const ownerListBefore = await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json();
    expect(ownerListBefore.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-01")).toBe(true);

    // 3. Pemilik menghapus Paket 1 hanya untuk dirinya (FOR_ME) -> hilang dari Pemilik, masih tampil di Manajer
    const ownerForMeRes = await deleteProductRequest(
      jsonReq("http://localhost/api/product-requests", "DELETE", {
        batchId: batch1Id,
        scope: "FOR_ME",
      })
    );
    expect(ownerForMeRes.status).toBe(200);

    const ownerListAfterForMe = await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json();
    expect(ownerListAfterForMe.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-01")).toBe(false);

    activeSessionToken = mgrToken;
    const mgrListAfterOwnerForMe = await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json();
    expect(mgrListAfterOwnerForMe.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-01")).toBe(true);

    // 4. Pemilik menghapus Paket 2 untuk semua pengguna (FOR_ALL) -> hilang permanen di DB & di semua peran
    activeSessionToken = ownerToken;
    const ownerForAllRes = await deleteProductRequest(
      jsonReq("http://localhost/api/product-requests", "DELETE", {
        batchId: batch2Id,
        scope: "FOR_ALL",
      })
    );
    expect(ownerForAllRes.status).toBe(200);

    const remainingBatch2 = await prisma.productRequest.findMany({
      where: { roomId, sku: "DEL-REQ-02" },
    });
    expect(remainingBatch2).toHaveLength(0);

    activeSessionToken = gudangToken;
    const empListFinal = await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json();
    expect(empListFinal.requests.some((r: { sku: string }) => r.sku === "DEL-REQ-02")).toBe(false);
  });

  it("Scenario 30: Blind Buka Shift & Tutup Shift with denomination counting, handover sync, and admin audit", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Shift",
        username: "owner_shift30",
        password: "PasswordAman123",
        roomName: "Kedai Kopi Shift",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();
    const roomId = ownerJson.user.roomId as string;

    activeSessionToken = ownerToken;
    const category = await prisma.category.findFirstOrThrow({ where: { roomId } });

    const prodRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "KOPI-SHIFT-01",
        name: "Kopi Susu Shift",
        categoryId: category.id,
        stockMethod: "TETAP",
        isRawMaterial: false,
        purchaseUnit: "Cup",
        sellUnit: "Cup",
        conversionRatio: 1,
        costPrice: 10000,
        sellPrice: 20000,
        currentStock: 50,
        minStockAlert: 5,
      })
    );
    expect(prodRes.status).toBe(201);
    const prod = (await prodRes.json()).product;

    const invKasirCode = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;

    const kasirRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir Pagi",
        username: "kasir_shift30",
        password: "PasswordAman123",
        inviteCode: invKasirCode,
      })
    );
    expect(kasirRes.status).toBe(201);
    const kasirToken = extractSessionToken(kasirRes)!;

    // 1. Kasir Buka Shift 1 dengan modal pecahan Rp 250.000
    activeSessionToken = kasirToken;
    const open1Res = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        denominations: { "100000": 2, "50000": 1 },
        openingNote: "Modal awal pagi",
        readyConfirmed: true,
      })
    );
    expect(open1Res.status).toBe(201);
    const open1Json = await open1Res.json();
    expect(open1Json.activeShift.openingCashTotal).toBe(250000);
    expect(open1Json.activeShift.handoverSyncStatus).toBe("SHIFT_PERTAMA");
    expect(open1Json.activeShift).not.toHaveProperty("previousShiftClosingCash");
    expect(open1Json.activeShift).not.toHaveProperty("handoverDifference");

    // Tidak boleh buka shift ganda
    const dupOpenRes = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        denominations: { "100000": 1 },
        readyConfirmed: true,
      })
    );
    expect(dupOpenRes.status).toBe(409);

    // 2. Kasir catat transaksi tunai Rp 40.000
    const sale1Res = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        items: [{ productId: prod.id, quantity: 2 }],
        paymentMethod: "TUNAI",
        cashReceived: 50000,
      })
    );
    expect(sale1Res.status).toBe(200);

    // 3. Kasir Tutup Shift Buta (Rp 280.000 + operasional Rp 10.000 => 250rb + 40rb - 10rb = 280rb, KLOP)
    const close1Res = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "CLOSE",
        shiftId: open1Json.activeShift.id,
        denominations: { "100000": 2, "50000": 1, "20000": 1, "10000": 1 },
        operationalExpenses: [{ description: "Beli es batu", amount: 10000 }],
        closingNote: "Loker aman",
        honestyConfirmed: true,
      })
    );
    expect(close1Res.status).toBe(201);
    const close1Json = await close1Res.json();
    expect(close1Json.closing.actualCashTotal).toBe(280000);
    expect(close1Json.closing.operationalExpenseTotal).toBe(10000);
    expect(close1Json.closing.status).toBe("TERCATAT");
    expect(close1Json.closing).not.toHaveProperty("cashDifference");
    expect(close1Json.closing).not.toHaveProperty("expectedCashAtClose");
    expect(close1Json.closing).not.toHaveProperty("systemCashTotal");

    // 4. Kasir Buka Shift 2 dengan modal Rp 250.000 (seharusnya Rp 280.000 => estafet TIDAK_SINKRON -30rb)
    await new Promise((r) => setTimeout(r, 20));
    const open2Res = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        denominations: { "100000": 2, "50000": 1 },
        readyConfirmed: true,
      })
    );
    expect(open2Res.status).toBe(201);

    const sale2Res = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        items: [{ productId: prod.id, quantity: 1 }],
        paymentMethod: "TUNAI",
        cashReceived: 20000,
      })
    );
    expect(sale2Res.status).toBe(200);

    // 5. Kasir Tutup Shift 2 dengan fisik Rp 240.000 (seharusnya 250rb + 20rb = 270rb => kurang -30rb)
    const close2Res = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "CLOSE",
        denominations: { "100000": 2, "20000": 2 },
        honestyConfirmed: true,
      })
    );
    expect(close2Res.status).toBe(201);
    const close2Json = await close2Res.json();
    // Masih buta untuk kasir meskipun ada selisih -30rb!
    expect(close2Json.closing.status).toBe("TERCATAT");
    expect(close2Json.closing).not.toHaveProperty("cashDifference");
    expect(close2Json.closing).not.toHaveProperty("expectedCashAtClose");

    // Verifikasi GET /api/shifts oleh kasir tidak membocorkan ringkasan sistem atau rincian envelope rahasia
    const kasirGetJson = await (await getShifts(new Request("http://localhost/api/shifts"))).json();
    expect(kasirGetJson.summary).toBeNull();
    expect(kasirGetJson.closings.length).toBe(2);
    const kasirClosingsRaw = JSON.stringify(kasirGetJson.closings);
    expect(kasirClosingsRaw).not.toContain("expectedCashAtClose");
    expect(kasirClosingsRaw).not.toContain("closingCashDifference");
    expect(kasirClosingsRaw).not.toContain("handoverDifference");
    expect(kasirClosingsRaw).not.toContain("systemCashTotal");

    // Verifikasi notifikasi SHIFT dibuat untuk admin (estafet & selisih)
    const shiftNotifs = await prisma.notification.findMany({
      where: { roomId, category: "SHIFT" },
    });
    expect(shiftNotifs.length).toBe(2);

    // 6. Pemilik memeriksa Audit Shift di /api/reports & /api/dashboard
    activeSessionToken = ownerToken;
    const reportRes = await getReports(new Request("http://localhost/api/reports?period=monthly"));
    expect(reportRes.status).toBe(200);
    const reportJson = await reportRes.json();
    expect(reportJson.shiftSummary.totalShifts).toBe(2);
    expect(reportJson.shiftSummary.discrepancyCount).toBe(1);
    expect(reportJson.shiftSummary.handoverMismatchCount).toBe(1);
    expect(reportJson.shiftSummary.netCashDifferenceRp).toBe(-30000);

    const shift2Audit = reportJson.shiftAudits[0];
    expect(shift2Audit.handoverSyncStatus).toBe("TIDAK_SINKRON");
    expect(shift2Audit.handoverDifference).toBe(-30000);
    expect(shift2Audit.expectedCashAtClose).toBe(270000);
    expect(shift2Audit.actualCashTotal).toBe(240000);
    expect(shift2Audit.cashDifference).toBe(-30000);
    expect(shift2Audit.status).toBe("PERLU_DIPERIKSA");

    const dashRes = await getDashboard(new Request("http://localhost/api/dashboard?range=month"));
    expect(dashRes.status).toBe(200);
    const dashJson = await dashRes.json();
    expect(dashJson.anomalies).not.toHaveProperty("discrepantShifts");
    expect(dashJson.anomalies.flaggedShifts.length).toBe(1);
    expect(dashJson.anomalies.flaggedShifts[0].cashDifference).toBe(-30000);
  });

  it("Scenario 31: Multi-Loket registration, exclusive 1-cashier lock, independent per-loket handover, company rename & dashboard comparison", async () => {
    // 1. Register perusahaan sekaligus mengatur 2 loket awal
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Multi Loket",
        username: "owner_loket31",
        password: "PasswordAman123",
        roomName: "Minimarket Nusantara",
        counterNames: ["Loket 1", "Loket 2"],
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerJson = await ownerRes.json();
    const ownerToken = extractSessionToken(ownerRes)!;
    const roomId = ownerJson.user.roomId as string;
    expect(ownerJson.counters.map((c: { name: string }) => c.name)).toEqual(["Loket 1", "Loket 2"]);

    activeSessionToken = ownerToken;
    const cat = await prisma.category.findFirstOrThrow({ where: { roomId } });
    const prod = (
      await (
        await createProduct(
          jsonReq("http://localhost/api/products", "POST", {
            sku: "ITEM-LOKET-01",
            name: "Air Mineral Botol",
            categoryId: cat.id,
            stockMethod: "TETAP",
            isRawMaterial: false,
            purchaseUnit: "Botol",
            sellUnit: "Botol",
            conversionRatio: 1,
            costPrice: 3000,
            sellPrice: 5000,
            currentStock: 100,
            minStockAlert: 10,
          })
        )
      ).json()
    ).product;

    // Tambah Loket 3 via Manajemen Loket
    const addCounterRes = await createCounter(
      jsonReq("http://localhost/api/counters", "POST", { name: "Loket 3" })
    );
    expect(addCounterRes.status).toBe(201);

    const inv1 = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;
    const inv2 = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;

    const kasir1Token = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Kasir Satu",
          username: "kasir1_loket31",
          password: "PasswordAman123",
          inviteCode: inv1,
        })
      )
    )!;
    const kasir2Token = extractSessionToken(
      await registerUser(
        jsonReq("http://localhost/api/auth/register", "POST", {
          mode: "JOIN_ROOM",
          name: "Kasir Dua",
          username: "kasir2_loket31",
          password: "PasswordAman123",
          inviteCode: inv2,
        })
      )
    )!;

    // Non-admin kasir dilarang menambah atau menghapus loket
    activeSessionToken = kasir1Token;
    expect(
      (await createCounter(jsonReq("http://localhost/api/counters", "POST", { name: "Loket Gelap" }))).status
    ).toBe(403);
    expect(
      (await deleteCounter(new Request("http://localhost/api/counters?id=loket-3", { method: "DELETE" }))).status
    ).toBe(403);

    // Multi-loket wajib memilih counterId saat buka shift
    const missingLoketRes = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        denominations: { "100000": 2 },
        readyConfirmed: true,
      })
    );
    expect(missingLoketRes.status).toBe(400);

    // 2. Kasir 1 membuka Loket 1 dengan Rp 200.000
    const openK1 = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        counterId: "loket-1",
        denominations: { "100000": 2 },
        readyConfirmed: true,
      })
    );
    expect(openK1.status).toBe(201);
    const openK1Json = await openK1.json();
    expect(openK1Json.activeShift.counterId).toBe("loket-1");
    expect(openK1Json.activeShift.counterName).toBe("Loket 1");

    // Verifikasi Loket 1 statusnya sedang dipakai Kasir Satu
    const liveCounters = await (await getCounters()).json();
    const l1 = liveCounters.counters.find((c: { id: string }) => c.id === "loket-1");
    expect(l1.isOccupied).toBe(true);
    expect(l1.occupiedBy.userName).toBe("Kasir Satu");

    // 3. Kasir 2 mencoba masuk ke Loket 1 yang terkunci -> DITOLAK 409!
    activeSessionToken = kasir2Token;
    const blockedOpen = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        counterId: "loket-1",
        denominations: { "100000": 2 },
        readyConfirmed: true,
      })
    );
    expect(blockedOpen.status).toBe(409);

    // Pemilik mencoba hapus Loket 1 yang sedang aktif -> DITOLAK 409, hapus Loket 3 yg kosong -> BERHASIL 200
    activeSessionToken = ownerToken;
    const delOccupied = await deleteCounter(
      new Request("http://localhost/api/counters?id=loket-1", { method: "DELETE" })
    );
    expect(delOccupied.status).toBe(409);
    const delFree = await deleteCounter(
      new Request("http://localhost/api/counters?id=loket-3", { method: "DELETE" })
    );
    expect(delFree.status).toBe(200);

    // 4. Kasir 2 membuka Loket 2 (Rp 300.000) secara paralel sambil Kasir 1 aktif di Loket 1
    activeSessionToken = kasir2Token;
    const openK2 = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        counterId: "loket-2",
        denominations: { "100000": 3 },
        readyConfirmed: true,
      })
    );
    expect(openK2.status).toBe(201);

    // Penjualan masing-masing kasir harus terisolasi per loket
    activeSessionToken = kasir1Token;
    await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        items: [{ productId: prod.id, quantity: 4 }], // Rp 20.000
        paymentMethod: "TUNAI",
        cashReceived: 20000,
      })
    );
    activeSessionToken = kasir2Token;
    await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        items: [{ productId: prod.id, quantity: 10 }], // Rp 50.000
        paymentMethod: "TUNAI",
        cashReceived: 50000,
      })
    );

    // Kasir 1 tutup Loket 1 dengan Rp 220.000 (200rb + 20rb = 220rb -> KLOP)
    activeSessionToken = kasir1Token;
    const closeK1 = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "CLOSE",
        denominations: { "100000": 2, "20000": 1 },
        honestyConfirmed: true,
      })
    );
    expect(closeK1.status).toBe(201);

    // Kasir 2 tutup Loket 2 dengan Rp 340.000 (300rb + 50rb = 350rb -> kurang -10rb)
    activeSessionToken = kasir2Token;
    const closeK2 = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "CLOSE",
        denominations: { "100000": 3, "20000": 2 },
        honestyConfirmed: true,
      })
    );
    expect(closeK2.status).toBe(201);

    // 5. Loket 1 kini bebas & Kasir 2 membuka Loket 1 dengan Rp 220.000 -> SINKRON dengan shift lalu Loket 1 (bukan Loket 2!)
    await new Promise((r) => setTimeout(r, 20));
    const reopenL1 = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        counterId: "loket-1",
        denominations: { "100000": 2, "20000": 1 },
        readyConfirmed: true,
      })
    );
    expect(reopenL1.status).toBe(201);
    expect((await reopenL1.json()).activeShift.handoverSyncStatus).toBe("SINKRON");

    // 6. Pemilik mengganti nama perusahaan & cek grafik perbandingan per loket di /api/dashboard
    activeSessionToken = ownerToken;
    const renameRes = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_AUDIT_SETTINGS",
        storeName: "Nusantara Mart Group",
        storeAddress: "Jakarta Pusat",
      })
    );
    expect(renameRes.status).toBe(200);
    expect((await renameRes.json()).settings.storeName).toBe("Nusantara Mart Group");

    const dashJson = await (
      await getDashboard(new Request("http://localhost/api/dashboard?range=month"))
    ).json();
    expect(dashJson.anomalies).not.toHaveProperty("discrepantShifts");
    const c1 = dashJson.counterComparison.find((c: { counterId: string }) => c.counterId === "loket-1");
    const c2 = dashJson.counterComparison.find((c: { counterId: string }) => c.counterId === "loket-2");
    expect(c1.isOccupied).toBe(true);
    expect(c1.occupiedByName).toBe("Kasir Dua");
    expect(c1.totalExpectedCash).toBe(220000);
    expect(c1.totalActualCash).toBe(220000);
    expect(c1.totalCashDifference).toBe(0);
    expect(c2.isOccupied).toBe(false);
    expect(c2.totalExpectedCash).toBe(350000);
    expect(c2.totalActualCash).toBe(340000);
    expect(c2.totalCashDifference).toBe(-10000);
    expect(c2.discrepancyCount).toBe(1);
  });

  it("Scenario 32: Verified email change flow & accurate team collaborator active shift listing", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Email",
        username: "owner_email32",
        email: "owner.lama@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Verifikasi Email",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();

    activeSessionToken = ownerToken;
    const invKasir = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;

    const kasirRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir Email",
        username: "kasir_email32",
        email: "kasir.tetap@toko.id",
        password: "PasswordAman123",
        inviteCode: invKasir,
      })
    );
    expect(kasirRes.status).toBe(201);
    const kasirToken = extractSessionToken(kasirRes)!;

    // Kasir membuka shift aktif (belum ada penjualan)
    activeSessionToken = kasirToken;
    const openRes = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "OPEN",
        denominations: { "50000": 2 },
        readyConfirmed: true,
      })
    );
    expect(openRes.status).toBe(201);

    // Owner memuat daftar tim (/api/users) -> harus berhasil dan mendeteksi hasOpenShift=true untuk Kasir
    activeSessionToken = ownerToken;
    const usersRes = await getUsers();
    expect(usersRes.status).toBe(200);
    const usersJson = await usersRes.json();
    const listedKasir = usersJson.users.find(
      (u: { username: string }) => u.username === "kasir_email32"
    );
    expect(listedKasir).toBeDefined();
    expect(listedKasir.hasOpenShift).toBe(true);

    // Ganti email: salah kata sandi -> 400
    const badPassRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "REQUEST",
        newEmail: "owner.baru@toko.id",
        currentPassword: "SalahPassword",
      })
    );
    expect(badPassRes.status).toBe(400);

    // Ganti email: email sudah dipakai akun lain -> 409
    const dupEmailRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "REQUEST",
        newEmail: "kasir.tetap@toko.id",
        currentPassword: "PasswordAman123",
      })
    );
    expect(dupEmailRes.status).toBe(409);

    // Permintaan verifikasi email valid -> mengeluarkan verificationToken + devCode (mode test/dev)
    const reqEmailRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "REQUEST",
        newEmail: "owner.baru@toko.id",
        currentPassword: "PasswordAman123",
      })
    );
    expect(reqEmailRes.status).toBe(200);
    const reqEmailJson = await reqEmailRes.json();
    expect(reqEmailJson.verificationToken).toBeTruthy();
    expect(reqEmailJson.devCode).toMatch(/^\d{6}$/);

    // Kode verifikasi salah -> 400
    const wrongOtpRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: reqEmailJson.verificationToken,
        code: reqEmailJson.devCode === "000000" ? "111111" : "000000",
      })
    );
    expect(wrongOtpRes.status).toBe(400);

    // Konfirmasi kode benar -> email berubah di DB
    const confirmEmailRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: reqEmailJson.verificationToken,
        code: reqEmailJson.devCode,
      })
    );
    expect(confirmEmailRes.status).toBe(200);
    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: ownerJson.user.id },
      select: { email: true },
    });
    expect(updatedUser.email).toBe("owner.baru@toko.id");
  });

  it("Scenario 33: Blocks cross-tenant IDORs, RBAC global tamper, host header poisoning, OTP brute force/replay, and invalidates old sessions on password change", async () => {
    // 1. Setup Room A (Owner + Kasir + Material + Category) and Room B (Owner + Raw Material + Warehouse)
    const ownerARes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Alpha",
        username: "owner_alpha33",
        email: "alpha33@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Alpha 33",
      })
    );
    expect(ownerARes.status).toBe(201);
    const ownerAToken = extractSessionToken(ownerARes)!;
    const ownerAJson = await ownerARes.json();

    activeSessionToken = ownerAToken;
    const invKasirA = (
      await (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json()
    ).inviteCode as string;

    const kasirARes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir Alpha",
        username: "kasir_alpha33",
        email: "kasir33@toko.id",
        password: "PasswordAman123",
        inviteCode: invKasirA,
      })
    );
    expect(kasirARes.status).toBe(201);
    const kasirAToken = extractSessionToken(kasirARes)!;

    const ownerBRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Beta",
        username: "owner_beta33",
        email: "beta33@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Beta 33",
      })
    );
    expect(ownerBRes.status).toBe(201);
    const ownerBToken = extractSessionToken(ownerBRes)!;
    const ownerBJson = await ownerBRes.json();

    activeSessionToken = ownerBToken;
    const catB = await prisma.category.findFirstOrThrow({ where: { roomId: ownerBJson.room.id } });
    const whB = await prisma.warehouse.findFirstOrThrow({ where: { roomId: ownerBJson.room.id } });
    const matBRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "BHN-BETA-33",
        name: "Bahan Rahasia Beta",
        categoryId: catB.id,
        stockMethod: "TETAP",
        isRawMaterial: true,
        purchaseUnit: "kg",
        sellUnit: "kg",
        conversionRatio: 1,
        costPrice: 10000,
        sellPrice: 0,
        currentStock: 50,
      })
    );
    expect(matBRes.status).toBe(201);
    const matB = (await matBRes.json()).product;

    // 2. Cross-tenant Recipe Ingredient IDOR -> DITOLAK (409) on POST & PUT /api/products
    activeSessionToken = ownerAToken;
    const catA = await prisma.category.findFirstOrThrow({ where: { roomId: ownerAJson.room.id } });
    const crossRecipePost = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "MNU-IDOR-33",
        name: "Menu IDOR",
        categoryId: catA.id,
        stockMethod: "RESEP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 0,
        sellPrice: 15000,
        variants: [
          {
            name: "Regular",
            sellPrice: 15000,
            ingredients: [{ materialId: matB.id, quantity: 1, unit: "kg" }],
          },
        ],
      })
    );
    expect(crossRecipePost.status).toBe(409);

    const ownProdRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "PRD-OWN-33",
        name: "Produk Lokal Alpha",
        categoryId: catA.id,
        stockMethod: "TETAP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 5000,
        sellPrice: 10000,
        currentStock: 10,
      })
    );
    expect(ownProdRes.status).toBe(201);
    const ownProd = (await ownProdRes.json()).product;

    const crossRecipePut = await updateProduct(
      jsonReq("http://localhost/api/products", "PUT", {
        id: ownProd.id,
        sku: "PRD-OWN-33",
        name: "Produk Lokal Alpha",
        categoryId: catA.id,
        stockMethod: "RESEP",
        purchaseUnit: "pcs",
        sellUnit: "pcs",
        conversionRatio: 1,
        costPrice: 0,
        sellPrice: 12000,
        variants: [
          {
            name: "Regular",
            sellPrice: 12000,
            ingredients: [{ materialId: matB.id, quantity: 1, unit: "kg" }],
          },
        ],
      })
    );
    expect(crossRecipePut.status).toBe(409);

    // 3. Cross-tenant Warehouse IDOR & spoofed proof attachment on /api/inventory
    const spoofedAdjRes = await postInventory(
      jsonReq("http://localhost/api/inventory", "POST", {
        action: "REQUEST_ADJUSTMENT",
        productId: ownProd.id,
        adjustmentType: "RUSAK",
        quantity: 1,
        reason: "Lampiran HTML menyamar sebagai PNG",
        proofImageData: "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      })
    );
    expect(spoofedAdjRes.status).toBe(400);

    const crossWhAdjRes = await postInventory(
      jsonReq("http://localhost/api/inventory", "POST", {
        action: "REQUEST_ADJUSTMENT",
        productId: ownProd.id,
        adjustmentType: "PINDAH_GUDANG",
        quantity: 1,
        reason: "Mencoba pindah stok ke gudang ruangan lain",
        proofImageData: "data:image/png;base64,iVBORw0KGgo=",
        toWarehouseId: whB.id,
      })
    );
    expect(crossWhAdjRes.status).toBe(400);

    const crossWhOpnameRes = await postInventory(
      jsonReq("http://localhost/api/inventory", "POST", {
        action: "SUBMIT_OPNAME",
        title: "Opname Lintas Ruangan",
        scheduleType: "HARIAN",
        warehouseId: whB.id,
        counts: [{ productId: ownProd.id, physicalStock: 9 }],
      })
    );
    expect(crossWhOpnameRes.status).toBe(400);

    // 4. Global RBAC table tamper via UPDATE_PERMISSIONS blocked (403)
    const rbacTamperRes = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_PERMISSIONS",
        permissions: [{ role: "KASIR", module: "pembelian", canView: true }],
      })
    );
    expect(rbacTamperRes.status).toBe(403);

    // 5. Audit Notification MARK_READ scoped so Kasir cannot mark Pemilik-only alert as read
    const ownerNotif = await prisma.notification.create({
      data: {
        roomId: ownerAJson.room.id,
        title: "Alert Rahasia Pemilik",
        message: "Khusus pemilik",
        severity: "CRITICAL",
        category: "SHIFT",
        targetRole: "PEMILIK",
        linkUrl: "/laporan",
      },
    });
    activeSessionToken = kasirAToken;
    const markReadRes = await postAudit(
      jsonReq("http://localhost/api/audit", "POST", {
        action: "MARK_READ",
        notificationId: ownerNotif.id,
      })
    );
    expect(markReadRes.status).toBe(200);
    const notifAfter = await prisma.notification.findUniqueOrThrow({
      where: { id: ownerNotif.id },
    });
    expect(notifAfter.isRead).toBe(false);

    // 6. SaleAmendment PERUBAHAN rejects invalid paymentMethod
    const saleForAmend = (
      await (
        await createSale(
          jsonReq("http://localhost/api/sales", "POST", {
            paymentMethod: "TUNAI",
            items: [{ productId: ownProd.id, quantity: 1 }],
          })
        )
      ).json()
    ).sale;
    const badAmendRes = await handleSaleAmendment(
      jsonReq("http://localhost/api/sales/amendments", "POST", {
        action: "REQUEST",
        saleId: saleForAmend.id,
        amendmentType: "PERUBAHAN",
        reason: "Ubah metode pembayaran tidak valid",
        proposedPayload: JSON.stringify({ paymentMethod: "CRYPTO_FAKE" }),
      })
    );
    expect(badAmendRes.status).toBe(400);

    // 7. Forgot-password ignores spoofed X-Forwarded-Host header
    const forgotSpoofReq = new Request("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ email: "alpha33@toko.id" }),
    });
    const forgotSpoofRes = await forgotPasswordApi(forgotSpoofReq);
    expect(forgotSpoofRes.status).toBe(200);
    const forgotSpoofJson = await forgotSpoofRes.json();
    if (forgotSpoofJson.devPreviewUrl) {
      expect(forgotSpoofJson.devPreviewUrl).not.toContain("attacker.example");
    }

    // 8. Change-email OTP brute-force lockout (5 attempts -> 429) & single-use replay rejection (400)
    activeSessionToken = ownerAToken;
    const otpReqRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "REQUEST",
        newEmail: "alpha33-next@toko.id",
        currentPassword: "PasswordAman123",
      })
    );
    expect(otpReqRes.status).toBe(200);
    const otpReqJson = await otpReqRes.json();

    // 8a. Request 1: brute-force 5 wrong guesses -> 5th triggers 429 lockout
    const lockReqRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "REQUEST",
        newEmail: "alpha33-lock@toko.id",
        currentPassword: "PasswordAman123",
      })
    );
    expect(lockReqRes.status).toBe(200);
    const lockReqJson = await lockReqRes.json();
    const lockBadCode = lockReqJson.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      const r = await changeEmailApi(
        jsonReq("http://localhost/api/account/change-email", "POST", {
          action: "CONFIRM",
          verificationToken: lockReqJson.verificationToken,
          code: lockBadCode,
        })
      );
      expect(r.status).toBe(400);
    }
    const fifthLockRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: lockReqJson.verificationToken,
        code: lockBadCode,
      })
    );
    expect(fifthLockRes.status).toBe(429);

    const postLockRightCodeRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: lockReqJson.verificationToken,
        code: lockReqJson.devCode,
      })
    );
    expect(postLockRightCodeRes.status).toBe(429);

    // 8b. Request 2: valid confirm succeeds (200) and replays are rejected (400)
    const confirmValidRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: otpReqJson.verificationToken,
        code: otpReqJson.devCode,
      })
    );
    expect(confirmValidRes.status).toBe(200);

    const replayRes = await changeEmailApi(
      jsonReq("http://localhost/api/account/change-email", "POST", {
        action: "CONFIRM",
        verificationToken: otpReqJson.verificationToken,
        code: otpReqJson.devCode,
      })
    );
    expect(replayRes.status).toBe(400);

    // 9. UPDATE_PROFILE password change bumps tokenVersion (old session invalidated, refreshed session works)
    const oldTokenBeforePassChange = ownerAToken;
    const passChangeRes = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_PROFILE",
        currentPassword: "PasswordAman123",
        newPassword: "PasswordBaru456",
      })
    );
    expect(passChangeRes.status).toBe(200);
    const refreshedToken = extractSessionToken(passChangeRes);
    expect(refreshedToken).toBeTruthy();
    expect(refreshedToken).not.toBe(oldTokenBeforePassChange);

    activeSessionToken = oldTokenBeforePassChange;
    const oldSessBlocked = await getDashboard(
      new Request("http://localhost/api/dashboard?range=month")
    );
    expect(oldSessBlocked.status).toBe(401);

    activeSessionToken = refreshedToken;
    const newSessAllowed = await getDashboard(
      new Request("http://localhost/api/dashboard?range=month")
    );
    expect(newSessAllowed.status).toBe(200);
  });

  it("Scenario 34: One-time notification MARK_IDS_READ & non-admin batch price/product edit approval flow", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Batch Edit",
        username: "owner_batch34",
        email: "owner34@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Approval Harga",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();

    activeSessionToken = ownerToken;
    const cat = await prisma.category.create({
      data: { roomId: ownerJson.room.id, name: "Minuman", areaType: "TERBUKA" },
    });

    // Owner seeds 2 existing products
    const p1Res = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "MNM-01",
        name: "Es Kopi Susu",
        categoryId: cat.id,
        stockMethod: "TETAP",
        purchaseUnit: "cup",
        sellUnit: "cup",
        conversionRatio: 1,
        costPrice: 8000,
        sellPrice: 18000,
        currentStock: 10,
      })
    );
    expect(p1Res.status).toBe(201);
    const prod1 = (await p1Res.json()).product;

    const p2Res = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "MNM-02",
        name: "Matcha Latte",
        categoryId: cat.id,
        stockMethod: "TETAP",
        purchaseUnit: "cup",
        sellUnit: "cup",
        conversionRatio: 1,
        costPrice: 10000,
        sellPrice: 22000,
        currentStock: 15,
      })
    );
    expect(p2Res.status).toBe(201);
    const prod2 = (await p2Res.json()).product;

    // Invite Gudang & Kasir users
    const [invGudang, invKasir] = await Promise.all([
      (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "GUDANG",
          })
        )
      ).json(),
      (
        await createInvitation(
          jsonReq("http://localhost/api/invitations", "POST", {
            inviteType: "CODE",
            assignedRole: "KASIR",
          })
        )
      ).json(),
    ]);

    const gudangRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Staf Gudang 34",
        username: "gudang34",
        email: "gudang34@toko.id",
        password: "PasswordAman123",
        inviteCode: invGudang.inviteCode,
      })
    );
    expect(gudangRes.status).toBe(201);
    const gudangToken = extractSessionToken(gudangRes)!;

    const kasirRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "JOIN_ROOM",
        name: "Kasir 34",
        username: "kasir34",
        email: "kasir34@toko.id",
        password: "PasswordAman123",
        inviteCode: invKasir.inviteCode,
      })
    );
    expect(kasirRes.status).toBe(201);
    const kasirToken = extractSessionToken(kasirRes)!;

    // 1. One-time MARK_IDS_READ scoping & selective dismiss
    const [notifA, notifB, notifOwnerOnly] = await Promise.all([
      prisma.notification.create({
        data: {
          roomId: ownerJson.room.id,
          title: "Notif Terlihat A",
          message: "Pesan A",
          severity: "INFO",
          category: "KATALOG",
          linkUrl: "/produk",
        },
      }),
      prisma.notification.create({
        data: {
          roomId: ownerJson.room.id,
          title: "Notif Terlihat B",
          message: "Pesan B",
          severity: "INFO",
          category: "KATALOG",
          linkUrl: "/produk",
        },
      }),
      prisma.notification.create({
        data: {
          roomId: ownerJson.room.id,
          title: "Notif Khusus Pemilik",
          message: "Pesan Rahasia",
          severity: "CRITICAL",
          category: "SHIFT",
          targetRole: "PEMILIK",
          linkUrl: "/laporan",
        },
      }),
    ]);

    activeSessionToken = kasirToken;
    const kasirDismissRes = await postAudit(
      jsonReq("http://localhost/api/audit", "POST", {
        action: "MARK_IDS_READ",
        notificationIds: [notifOwnerOnly.id],
      })
    );
    expect(kasirDismissRes.status).toBe(200);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notifOwnerOnly.id } })).isRead
    ).toBe(false);

    activeSessionToken = ownerToken;
    const ownerDismissRes = await postAudit(
      jsonReq("http://localhost/api/audit", "POST", {
        action: "MARK_IDS_READ",
        notificationIds: [notifA.id],
      })
    );
    expect(ownerDismissRes.status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notifA.id } })).isRead).toBe(
      true
    );
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notifB.id } })).isRead).toBe(
      false
    );

    // 2. Non-admin PUT /api/products cannot change price directly -> creates pending request (202)
    activeSessionToken = gudangToken;
    const directPutRes = await updateProduct(
      jsonReq("http://localhost/api/products", "PUT", {
        id: prod1.id,
        sku: prod1.sku,
        name: prod1.name,
        categoryId: cat.id,
        stockMethod: "TETAP",
        purchaseUnit: "cup",
        sellUnit: "cup",
        conversionRatio: 1,
        costPrice: 8000,
        sellPrice: 99000,
        currentStock: 10,
      })
    );
    expect(directPutRes.status).toBe(202);
    const directPutJson = await directPutRes.json();
    expect(directPutJson.mode).toBe("REQUEST");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(
      18000
    );

    // Reject single edit request -> keeps catalog unchanged & clears pending queue for prod1
    activeSessionToken = ownerToken;
    const rejectSingleRes = await reviewProductRequest(
      jsonReq(`http://localhost/api/product-requests/${directPutJson.productRequest.id}/review`, "POST", {
        decision: "DITOLAK",
        rejectionReason: "Harga terlalu tinggi",
      }),
      { params: Promise.resolve({ id: directPutJson.productRequest.id }) }
    );
    expect(rejectSingleRes.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(
      18000
    );

    // 3. Employee queues multiple edits + 1 new item together in a single batch
    activeSessionToken = gudangToken;
    const batchRes = await submitProductRequestBatch(
      jsonReq("http://localhost/api/product-requests", "POST", {
        batchTitle: "Update Harga Menu & Tambah Thai Tea",
        items: [
          {
            clientTempId: "edit-p1",
            targetProductId: prod1.id,
            sku: prod1.sku,
            name: prod1.name,
            categoryId: cat.id,
            stockMethod: "TETAP",
            isRawMaterial: false,
            purchaseUnit: "cup",
            sellUnit: "cup",
            conversionRatio: 1,
            costPrice: 8500,
            sellPrice: 20000,
            currentStock: 10,
          },
          {
            clientTempId: "edit-p2",
            targetProductId: prod2.id,
            sku: prod2.sku,
            name: "Matcha Latte Premium",
            categoryId: cat.id,
            stockMethod: "TETAP",
            isRawMaterial: false,
            purchaseUnit: "cup",
            sellUnit: "cup",
            conversionRatio: 1,
            costPrice: 11000,
            sellPrice: 25000,
            currentStock: 15,
          },
          {
            clientTempId: "new-p3",
            sku: "MNM-03",
            name: "Thai Tea",
            categoryId: cat.id,
            stockMethod: "TETAP",
            isRawMaterial: false,
            purchaseUnit: "cup",
            sellUnit: "cup",
            conversionRatio: 1,
            costPrice: 7000,
            sellPrice: 16000,
            currentStock: 12,
          },
        ],
      })
    );
    expect(batchRes.status).toBe(202);
    const batchJson = await batchRes.json();
    expect(batchJson.mode).toBe("REQUEST_BATCH");
    expect(batchJson.requests).toHaveLength(3);

    // Prices must still be unchanged while awaiting approval
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(
      18000
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prod2.id } })).sellPrice).toBe(
      22000
    );

    // Simulate concurrent POS sale reducing prod1 stock 10 -> 8 before Manager approves
    await prisma.product.update({ where: { id: prod1.id }, data: { currentStock: 8 } });

    // Owner approves whole batch at once
    activeSessionToken = ownerToken;
    const batchApproveRes = await reviewProductBatch(
      jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
        batchId: batchJson.batchId,
        decision: "DISETUJUI",
      })
    );
    expect(batchApproveRes.status).toBe(200);
    const batchApproveJson = await batchApproveRes.json();
    expect(batchApproveJson.processedCount).toBe(3);

    const updatedP1 = await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } });
    const updatedP2 = await prisma.product.findUniqueOrThrow({ where: { id: prod2.id } });
    const createdP3 = await prisma.product.findFirstOrThrow({
      where: { roomId: ownerJson.room.id, sku: "MNM-03" },
    });

    expect(updatedP1.costPrice).toBe(8500);
    expect(updatedP1.sellPrice).toBe(20000);
    // Unmodified stock in request does NOT overwrite concurrent POS stock changes
    expect(updatedP1.currentStock).toBe(8);
    expect(updatedP2.name).toBe("Matcha Latte Premium");
    expect(updatedP2.costPrice).toBe(11000);
    expect(updatedP2.sellPrice).toBe(25000);
    expect(createdP3.sellPrice).toBe(16000);
    expect(createdP3.currentStock).toBe(12);
  });
});
