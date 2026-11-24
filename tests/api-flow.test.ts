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
import { POST as registerUser } from "../src/app/api/auth/register/route";
import { GET as getProfit } from "../src/app/api/profit/route";
import { GET as getDashboard } from "../src/app/api/dashboard/route";
import { GET as getReports } from "../src/app/api/reports/route";
import {
  POST as createProduct,
  GET as listProducts,
  DELETE as deleteProduct,
} from "../src/app/api/products/route";
import {
  GET as listProductRequests,
  POST as submitProductRequestBatch,
} from "../src/app/api/product-requests/route";
import { POST as reviewProductRequest } from "../src/app/api/product-requests/[id]/review/route";
import { POST as reviewProductBatch } from "../src/app/api/product-requests/batch-review/route";
import { POST as analyzeProductBatch } from "../src/app/api/product-requests/analyze/route";
import { GET as listSales, POST as createSale } from "../src/app/api/sales/route";
import { POST as handleSaleAmendment } from "../src/app/api/sales/amendments/route";
import { GET as getShifts, POST as postShift } from "../src/app/api/shifts/route";
import { GET as getPurchases } from "../src/app/api/purchases/route";
import { GET as getInventory } from "../src/app/api/inventory/route";
import { POST as createInvitation } from "../src/app/api/invitations/route";
import { DELETE as revokeInvitation } from "../src/app/api/invitations/[id]/route";
import { GET as verifyInvitation } from "../src/app/api/invitations/verify/route";
import { PATCH as updateUserRole } from "../src/app/api/users/[id]/role/route";
import { PATCH as revokeUserAccess } from "../src/app/api/users/[id]/revoke/route";
import { POST as postSettings } from "../src/app/api/settings/route";

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
    const shiftGetBefore = await getShifts();
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

    const shiftGetAfter = await (await getShifts()).json();
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

    // Kasir dilarang mengirim keranjang pengajuan barang (403)
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

    // Gudang mengirim 1 paket berisi Bahan Baku + Produk Jual + Resep (memakai clientTempId bahan baku di keranjang) + Nota Fisik
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

    const approveBatchRes = await reviewProductBatch(
      jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
        batchId,
        decision: "DISETUJUI",
      })
    );
    expect(approveBatchRes.status).toBe(200);
    const approveBatchJson = await approveBatchRes.json();
    expect(approveBatchJson.processedCount).toBe(3);

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
  });
});
