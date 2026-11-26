import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
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
import { createPasswordResetToken, hashPassword } from "../src/lib/auth";
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
import { GET as getPurchaseReceiptById } from "../src/app/api/purchases/[id]/receipt/route";
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
import { GET as getSettings, POST as postSettings } from "../src/app/api/settings/route";
import { GET as getManualBackup } from "../src/app/api/backup/route";
import { GET as runCronBackup } from "../src/app/api/cron/backup/route";
import { enforceBackupRetention } from "../src/lib/backup";
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

async function openShiftForActiveUser(counterId?: string) {
  const res = await postShift(
    jsonReq("http://localhost/api/shifts", "POST", {
      action: "OPEN",
      ...(counterId ? { counterId } : {}),
      denominations: { "50000": 2 },
      readyConfirmed: true,
    })
  );
  expect(res.status).toBe(201);
  return res.json();
}

async function seedOwnerRoom(opts: {
  name: string;
  username: string;
  email?: string;
  roomName: string;
  roomAddress?: string;
  counterNames?: string[];
}) {
  const res = await registerUser(
    jsonReq("http://localhost/api/auth/register", "POST", {
      mode: "CREATE_ROOM",
      name: opts.name,
      username: opts.username,
      ...(opts.email ? { email: opts.email } : {}),
      password: "PasswordAman123",
      roomName: opts.roomName,
      ...(opts.roomAddress ? { roomAddress: opts.roomAddress } : {}),
      ...(opts.counterNames ? { counterNames: opts.counterNames } : {}),
    })
  );
  expect(res.status).toBe(201);
  const json = await res.json();
  const token = extractSessionToken(res)!;
  const roomId = json.user.roomId as string;
  const [category, warehouse] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { roomId } }),
    prisma.warehouse.findFirstOrThrow({ where: { roomId } }),
  ]);
  return { res, json, token, roomId, user: json.user, room: json.room, category, warehouse };
}

async function seedInvitedMember(
  ownerToken: string,
  opts: {
    name: string;
    username: string;
    email?: string;
    role: "MANAJER" | "KASIR" | "GUDANG" | "KASIR_GUDANG";
  }
) {
  const prevToken = activeSessionToken;
  activeSessionToken = ownerToken;
  const invRes = await createInvitation(
    jsonReq("http://localhost/api/invitations", "POST", {
      inviteType: "CODE",
      assignedRole: opts.role,
    })
  );
  expect(invRes.status).toBe(201);
  const inviteCode = (await invRes.json()).inviteCode as string;

  const joinRes = await registerUser(
    jsonReq("http://localhost/api/auth/register", "POST", {
      mode: "JOIN_ROOM",
      name: opts.name,
      username: opts.username,
      ...(opts.email ? { email: opts.email } : {}),
      password: "PasswordAman123",
      inviteCode,
    })
  );
  expect(joinRes.status).toBe(201);
  const json = await joinRes.json();
  const token = extractSessionToken(joinRes)!;
  activeSessionToken = prevToken;
  return { json, token, user: json.user, inviteCode };
}

async function resetDb() {
  activeSessionToken = null;
  await prisma.rateLimitEntry.deleteMany();
  await prisma.otpChallenge.deleteMany();
  await prisma.backupLog.deleteMany();
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
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();
  await prisma.room.deleteMany();
}

describe("TRASIR 25-Scenario Full-Stack Verification Suite", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("Room Registration, Invitations, RBAC & Multi-Room Isolation (Scenarios 1-9 & 25)", () => {
    let ownerToken: string;
    let ownerUserId: string;
    let roomId: string;

    beforeEach(async () => {
      const owner = await seedOwnerRoom({
        name: "Raka Pemilik",
        username: "raka_owner",
        email: "raka@trasir.id",
        roomName: "Kedai Kopi Nusantara",
        roomAddress: "Jakarta Selatan",
      });
      ownerToken = owner.token;
      ownerUserId = owner.user.id;
      roomId = owner.roomId;
    });

    it("Scenario 1: Creating a new room automatically assigns PEMILIK role and redirects to /dashboard", async () => {
      const fresh = await seedOwnerRoom({
        name: "Owner Baru S1",
        username: "owner_s1",
        email: "owner_s1@trasir.id",
        roomName: "Warung S1",
      });
      expect(fresh.json.user.role).toBe("PEMILIK");
      expect(fresh.json.user.roomId).toBeTruthy();
      expect(fresh.json.room.name).toBe("Warung S1");
      expect(fresh.json.redirectTo).toBe("/dashboard");
    });

    it("Scenario 3: Blocks self-role escalation payloads during CREATE_ROOM and JOIN_ROOM registration", async () => {
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
    });

    it("Scenario 2: Verifies invite codes publicly and rejects joining with a revoked invite", async () => {
      activeSessionToken = ownerToken;
      const invComboRes = await createInvitation(
        jsonReq("http://localhost/api/invitations", "POST", {
          inviteType: "CODE",
          assignedRole: "KASIR_GUDANG",
        })
      );
      expect(invComboRes.status).toBe(201);
      const invComboCode = (await invComboRes.json()).inviteCode as string;

      const verifyRes = await verifyInvitation(
        new Request(`http://localhost/api/invitations/verify?code=${invComboCode}`)
      );
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(verifyJson.valid).toBe(true);
      expect(verifyJson.roomName).toBe("Kedai Kopi Nusantara");
      expect(verifyJson.assignedRole).toBe("KASIR_GUDANG");

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
    });

    it("Scenario 4: Enforces KASIR access boundaries (allows sales, blocks purchases & profit)", async () => {
      const kasir = await seedInvitedMember(ownerToken, {
        name: "Andi Kasir",
        username: "andi_kasir",
        role: "KASIR",
      });
      expect(kasir.user.role).toBe("KASIR");
      expect(kasir.user.roomId).toBe(roomId);

      activeSessionToken = kasir.token;
      expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(200);
      expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(403);
      expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);
    });

    it("Scenario 5: Enforces GUDANG access boundaries (allows purchases/inventory, blocks sales & profit)", async () => {
      const gudang = await seedInvitedMember(ownerToken, {
        name: "Dewi Gudang",
        username: "dewi_gudang",
        role: "GUDANG",
      });
      expect(gudang.user.role).toBe("GUDANG");

      activeSessionToken = gudang.token;
      expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(200);
      expect((await getInventory()).status).toBe(200);
      expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(403);
      expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);
    });

    it("Scenario 6: Grants KASIR_GUDANG exact union of operational access while blocking financials", async () => {
      const combo = await seedInvitedMember(ownerToken, {
        name: "Citra Kombo",
        username: "citra_kombo",
        role: "KASIR_GUDANG",
      });
      expect(combo.user.role).toBe("KASIR_GUDANG");

      activeSessionToken = combo.token;
      expect((await listSales(new Request("http://localhost/api/sales"))).status).toBe(200);
      expect((await getPurchases(new Request("http://localhost/api/purchases"))).status).toBe(200);
      expect((await getInventory()).status).toBe(200);
      expect((await getProfit(new Request("http://localhost/api/profit?period=today"))).status).toBe(403);
    });

    it("Scenarios 7-9: Allows MANAJER to manage non-Pemilik staff while protecting PEMILIK role & preventing last-owner lockout", async () => {
      const [kasir, gudang, mgr] = await Promise.all([
        seedInvitedMember(ownerToken, { name: "Andi Kasir", username: "andi_k7", role: "KASIR" }),
        seedInvitedMember(ownerToken, { name: "Dewi Gudang", username: "dewi_g7", role: "GUDANG" }),
        seedInvitedMember(ownerToken, { name: "Siti Manajer", username: "siti_m7", role: "MANAJER" }),
      ]);

      // Scenario 7: Manajer boleh ubah role non-Pemilik
      activeSessionToken = mgr.token;
      const changeKasirRes = await updateUserRole(
        jsonReq(`http://localhost/api/users/${kasir.user.id}/role`, "PATCH", {
          role: "KASIR_GUDANG",
        }),
        { params: Promise.resolve({ id: kasir.user.id }) }
      );
      expect(changeKasirRes.status).toBe(200);
      expect((await changeKasirRes.json()).user.role).toBe("KASIR_GUDANG");

      // Scenario 8: Manajer dilarang menurunkan/mencabut/menonaktifkan Pemilik
      expect(
        (
          await updateUserRole(
            jsonReq(`http://localhost/api/users/${ownerUserId}/role`, "PATCH", { role: "KASIR" }),
            { params: Promise.resolve({ id: ownerUserId }) }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await revokeUserAccess(
            jsonReq(`http://localhost/api/users/${ownerUserId}/revoke`, "PATCH", {}),
            { params: Promise.resolve({ id: ownerUserId }) }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await postSettings(
            jsonReq("http://localhost/api/settings", "POST", {
              action: "UPDATE_USER",
              userId: ownerUserId,
              isActive: false,
            })
          )
        ).status
      ).toBe(403);

      // Scenario 9: Manajer dilarang mengangkat/mengundang role PEMILIK
      expect(
        (
          await updateUserRole(
            jsonReq(`http://localhost/api/users/${gudang.user.id}/role`, "PATCH", {
              role: "PEMILIK",
            }),
            { params: Promise.resolve({ id: gudang.user.id }) }
          )
        ).status
      ).toBe(403);

      expect(
        (
          await createInvitation(
            jsonReq("http://localhost/api/invitations", "POST", {
              inviteType: "CODE",
              assignedRole: "PEMILIK",
            })
          )
        ).status
      ).toBe(403);

      // Anti-lockout: Pemilik tunggal tidak boleh diturunkan
      activeSessionToken = ownerToken;
      expect(
        (
          await updateUserRole(
            jsonReq(`http://localhost/api/users/${ownerUserId}/role`, "PATCH", { role: "MANAJER" }),
            { params: Promise.resolve({ id: ownerUserId }) }
          )
        ).status
      ).toBe(400);
    });

    it("Scenario 25: Enforces multi-room tenant isolation so another room's owner gets 404", async () => {
      const kasir = await seedInvitedMember(ownerToken, {
        name: "Andi Kasir Iso",
        username: "andi_iso25",
        role: "KASIR",
      });
      const roomB = await seedOwnerRoom({
        name: "Pemilik Ruangan B",
        username: "owner_room_b",
        roomName: "Toko Sebelah B",
      });

      activeSessionToken = roomB.token;
      const crossRoomRoleChange = await updateUserRole(
        jsonReq(`http://localhost/api/users/${kasir.user.id}/role`, "PATCH", { role: "GUDANG" }),
        { params: Promise.resolve({ id: kasir.user.id }) }
      );
      expect(crossRoomRoleChange.status).toBe(404);
    });
  });

  describe("Gross Profit Engine & Product Approval Workflow (Scenarios 10-15)", () => {
    let mgrToken: string;
    let kasirToken: string;
    let gudangToken: string;
    let categoryId: string;

    beforeEach(async () => {
      const owner = await seedOwnerRoom({
        name: "Pemilik Toko",
        username: "owner_gp",
        roomName: "Warung Maju",
      });
      categoryId = owner.category.id;
      const [mgr, kasir, gudang] = await Promise.all([
        seedInvitedMember(owner.token, { name: "Manajer Toko", username: "mgr_gp", role: "MANAJER" }),
        seedInvitedMember(owner.token, { name: "Kasir Toko", username: "kasir_gp", role: "KASIR" }),
        seedInvitedMember(owner.token, { name: "Gudang Toko", username: "gudang_gp", role: "GUDANG" }),
      ]);
      mgrToken = mgr.token;
      kasirToken = kasir.token;
      gudangToken = gudang.token;
    });

    it("Scenario 13: Owner/Manager adds product directly to active catalog (mode DIRECT)", async () => {
      activeSessionToken = mgrToken;
      const res = await createProduct(
        jsonReq("http://localhost/api/products", "POST", {
          sku: "KOPI-001",
          name: "Kopi Hitam Sachet",
          categoryId,
          stockMethod: "TETAP",
          purchaseUnit: "pcs",
          sellUnit: "pcs",
          conversionRatio: 1,
          costPrice: 10000,
          sellPrice: 18000,
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.mode).toBe("DIRECT");
      expect(json.product.sku).toBe("KOPI-001");
    });

    it("Scenarios 12, 14 & 15: Enforces Kasir/Gudang duty separation and routes staff product submissions through approval queue", async () => {
      activeSessionToken = mgrToken;
      const seededProd = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "BASE-01",
              name: "Produk Dasar",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 5000,
              sellPrice: 10000,
              currentStock: 10,
            })
          )
        ).json()
      ).product;

      // Kasir dilarang tambah produk (403); Gudang dilarang transaksi kasir (403)
      activeSessionToken = kasirToken;
      expect(
        (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "KSR-BLK-01",
              name: "Produk Ditolak Kasir",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 5000,
              sellPrice: 10000,
            })
          )
        ).status
      ).toBe(403);

      activeSessionToken = gudangToken;
      expect(
        (
          await createSale(
            jsonReq("http://localhost/api/sales", "POST", {
              paymentMethod: "TUNAI",
              items: [{ productId: seededProd.id, quantity: 1 }],
            })
          )
        ).status
      ).toBe(403);

      // Tampering status DISETUJUI ditolak (403)
      expect(
        (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "HACK-01",
              name: "Produk Manipulasi",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 5000,
              sellPrice: 10000,
              status: "DISETUJUI",
            })
          )
        ).status
      ).toBe(403);

      // Gudang mengajukan 2 produk -> masuk antrean MENUNGGU_PERSETUJUAN (202)
      const empReq1Res = await createProduct(
        jsonReq("http://localhost/api/products", "POST", {
          sku: "TEH-001",
          name: "Teh Tarik Botol",
          categoryId,
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
          categoryId,
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

      const catalogBefore = await (await listProducts()).json();
      expect(catalogBefore.products.some((p: { sku: string }) => p.sku === "TEH-001")).toBe(false);

      // Pegawai tidak boleh menyetujui pengajuannya sendiri (403)
      expect(
        (
          await reviewProductRequest(
            jsonReq(`http://localhost/api/product-requests/${empReq1Json.productRequest.id}/review`, "POST", {
              decision: "DISETUJUI",
            }),
            { params: Promise.resolve({ id: empReq1Json.productRequest.id }) }
          )
        ).status
      ).toBe(403);

      // Manajer menyetujui item 1 & menolak item 2
      activeSessionToken = mgrToken;
      expect((await (await listProductRequests(new Request("http://localhost/api/product-requests"))).json()).pendingCount).toBe(2);

      const approveReq1 = await reviewProductRequest(
        jsonReq(`http://localhost/api/product-requests/${empReq1Json.productRequest.id}/review`, "POST", {
          decision: "DISETUJUI",
        }),
        { params: Promise.resolve({ id: empReq1Json.productRequest.id }) }
      );
      expect(approveReq1.status).toBe(200);
      expect((await approveReq1.json()).product.sku).toBe("TEH-001");

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
    });

    it("Scenario 10: Computes gross profit from historical HPP snapshot and flags incomplete cost products", async () => {
      activeSessionToken = mgrToken;
      const productA = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "KOPI-HPP-01",
              name: "Kopi Hitam Sachet",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 10000,
              sellPrice: 18000,
              currentStock: 50,
            })
          )
        ).json()
      ).product;

      const productZeroCost = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "SNACK-000",
              name: "Keripik Tanpa Modal",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 0,
              sellPrice: 12000,
              currentStock: 20,
            })
          )
        ).json()
      ).product;

      activeSessionToken = kasirToken;
      await openShiftForActiveUser();
      const saleRes = await createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "TUNAI",
          discountAmount: 4000,
          cashReceived: 50000,
          items: [{ productId: productA.id, quantity: 3 }],
        })
      );
      expect(saleRes.status).toBe(200);

      // Ubah HPP master setelah transaksi -> transaksi lama tetap memakai HPP historis 10.000
      await prisma.product.update({ where: { id: productA.id }, data: { costPrice: 15000 } });

      activeSessionToken = mgrToken;
      const profitTodayRes = await getProfit(new Request("http://localhost/api/profit?period=today"));
      expect(profitTodayRes.status).toBe(200);
      const profitToday = await profitTodayRes.json();
      expect(profitToday.timezone).toBe("Asia/Jakarta");
      expect(profitToday.metrics.netSalesRevenue).toBe(50000);
      expect(profitToday.metrics.totalDiscounts).toBe(4000);
      expect(profitToday.metrics.totalCogs).toBe(30000);
      expect(profitToday.metrics.grossProfit).toBe(20000);
      expect(profitToday.metrics.grossMarginPct).toBe(40);
      expect(profitToday.dataQuality.isCalculationComplete).toBe(true);

      const dashMgr = await (await getDashboard(new Request("http://localhost/api/dashboard?range=week"))).json();
      expect(dashMgr.profit.metrics.grossProfit).toBe(20000);
      expect(dashMgr.anomalies).not.toHaveProperty("discrepantShifts");

      // Jual produk tanpa HPP -> muncul peringatan data harga modal tidak lengkap
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
    });

    it("Scenario 11: Blocks KASIR from financial profit, dashboard, and reports APIs (403)", async () => {
      activeSessionToken = kasirToken;
      expect((await getProfit(new Request("http://localhost/api/profit?period=month"))).status).toBe(403);
      expect((await getDashboard(new Request("http://localhost/api/dashboard?range=month"))).status).toBe(403);
      expect((await getReports(new Request("http://localhost/api/reports?period=monthly"))).status).toBe(403);
    });
  });

  describe("Transaction Cancellation Approval & Legacy Shift Closing (Scenarios 16-24)", () => {
    let ownerToken: string;
    let mgrToken: string;
    let kasirToken: string;
    let prodId: string;
    let sale1Id: string;
    let sale2Id: string;

    beforeEach(async () => {
      const owner = await seedOwnerRoom({
        name: "Pemilik Resto",
        username: "owner_tx",
        roomName: "Resto Transparan",
      });
      ownerToken = owner.token;
      const [mgr, kasir] = await Promise.all([
        seedInvitedMember(owner.token, { name: "Manajer Resto", username: "mgr_tx", role: "MANAJER" }),
        seedInvitedMember(owner.token, { name: "Kasir Resto", username: "kasir_tx", role: "KASIR" }),
      ]);
      mgrToken = mgr.token;
      kasirToken = kasir.token;

      const prod = await prisma.product.create({
        data: {
          roomId: owner.roomId,
          sku: "NASI-01",
          name: "Nasi Goreng Spesial",
          categoryId: owner.category.id,
          stockMethod: "TETAP",
          purchaseUnit: "porsi",
          sellUnit: "porsi",
          conversionRatio: 1,
          costPrice: 12000,
          sellPrice: 25000,
          currentStock: 20,
        },
      });
      prodId = prod.id;

      activeSessionToken = kasirToken;
      await openShiftForActiveUser();
      sale1Id = (
        await (
          await createSale(
            jsonReq("http://localhost/api/sales", "POST", {
              paymentMethod: "TUNAI",
              cashReceived: 50000,
              items: [{ productId: prodId, quantity: 2 }],
            })
          )
        ).json()
      ).sale.id;
      sale2Id = (
        await (
          await createSale(
            jsonReq("http://localhost/api/sales", "POST", {
              paymentMethod: "QRIS",
              items: [{ productId: prodId, quantity: 2 }],
            })
          )
        ).json()
      ).sale.id;
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prodId } })).currentStock).toBe(16);
    });

    it("Scenario 16: Rejects cancellation requests with blank reason or dangerous HTML attachment MIME", async () => {
      activeSessionToken = kasirToken;
      expect(
        (
          await handleSaleAmendment(
            jsonReq("http://localhost/api/sales/amendments", "POST", {
              action: "REQUEST",
              saleId: sale1Id,
              amendmentType: "PEMBATALAN",
              reason: "   ",
            })
          )
        ).status
      ).toBe(400);

      expect(
        (
          await handleSaleAmendment(
            jsonReq("http://localhost/api/sales/amendments", "POST", {
              action: "REQUEST",
              saleId: sale1Id,
              amendmentType: "PEMBATALAN",
              reason: "Pelanggan membatalkan pesanan",
              proofImageData: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
            })
          )
        ).status
      ).toBe(400);
    });

    it("Scenarios 17, 18, 20 & 21: Holds stock/profit until cancellation approval, restores stock on approval, blocks double-cancel (409), and preserves history", async () => {
      activeSessionToken = kasirToken;
      const reqRes = await handleSaleAmendment(
        jsonReq("http://localhost/api/sales/amendments", "POST", {
          action: "REQUEST",
          saleId: sale1Id,
          amendmentType: "PEMBATALAN",
          reason: "Salah input jumlah pesanan pelanggan",
          proofImageData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        })
      );
      expect(reqRes.status).toBe(201);
      const am1 = (await reqRes.json()).amendment;
      expect(am1.status).toBe("MENUNGGU_PERSETUJUAN");
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prodId } })).currentStock).toBe(16);

      activeSessionToken = mgrToken;
      const profitBefore = await (await getProfit(new Request("http://localhost/api/profit?period=today"))).json();
      expect(profitBefore.metrics.grossProfit).toBe(52000);

      const approveRes = await handleSaleAmendment(
        jsonReq("http://localhost/api/sales/amendments", "POST", {
          action: "REVIEW",
          amendmentId: am1.id,
          decision: "DISETUJUI",
          reviewNotes: "Diverifikasi dengan struk fisik.",
        })
      );
      expect(approveRes.status).toBe(200);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale1Id } })).status).toBe("DIBATALKAN");
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prodId } })).currentStock).toBe(18);

      const profitAfter = await (await getProfit(new Request("http://localhost/api/profit?period=today"))).json();
      expect(profitAfter.metrics.grossProfit).toBe(26000);
      expect(profitAfter.metrics.cancelledSalesCount).toBe(1);

      // Double cancel -> 409
      activeSessionToken = kasirToken;
      expect(
        (
          await handleSaleAmendment(
            jsonReq("http://localhost/api/sales/amendments", "POST", {
              action: "REQUEST",
              saleId: sale1Id,
              amendmentType: "PEMBATALAN",
              reason: "Mencoba pembatalan kedua kali",
            })
          )
        ).status
      ).toBe(409);

      // Riwayat transaksi tetap mempertahankan kedua transaksi (NORMAL & DIBATALKAN)
      const historyJson = await (await listSales(new Request("http://localhost/api/sales"))).json();
      expect(historyJson.sales.length).toBe(2);
      expect(historyJson.sales.some((s: { id: string; status: string }) => s.id === sale1Id && s.status === "DIBATALKAN")).toBe(true);
      expect(historyJson.sales.some((s: { id: string; status: string }) => s.id === sale2Id && s.status === "NORMAL")).toBe(true);
    });

    it("Scenarios 19 & 24: Blocks Manager self-approval (403) and allows Owner to reject with recorded notes", async () => {
      activeSessionToken = mgrToken;
      const mgrReqRes = await handleSaleAmendment(
        jsonReq("http://localhost/api/sales/amendments", "POST", {
          action: "REQUEST",
          saleId: sale2Id,
          amendmentType: "PEMBATALAN",
          reason: "Manajer mengajukan pembatalan untuk diuji",
        })
      );
      expect(mgrReqRes.status).toBe(201);
      const mgrAm = (await mgrReqRes.json()).amendment;

      expect(
        (
          await handleSaleAmendment(
            jsonReq("http://localhost/api/sales/amendments", "POST", {
              action: "REVIEW",
              amendmentId: mgrAm.id,
              decision: "DISETUJUI",
            })
          )
        ).status
      ).toBe(403);

      activeSessionToken = ownerToken;
      const rejectRes = await handleSaleAmendment(
        jsonReq("http://localhost/api/sales/amendments", "POST", {
          action: "REVIEW",
          amendmentId: mgrAm.id,
          decision: "DITOLAK",
          reviewNotes: "Barang sudah dikonsumsi pelanggan.",
        })
      );
      expect(rejectRes.status).toBe(200);
      const rejectJson = await rejectRes.json();
      expect(rejectJson.amendment.status).toBe("DITOLAK");
      expect(rejectJson.amendment.reviewNotes).toBe("Barang sudah dikonsumsi pelanggan.");
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale2Id } })).status).toBe("NORMAL");
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prodId } })).currentStock).toBe(16);
    });

    it("Scenarios 22-23: Preserves legacy shift closing API without exposing discrepancy fields to cashier", async () => {
      activeSessionToken = kasirToken;
      expect((await getShifts(new Request("http://localhost/api/shifts"))).status).toBe(200);

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
      expect(shiftPostJson.closing).not.toHaveProperty("cashDifference");
      expect(shiftPostJson.closing).not.toHaveProperty("digitalDifference");
      expect(shiftPostJson.closing).not.toHaveProperty("totalDifference");

      const shiftGetAfter = await (await getShifts(new Request("http://localhost/api/shifts"))).json();
      expect(shiftGetAfter.closings.length).toBe(1);
      expect(shiftGetAfter.closings[0]).not.toHaveProperty("cashDifference");
      expect(shiftGetAfter.closings[0]).not.toHaveProperty("digitalDifference");
      expect(shiftGetAfter.closings[0]).not.toHaveProperty("totalDifference");
      expect((await prisma.notification.findMany({ where: { category: "SHIFT" } })).length).toBe(0);
    });
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

    await openShiftForActiveUser();
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

  describe("Batch Product Proposal Cart & Optional Receipt AI Flows (Scenario 27)", () => {
    const sampleReceipt = "data:image/png;base64,iVBORw0KGgo=";
    const updatedSampleReceipt = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    let ownerToken: string;
    let kasirToken: string;
    let gudangToken: string;
    let comboToken: string;
    let categoryId: string;

    beforeEach(async () => {
      const owner = await seedOwnerRoom({
        name: "Pemilik Batch",
        username: "owner_batch",
        roomName: "Kopi Paket Batch",
      });
      ownerToken = owner.token;
      categoryId = owner.category.id;
      const [kasir, gudang, combo] = await Promise.all([
        seedInvitedMember(owner.token, { name: "Kasir Murni", username: "kasir_murni", role: "KASIR" }),
        seedInvitedMember(owner.token, { name: "Staf Gudang", username: "staf_gudang", role: "GUDANG" }),
        seedInvitedMember(owner.token, { name: "Kasir Gudang Gabungan", username: "combo_user", role: "KASIR_GUDANG" }),
      ]);
      kasirToken = kasir.token;
      gudangToken = gudang.token;
      comboToken = combo.token;
    });

    it("Scenario 27a: Blocks KASIR from submitting batch product proposals (403)", async () => {
      activeSessionToken = kasirToken;
      const res = await submitProductRequestBatch(
        jsonReq("http://localhost/api/product-requests", "POST", {
          items: [
            {
              sku: "BLK-01",
              name: "Tidak Boleh",
              categoryId,
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
      expect(res.status).toBe(403);
    });

    it("Scenario 27b: Gudang submits linked material/recipe batch with receipt, replaces receipt while pending, Owner runs AI & approves resolving real materialId, and locks receipt post-approval", async () => {
      activeSessionToken = gudangToken;
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
              categoryId,
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
              categoryId,
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
              categoryId,
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

      // Gudang dilarang menjalankan AI scan atau batch review (403)
      expect((await analyzeProductBatch(jsonReq("http://localhost/api/product-requests/analyze", "POST", { batchId }))).status).toBe(403);
      expect((await reviewProductBatch(jsonReq("http://localhost/api/product-requests/batch-review", "POST", { batchId, decision: "DISETUJUI" }))).status).toBe(403);

      // Pemilik memindai nota secara opsional dengan AI
      activeSessionToken = ownerToken;
      const analyzeRes = await analyzeProductBatch(
        jsonReq("http://localhost/api/product-requests/analyze", "POST", { batchId })
      );
      expect(analyzeRes.status).toBe(200);
      const analyzeJson = await analyzeRes.json();
      expect(analyzeJson.analysis.items).toHaveLength(3);
      expect(analyzeJson.analysis.items[2].matchStatus).toBe("RESEP_NON_NOTA");

      // Gudang mengganti foto nota saat masih menunggu persetujuan -> mereset AI lama; Kasir diblokir (403)
      activeSessionToken = gudangToken;
      const replaceRes = await updateProductRequestReceipt(
        jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
          batchId,
          receiptImageData: updatedSampleReceipt,
          receiptSource: "DIGITAL",
        })
      );
      expect(replaceRes.status).toBe(200);
      const replaceJson = await replaceRes.json();
      expect(replaceJson.receiptImageData).toBe(updatedSampleReceipt);
      expect(replaceJson.receiptSource).toBe("DIGITAL");
      expect(replaceJson.aiScanResult).toBeNull();

      activeSessionToken = kasirToken;
      expect(
        (
          await updateProductRequestReceipt(
            jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
              batchId,
              receiptImageData: sampleReceipt,
              receiptSource: "FISIK",
            })
          )
        ).status
      ).toBe(403);

      // Pemilik menyetujui paket 1 klik -> materialId asli terhubung & nota terkunci
      activeSessionToken = ownerToken;
      const approveRes = await reviewProductBatch(
        jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
          batchId,
          decision: "DISETUJUI",
        })
      );
      expect(approveRes.status).toBe(200);
      expect((await approveRes.json()).processedCount).toBe(3);

      activeSessionToken = gudangToken;
      expect(
        (
          await updateProductRequestReceipt(
            jsonReq("http://localhost/api/product-requests/receipt", "PATCH", {
              batchId,
              receiptImageData: sampleReceipt,
              receiptSource: "FISIK",
            })
          )
        ).status
      ).toBe(400);

      const activeCatalog = await (await listProducts()).json();
      const susuCreated = activeCatalog.products.find((p: { sku: string }) => p.sku === "BHN-SUSU-B1");
      const airCreated = activeCatalog.products.find((p: { sku: string }) => p.sku === "PRD-AIR-B1");
      const recipeCreated = activeCatalog.products.find((p: { sku: string }) => p.sku === "MNU-SUSU-B1");
      expect(susuCreated.currentStock).toBe(1000);
      expect(airCreated.currentStock).toBe(24);
      expect(recipeCreated.costPrice).toBe(2000);
      expect(recipeCreated.variants[0].ingredients[0].materialId).toBe(susuCreated.id);
    });

    it("Scenario 27c: KASIR_GUDANG runs POS checkout and submits batch product proposals (with Owner rejection)", async () => {
      activeSessionToken = ownerToken;
      const prod = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "COMBO-SALE-01",
              name: "Es Susu Kombo",
              categoryId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 5000,
              sellPrice: 15000,
              currentStock: 10,
            })
          )
        ).json()
      ).product;

      activeSessionToken = comboToken;
      await openShiftForActiveUser();
      const comboSale = await createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "TUNAI",
          items: [{ productId: prod.id, quantity: 1 }],
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
              categoryId,
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

    it("Scenario 27d: Optional-receipt purchases, admin on-demand AI analysis, receipt replacement, and post-approval lock", async () => {
      activeSessionToken = gudangToken;
      const noReceiptRes = await createPurchase(
        jsonReq("http://localhost/api/purchases", "POST", {
          invoiceNumber: "INV-OPT-001",
          supplierName: "Agen Tanpa Nota",
          purchaseDate: "2026-11-25",
          fundingSource: "DANA_TOKO",
          captureMethod: "TANPA_NOTA",
          receiptImageData: null,
          totalAmount: 50000,
          items: [{ itemName: "Gula Pasir 1kg", quantity: 5, unit: "kg", unitCost: 10000, subtotal: 50000 }],
        })
      );
      expect(noReceiptRes.status).toBe(200);
      const noReceiptJson = await noReceiptRes.json();
      expect(noReceiptJson.purchase.aiValidationStatus).toBe("TANPA_NOTA");
      expect(noReceiptJson.purchase.captureMethod).toBe("TANPA_NOTA");
      expect(noReceiptJson.purchase.receiptImageData).toBe("");
      expect(noReceiptJson.purchase.aiAnalysisJson).toBeNull();

      const withReceiptRes = await createPurchase(
        jsonReq("http://localhost/api/purchases", "POST", {
          invoiceNumber: "INV-OPT-002",
          supplierName: "Agen Dengan Nota",
          purchaseDate: "2026-11-25",
          fundingSource: "DANA_TOKO",
          captureMethod: "DIGITAL_UPLOAD",
          receiptImageData: sampleReceipt,
          totalAmount: 100000,
          items: [{ itemName: "Minyak Goreng 2L", quantity: 4, unit: "pcs", unitCost: 25000, subtotal: 100000 }],
        })
      );
      expect(withReceiptRes.status).toBe(200);
      const withReceiptJson = await withReceiptRes.json();
      expect(withReceiptJson.purchase.aiValidationStatus).toBe("BELUM_DICEK");
      expect(withReceiptJson.purchase.aiAnalysisJson).toBeNull();
      const withReceiptId = withReceiptJson.purchase.id as string;

      // GUDANG dilarang menjalankan cek AI (403); PEMILIK menjalankan AI on-demand
      expect((await analyzePurchase(jsonReq("http://localhost/api/purchases/analyze", "POST", { purchaseId: withReceiptId }))).status).toBe(403);

      activeSessionToken = ownerToken;
      const ownerAnalyzeRes = await analyzePurchase(
        jsonReq("http://localhost/api/purchases/analyze", "POST", { purchaseId: withReceiptId })
      );
      expect(ownerAnalyzeRes.status).toBe(200);
      const ownerAnalyzeJson = await ownerAnalyzeRes.json();
      expect(ownerAnalyzeJson.analysis.disclaimer).toBe(NEUTRAL_AI_DISCLAIMER);

      const updatedPurchaseRow = await prisma.purchase.findUniqueOrThrow({ where: { id: withReceiptId } });
      expect(updatedPurchaseRow.aiValidationStatus).toBe(ownerAnalyzeJson.analysis.status);
      expect(updatedPurchaseRow.aiAnalysisJson).toBeTruthy();

      // Pengaju (GUDANG) boleh ganti nota sebelum disetujui -> reset AI; KASIR diblokir (403)
      activeSessionToken = gudangToken;
      const replaceRes = await updatePurchaseReceipt(
        jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
          purchaseId: withReceiptId,
          receiptImageData: updatedSampleReceipt,
          captureMethod: "LIVE_CAMERA",
        })
      );
      expect(replaceRes.status).toBe(200);
      const replaceJson = await replaceRes.json();
      expect(replaceJson.purchase.receiptImageData).toBe(updatedSampleReceipt);
      expect(replaceJson.purchase.captureMethod).toBe("LIVE_CAMERA");
      expect(replaceJson.purchase.aiValidationStatus).toBe("BELUM_DICEK");
      expect(replaceJson.purchase.aiAnalysisJson).toBeNull();

      activeSessionToken = kasirToken;
      expect(
        (
          await updatePurchaseReceipt(
            jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
              purchaseId: withReceiptId,
              receiptImageData: sampleReceipt,
              captureMethod: "DIGITAL_UPLOAD",
            })
          )
        ).status
      ).toBe(403);

      // Setelah disetujui, nota terkunci (400)
      activeSessionToken = ownerToken;
      expect(
        (
          await reviewPurchase(
            jsonReq("http://localhost/api/purchases/review", "POST", {
              purchaseId: withReceiptId,
              decision: "DISETUJUI",
            })
          )
        ).status
      ).toBe(200);

      activeSessionToken = gudangToken;
      expect(
        (
          await updatePurchaseReceipt(
            jsonReq("http://localhost/api/purchases/receipt", "PATCH", {
              purchaseId: withReceiptId,
              receiptImageData: sampleReceipt,
              captureMethod: "DIGITAL_UPLOAD",
            })
          )
        ).status
      ).toBe(400);
    });
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

  describe("Security Hardening & Cross-Tenant Isolation (Scenario 33)", () => {
    let ownerAToken: string;
    let ownerARoomId: string;
    let catAId: string;
    let kasirAToken: string;
    let matBId: string;
    let whBId: string;
    let ownProdId: string;

    beforeEach(async () => {
      const ownerA = await seedOwnerRoom({
        name: "Owner Alpha",
        username: "owner_alpha33",
        email: "alpha33@toko.id",
        roomName: "Toko Alpha 33",
      });
      ownerAToken = ownerA.token;
      ownerARoomId = ownerA.roomId;
      catAId = ownerA.category.id;

      const kasirA = await seedInvitedMember(ownerAToken, {
        name: "Kasir Alpha",
        username: "kasir_alpha33",
        email: "kasir33@toko.id",
        role: "KASIR",
      });
      kasirAToken = kasirA.token;

      const ownerB = await seedOwnerRoom({
        name: "Owner Beta",
        username: "owner_beta33",
        email: "beta33@toko.id",
        roomName: "Toko Beta 33",
      });
      whBId = ownerB.warehouse.id;

      activeSessionToken = ownerB.token;
      matBId = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "BHN-BETA-33",
              name: "Bahan Rahasia Beta",
              categoryId: ownerB.category.id,
              stockMethod: "TETAP",
              isRawMaterial: true,
              purchaseUnit: "kg",
              sellUnit: "kg",
              conversionRatio: 1,
              costPrice: 10000,
              sellPrice: 0,
              currentStock: 50,
            })
          )
        ).json()
      ).product.id;

      activeSessionToken = ownerAToken;
      ownProdId = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "PRD-OWN-33",
              name: "Produk Lokal Alpha",
              categoryId: catAId,
              stockMethod: "TETAP",
              purchaseUnit: "pcs",
              sellUnit: "pcs",
              conversionRatio: 1,
              costPrice: 5000,
              sellPrice: 10000,
              currentStock: 10,
            })
          )
        ).json()
      ).product.id;
    });

    it("Scenario 33a: Blocks cross-tenant recipe ingredient IDOR on POST & PUT /api/products (409)", async () => {
      activeSessionToken = ownerAToken;
      const crossPost = await createProduct(
        jsonReq("http://localhost/api/products", "POST", {
          sku: "MNU-IDOR-33",
          name: "Menu IDOR",
          categoryId: catAId,
          stockMethod: "RESEP",
          purchaseUnit: "pcs",
          sellUnit: "pcs",
          conversionRatio: 1,
          costPrice: 0,
          sellPrice: 15000,
          variants: [
            { name: "Regular", sellPrice: 15000, ingredients: [{ materialId: matBId, quantity: 1, unit: "kg" }] },
          ],
        })
      );
      expect(crossPost.status).toBe(409);

      const crossPut = await updateProduct(
        jsonReq("http://localhost/api/products", "PUT", {
          id: ownProdId,
          sku: "PRD-OWN-33",
          name: "Produk Lokal Alpha",
          categoryId: catAId,
          stockMethod: "RESEP",
          purchaseUnit: "pcs",
          sellUnit: "pcs",
          conversionRatio: 1,
          costPrice: 0,
          sellPrice: 12000,
          variants: [
            { name: "Regular", sellPrice: 12000, ingredients: [{ materialId: matBId, quantity: 1, unit: "kg" }] },
          ],
        })
      );
      expect(crossPut.status).toBe(409);
    });

    it("Scenario 33b: Blocks spoofed attachment magic bytes & cross-tenant warehouse IDOR on /api/inventory (400)", async () => {
      activeSessionToken = ownerAToken;
      expect(
        (
          await postInventory(
            jsonReq("http://localhost/api/inventory", "POST", {
              action: "REQUEST_ADJUSTMENT",
              productId: ownProdId,
              adjustmentType: "RUSAK",
              quantity: 1,
              reason: "Lampiran HTML menyamar sebagai PNG",
              proofImageData: "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
            })
          )
        ).status
      ).toBe(400);

      expect(
        (
          await postInventory(
            jsonReq("http://localhost/api/inventory", "POST", {
              action: "REQUEST_ADJUSTMENT",
              productId: ownProdId,
              adjustmentType: "PINDAH_GUDANG",
              quantity: 1,
              reason: "Mencoba pindah stok ke gudang ruangan lain",
              proofImageData: "data:image/png;base64,iVBORw0KGgo=",
              toWarehouseId: whBId,
            })
          )
        ).status
      ).toBe(400);

      expect(
        (
          await postInventory(
            jsonReq("http://localhost/api/inventory", "POST", {
              action: "SUBMIT_OPNAME",
              title: "Opname Lintas Ruangan",
              scheduleType: "HARIAN",
              warehouseId: whBId,
              counts: [{ productId: ownProdId, physicalStock: 9 }],
            })
          )
        ).status
      ).toBe(400);
    });

    it("Scenario 33c: Blocks RBAC global tamper, scopes MARK_READ, rejects invalid amendment paymentMethod, and ignores spoofed Host header", async () => {
      activeSessionToken = ownerAToken;
      expect(
        (
          await postSettings(
            jsonReq("http://localhost/api/settings", "POST", {
              action: "UPDATE_PERMISSIONS",
              permissions: [{ role: "KASIR", module: "pembelian", canView: true }],
            })
          )
        ).status
      ).toBe(403);

      const ownerNotif = await prisma.notification.create({
        data: {
          roomId: ownerARoomId,
          title: "Alert Rahasia Pemilik",
          message: "Khusus pemilik",
          severity: "CRITICAL",
          category: "SHIFT",
          targetRole: "PEMILIK",
          linkUrl: "/laporan",
        },
      });
      activeSessionToken = kasirAToken;
      expect(
        (
          await postAudit(
            jsonReq("http://localhost/api/audit", "POST", {
              action: "MARK_READ",
              notificationId: ownerNotif.id,
            })
          )
        ).status
      ).toBe(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: ownerNotif.id } })).isRead).toBe(false);

      await openShiftForActiveUser();
      const sale = (
        await (
          await createSale(
            jsonReq("http://localhost/api/sales", "POST", {
              paymentMethod: "TUNAI",
              items: [{ productId: ownProdId, quantity: 1 }],
            })
          )
        ).json()
      ).sale;
      expect(
        (
          await handleSaleAmendment(
            jsonReq("http://localhost/api/sales/amendments", "POST", {
              action: "REQUEST",
              saleId: sale.id,
              amendmentType: "PERUBAHAN",
              reason: "Ubah metode pembayaran tidak valid",
              proposedPayload: JSON.stringify({ paymentMethod: "CRYPTO_FAKE" }),
            })
          )
        ).status
      ).toBe(400);

      const forgotSpoofRes = await forgotPasswordApi(
        new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-host": "attacker.example",
            "x-forwarded-proto": "https",
          },
          body: JSON.stringify({ email: "alpha33@toko.id" }),
        })
      );
      expect(forgotSpoofRes.status).toBe(200);
      const forgotSpoofJson = await forgotSpoofRes.json();
      if (forgotSpoofJson.devPreviewUrl) {
        expect(forgotSpoofJson.devPreviewUrl).not.toContain("attacker.example");
      }
    });

    it("Scenario 33d: Enforces change-email OTP brute-force lockout (5 attempts -> 429) and single-use replay rejection (400)", async () => {
      activeSessionToken = ownerAToken;
      const otpReqJson = await (
        await changeEmailApi(
          jsonReq("http://localhost/api/account/change-email", "POST", {
            action: "REQUEST",
            newEmail: "alpha33-next@toko.id",
            currentPassword: "PasswordAman123",
          })
        )
      ).json();

      const lockReqJson = await (
        await changeEmailApi(
          jsonReq("http://localhost/api/account/change-email", "POST", {
            action: "REQUEST",
            newEmail: "alpha33-lock@toko.id",
            currentPassword: "PasswordAman123",
          })
        )
      ).json();
      const lockBadCode = lockReqJson.devCode === "000000" ? "111111" : "000000";
      for (let i = 0; i < 4; i++) {
        expect(
          (
            await changeEmailApi(
              jsonReq("http://localhost/api/account/change-email", "POST", {
                action: "CONFIRM",
                verificationToken: lockReqJson.verificationToken,
                code: lockBadCode,
              })
            )
          ).status
        ).toBe(400);
      }
      expect(
        (
          await changeEmailApi(
            jsonReq("http://localhost/api/account/change-email", "POST", {
              action: "CONFIRM",
              verificationToken: lockReqJson.verificationToken,
              code: lockBadCode,
            })
          )
        ).status
      ).toBe(429);
      expect(
        (
          await changeEmailApi(
            jsonReq("http://localhost/api/account/change-email", "POST", {
              action: "CONFIRM",
              verificationToken: lockReqJson.verificationToken,
              code: lockReqJson.devCode,
            })
          )
        ).status
      ).toBe(429);

      expect(
        (
          await changeEmailApi(
            jsonReq("http://localhost/api/account/change-email", "POST", {
              action: "CONFIRM",
              verificationToken: otpReqJson.verificationToken,
              code: otpReqJson.devCode,
            })
          )
        ).status
      ).toBe(200);
      expect(
        (
          await changeEmailApi(
            jsonReq("http://localhost/api/account/change-email", "POST", {
              action: "CONFIRM",
              verificationToken: otpReqJson.verificationToken,
              code: otpReqJson.devCode,
            })
          )
        ).status
      ).toBe(400);
    });

    it("Scenario 33e: UPDATE_PROFILE password change bumps tokenVersion and invalidates old session tokens", async () => {
      activeSessionToken = ownerAToken;
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
      expect(refreshedToken).not.toBe(ownerAToken);

      activeSessionToken = ownerAToken;
      expect((await getDashboard(new Request("http://localhost/api/dashboard?range=month"))).status).toBe(401);

      activeSessionToken = refreshedToken;
      expect((await getDashboard(new Request("http://localhost/api/dashboard?range=month"))).status).toBe(200);
    });
  });

  describe("One-Time Notification Read & Batch Price Edit Approval (Scenario 34)", () => {
    let ownerToken: string;
    let roomId: string;
    let catId: string;
    let gudangToken: string;
    let kasirToken: string;
    let prod1: { id: string; sku: string; name: string };
    let prod2: { id: string; sku: string; name: string };

    beforeEach(async () => {
      const owner = await seedOwnerRoom({
        name: "Owner Batch Edit",
        username: "owner_batch34",
        email: "owner34@toko.id",
        roomName: "Toko Approval Harga",
      });
      ownerToken = owner.token;
      roomId = owner.roomId;

      activeSessionToken = ownerToken;
      const cat = await prisma.category.create({
        data: { roomId, name: "Minuman", areaType: "TERBUKA" },
      });
      catId = cat.id;

      prod1 = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "MNM-01",
              name: "Es Kopi Susu",
              categoryId: catId,
              stockMethod: "TETAP",
              purchaseUnit: "cup",
              sellUnit: "cup",
              conversionRatio: 1,
              costPrice: 8000,
              sellPrice: 18000,
              currentStock: 10,
            })
          )
        ).json()
      ).product;

      prod2 = (
        await (
          await createProduct(
            jsonReq("http://localhost/api/products", "POST", {
              sku: "MNM-02",
              name: "Matcha Latte",
              categoryId: catId,
              stockMethod: "TETAP",
              purchaseUnit: "cup",
              sellUnit: "cup",
              conversionRatio: 1,
              costPrice: 10000,
              sellPrice: 22000,
              currentStock: 15,
            })
          )
        ).json()
      ).product;

      const [gudang, kasir] = await Promise.all([
        seedInvitedMember(ownerToken, {
          name: "Staf Gudang 34",
          username: "gudang34",
          email: "gudang34@toko.id",
          role: "GUDANG",
        }),
        seedInvitedMember(ownerToken, {
          name: "Kasir 34",
          username: "kasir34",
          email: "kasir34@toko.id",
          role: "KASIR",
        }),
      ]);
      gudangToken = gudang.token;
      kasirToken = kasir.token;
    });

    it("Scenario 34a: MARK_IDS_READ selectively dismisses scoped notifications and blocks cross-role dismissal", async () => {
      const [notifA, notifB, notifOwnerOnly] = await Promise.all([
        prisma.notification.create({
          data: { roomId, title: "Notif Terlihat A", message: "Pesan A", severity: "INFO", category: "KATALOG", linkUrl: "/produk" },
        }),
        prisma.notification.create({
          data: { roomId, title: "Notif Terlihat B", message: "Pesan B", severity: "INFO", category: "KATALOG", linkUrl: "/produk" },
        }),
        prisma.notification.create({
          data: { roomId, title: "Notif Khusus Pemilik", message: "Pesan Rahasia", severity: "CRITICAL", category: "SHIFT", targetRole: "PEMILIK", linkUrl: "/laporan" },
        }),
      ]);

      activeSessionToken = kasirToken;
      expect(
        (
          await postAudit(
            jsonReq("http://localhost/api/audit", "POST", {
              action: "MARK_IDS_READ",
              notificationIds: [notifOwnerOnly.id],
            })
          )
        ).status
      ).toBe(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: notifOwnerOnly.id } })).isRead).toBe(false);

      activeSessionToken = ownerToken;
      expect(
        (
          await postAudit(
            jsonReq("http://localhost/api/audit", "POST", {
              action: "MARK_IDS_READ",
              notificationIds: [notifA.id],
            })
          )
        ).status
      ).toBe(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: notifA.id } })).isRead).toBe(true);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: notifB.id } })).isRead).toBe(false);
    });

    it("Scenario 34b: Non-admin PUT /api/products redirects price edits to pending request (202) and rejection keeps catalog intact", async () => {
      activeSessionToken = gudangToken;
      const directPutRes = await updateProduct(
        jsonReq("http://localhost/api/products", "PUT", {
          id: prod1.id,
          sku: prod1.sku,
          name: prod1.name,
          categoryId: catId,
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
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(18000);

      activeSessionToken = ownerToken;
      const rejectRes = await reviewProductRequest(
        jsonReq(`http://localhost/api/product-requests/${directPutJson.productRequest.id}/review`, "POST", {
          decision: "DITOLAK",
          rejectionReason: "Harga terlalu tinggi",
        }),
        { params: Promise.resolve({ id: directPutJson.productRequest.id }) }
      );
      expect(rejectRes.status).toBe(200);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(18000);
    });

    it("Scenario 34c: Non-admin batches multiple price edits + new product together and approval preserves concurrent POS stock", async () => {
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
              categoryId: catId,
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
              categoryId: catId,
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
              categoryId: catId,
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

      expect((await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } })).sellPrice).toBe(18000);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: prod2.id } })).sellPrice).toBe(22000);

      // Concurrent POS sale lowers prod1 stock 10 -> 8 before Owner approves
      await prisma.product.update({ where: { id: prod1.id }, data: { currentStock: 8 } });

      activeSessionToken = ownerToken;
      const approveRes = await reviewProductBatch(
        jsonReq("http://localhost/api/product-requests/batch-review", "POST", {
          batchId: batchJson.batchId,
          decision: "DISETUJUI",
        })
      );
      expect(approveRes.status).toBe(200);
      expect((await approveRes.json()).processedCount).toBe(3);

      const updatedP1 = await prisma.product.findUniqueOrThrow({ where: { id: prod1.id } });
      const updatedP2 = await prisma.product.findUniqueOrThrow({ where: { id: prod2.id } });
      const createdP3 = await prisma.product.findFirstOrThrow({ where: { roomId, sku: "MNM-03" } });

      expect(updatedP1.costPrice).toBe(8500);
      expect(updatedP1.sellPrice).toBe(20000);
      expect(updatedP1.currentStock).toBe(8);
      expect(updatedP2.name).toBe("Matcha Latte Premium");
      expect(updatedP2.costPrice).toBe(11000);
      expect(updatedP2.sellPrice).toBe(25000);
      expect(createdP3.sellPrice).toBe(16000);
      expect(createdP3.currentStock).toBe(12);
    });
  });

  it("Scenario 35 (Tahap 1): POST /api/sales blocks without active shift (403) and prevents stock race under concurrent checkout", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Race Guard",
        username: "owner_race35",
        email: "owner35@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Anti Race Condition",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();

    activeSessionToken = ownerToken;
    const cat = await prisma.category.create({
      data: { roomId: ownerJson.room.id, name: "Minuman", areaType: "TERBUKA" },
    });

    const lastUnitProd = (
      await (
        await createProduct(
          jsonReq("http://localhost/api/products", "POST", {
            sku: "LAST-01",
            name: "Botol Terakhir",
            categoryId: cat.id,
            stockMethod: "TETAP",
            purchaseUnit: "pcs",
            sellUnit: "pcs",
            conversionRatio: 1,
            costPrice: 5000,
            sellPrice: 12000,
            currentStock: 1,
          })
        )
      ).json()
    ).product;

    const rawMat = (
      await (
        await createProduct(
          jsonReq("http://localhost/api/products", "POST", {
            sku: "MAT-35",
            name: "Susu Sisa 1 Takaran",
            categoryId: cat.id,
            stockMethod: "PECAH",
            isRawMaterial: true,
            purchaseUnit: "pack",
            sellUnit: "ml",
            conversionRatio: 100,
            costPrice: 20,
            sellPrice: 0,
            currentStock: 100,
          })
        )
      ).json()
    ).product;

    const recipeProd = (
      await (
        await createProduct(
          jsonReq("http://localhost/api/products", "POST", {
            sku: "RCP-35",
            name: "Latte Sisa 1",
            categoryId: cat.id,
            stockMethod: "RESEP",
            purchaseUnit: "cup",
            sellUnit: "cup",
            conversionRatio: 1,
            costPrice: 0,
            sellPrice: 20000,
            variants: [
              {
                name: "Regular",
                sellPrice: 20000,
                ingredients: [{ materialId: rawMat.id, quantity: 100, unit: "ml" }],
              },
            ],
          })
        )
      ).json()
    ).product;

    // 1. Tanpa shift aktif -> wajib ditolak 403 di server & stok tetap 1
    const noShiftRes = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        cashReceived: 12000,
        items: [{ productId: lastUnitProd.id, quantity: 1 }],
      })
    );
    expect(noShiftRes.status).toBe(403);
    const noShiftJson = await noShiftRes.json();
    expect(noShiftJson.code).toBe("NO_ACTIVE_SHIFT");
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: lastUnitProd.id } })).currentStock
    ).toBe(1);

    // 2. Buka shift lalu simulasikan 2 request checkout paralel atas unit terakhir (TETAP)
    await openShiftForActiveUser();
    const [resA, resB] = await Promise.all([
      createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "TUNAI",
          cashReceived: 12000,
          items: [{ productId: lastUnitProd.id, quantity: 1 }],
        })
      ),
      createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "TUNAI",
          cashReceived: 12000,
          items: [{ productId: lastUnitProd.id, quantity: 1 }],
        })
      ),
    ]);
    const statusesTetap = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statusesTetap).toEqual([200, 400]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: lastUnitProd.id } })).currentStock
    ).toBe(0);

    // 3. Simulasikan 2 request checkout paralel atas 1 porsi terakhir produk RESEP
    const [recA, recB] = await Promise.all([
      createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "QRIS",
          items: [{ productId: recipeProd.id, quantity: 1 }],
        })
      ),
      createSale(
        jsonReq("http://localhost/api/sales", "POST", {
          paymentMethod: "QRIS",
          items: [{ productId: recipeProd.id, quantity: 1 }],
        })
      ),
    ]);
    const statusesRecipe = [recA.status, recB.status].sort((a, b) => a - b);
    expect(statusesRecipe).toEqual([200, 400]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: rawMat.id } })).currentStock
    ).toBe(0);
  });

  it("Scenario 36 (Tahap 2): Cron backup auth, compressed export, BackupLog failure/success visibility, and 30-backup retention", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Backup",
        username: "owner_backup36",
        email: "owner36@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Backup Terverifikasi",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();

    const prevCronSecret = process.env.CRON_SECRET;
    const prevBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const prevLocalDir = process.env.BACKUP_STORAGE_DIR;
    const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), "trasir-backup-test-"));

    try {
      // 1. Tanpa CRON_SECRET -> 503
      delete process.env.CRON_SECRET;
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BACKUP_STORAGE_DIR;
      const missingSecretRes = await runCronBackup(new Request("http://localhost/api/cron/backup"));
      expect(missingSecretRes.status).toBe(503);

      // 2. Secret salah / tanpa Bearer -> 401
      process.env.CRON_SECRET = "super_cron_secret_test_123456";
      const unauthRes = await runCronBackup(
        new Request("http://localhost/api/cron/backup", {
          headers: { Authorization: "Bearer salah" },
        })
      );
      expect(unauthRes.status).toBe(401);

      // 3. Secret valid tapi tanpa storage -> mencatat BackupLog FAILED secara jujur
      const failRunRes = await runCronBackup(
        new Request("http://localhost/api/cron/backup", {
          headers: { Authorization: "Bearer super_cron_secret_test_123456" },
        })
      );
      expect(failRunRes.status).toBe(207);
      const failRunJson = await failRunRes.json();
      expect(failRunJson.processedRooms).toBeGreaterThanOrEqual(1);
      expect(failRunJson.failedRooms).toBe(failRunJson.processedRooms);

      activeSessionToken = ownerToken;
      const settingsAfterFail = await (await getSettings()).json();
      expect(settingsAfterFail.backupStatus.isFailed).toBe(true);
      expect(settingsAfterFail.backupStatus.isStale).toBe(true);

      // 4. Konfigurasi storage lokal -> cron sukses mengekspor gzip valid & mencatat BackupLog SUCCESS
      process.env.BACKUP_STORAGE_DIR = tmpBackupDir;
      const okRunRes = await runCronBackup(
        new Request("http://localhost/api/cron/backup", {
          headers: { Authorization: "Bearer super_cron_secret_test_123456" },
        })
      );
      expect(okRunRes.status).toBe(200);
      const okRunJson = await okRunRes.json();
      expect(okRunJson.succeededRooms).toBe(okRunJson.processedRooms);
      const ownBackupResult = okRunJson.results.find(
        (r: { roomId: string }) => r.roomId === ownerJson.room.id
      );
      expect(ownBackupResult).toBeDefined();
      expect(ownBackupResult.sizeBytes).toBeGreaterThan(20);

      const latestSuccess = await prisma.backupLog.findFirstOrThrow({
        where: { roomId: ownerJson.room.id, status: "SUCCESS", triggerType: "CRON" },
        orderBy: { createdAt: "desc" },
      });
      expect(latestSuccess.storageUrl).toBeTruthy();
      const rawGz = fs.readFileSync(latestSuccess.storageUrl!);
      const unzipped = JSON.parse(zlib.gunzipSync(rawGz).toString("utf8"));
      expect(unzipped.room.id).toBe(ownerJson.room.id);

      const settingsAfterOk = await (await getSettings()).json();
      expect(settingsAfterOk.backupStatus.isFailed).toBe(false);
      expect(settingsAfterOk.backupStatus.isStale).toBe(false);

      // 5. Backup manual juga tercatat ke BackupLog
      const manualRes = await getManualBackup();
      expect(manualRes.status).toBe(200);
      const manualLog = await prisma.backupLog.findFirst({
        where: { roomId: ownerJson.room.id, triggerType: "MANUAL", status: "SUCCESS" },
      });
      expect(manualLog).not.toBeNull();

      // 6. Retensi maksimal 30 backup CRON sukses per ruangan
      const extraRows = Array.from({ length: 34 }, (_, idx) => ({
        roomId: ownerJson.room.id,
        triggerType: "CRON",
        status: "SUCCESS",
        sizeBytes: 100 + idx,
        createdAt: new Date(Date.now() - (idx + 1) * 60_000),
      }));
      await prisma.backupLog.createMany({ data: extraRows });
      const pruned = await enforceBackupRetention(ownerJson.room.id);
      expect(pruned).toBe(5);
      const remainingCronSuccess = await prisma.backupLog.count({
        where: { roomId: ownerJson.room.id, triggerType: "CRON", status: "SUCCESS" },
      });
      expect(remainingCronSuccess).toBe(30);
    } finally {
      if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCronSecret;
      if (prevBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = prevBlobToken;
      if (prevLocalDir === undefined) delete process.env.BACKUP_STORAGE_DIR;
      else process.env.BACKUP_STORAGE_DIR = prevLocalDir;
      fs.rmSync(tmpBackupDir, { recursive: true, force: true });
    }
  });

  it("Scenario 37 (Tahap 3): Rate limit & OTP lockout persist across serverless instance reloads (vi.resetModules), hash OTP, reject expired & replayed OTP", async () => {
    // 1. Instance pertama mengisi rate limit & memicu OTP lockout
    const rlInstance1 = await import("../src/lib/rate-limit");
    const sharedKey = `cross-inst-rl-${Date.now()}`;
    expect((await rlInstance1.checkRateLimit(sharedKey, 2, 60_000, { forceEnforce: true })).limited).toBe(false);
    expect((await rlInstance1.checkRateLimit(sharedKey, 2, 60_000, { forceEnforce: true })).limited).toBe(false);
    expect((await rlInstance1.checkRateLimit(sharedKey, 2, 60_000, { forceEnforce: true })).limited).toBe(true);

    const lockedToken = `cross-inst-lock-${Date.now()}`;
    await rlInstance1.createOtpChallenge({
      token: lockedToken,
      codeHash: rlInstance1.hashTokenKey("654321"),
      purpose: "email-change",
      ttlMs: 15 * 60_000,
      maxAttempts: 5,
    });
    // Pastikan kode mentah tidak tersimpan di DB (hanya hash)
    const storedRow = await prisma.otpChallenge.findUniqueOrThrow({
      where: { tokenHash: rlInstance1.hashTokenKey(lockedToken) },
    });
    expect(storedRow.codeHash).not.toBe("654321");
    expect(storedRow.codeHash).toHaveLength(64);

    for (let i = 0; i < 5; i += 1) {
      await rlInstance1.recordOtpFailedAttempt(lockedToken, 5);
    }

    const expiredToken = `cross-inst-exp-${Date.now()}`;
    await rlInstance1.createOtpChallenge({
      token: expiredToken,
      codeHash: rlInstance1.hashTokenKey("111222"),
      purpose: "email-change",
      ttlMs: -1_000, // sudah kedaluwarsa
      maxAttempts: 5,
    });

    const consumedToken = `cross-inst-used-${Date.now()}`;
    await rlInstance1.createOtpChallenge({
      token: consumedToken,
      codeHash: rlInstance1.hashTokenKey("222333"),
      purpose: "email-change",
      ttlMs: 15 * 60_000,
      maxAttempts: 5,
    });
    expect(await rlInstance1.markOtpTokenConsumed(consumedToken)).toBe(true);

    // 2. Simulasi instance serverless baru (reset seluruh module state in-memory)
    vi.resetModules();
    const rlInstance2 = await import("../src/lib/rate-limit");

    // Lockout rate limit, lockout OTP, expired OTP, dan single-use replay tetap berlaku di instance 2
    expect((await rlInstance2.checkRateLimit(sharedKey, 2, 60_000, { forceEnforce: true })).limited).toBe(true);
    expect(await rlInstance2.isOtpTokenBlocked(lockedToken)).toEqual({
      blocked: true,
      reason: "LOCKED",
    });
    expect(await rlInstance2.isOtpTokenBlocked(expiredToken)).toEqual({
      blocked: true,
      reason: "EXPIRED",
    });
    expect(await rlInstance2.isOtpTokenBlocked(consumedToken)).toEqual({
      blocked: true,
      reason: "USED",
    });
    expect(await rlInstance2.markOtpTokenConsumed(consumedToken)).toBe(false);
  });

  it("Scenario 38 (Tahap 4): Rejects weak/common passwords on registration/update, allows legacy short password login but enforces forced password change", async () => {
    // 1. Register dengan sandi < 10 karakter atau sandi umum ditolak 400
    const shortPwdRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Pendek",
        username: "owner_short38",
        email: "short38@toko.id",
        password: "abc12345",
        roomName: "Toko Sandi Pendek",
      })
    );
    expect(shortPwdRes.status).toBe(400);

    const commonPwdRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Umum",
        username: "owner_common38",
        email: "common38@toko.id",
        password: "password123",
        roomName: "Toko Sandi Umum",
      })
    );
    expect(commonPwdRes.status).toBe(400);

    // 2. Buat akun valid lalu simulasikan pengguna lama dengan sandi historis 6 karakter ("lama12")
    const regOkRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Legacy",
        username: "owner_legacy38",
        email: "legacy38@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Legacy Sandi",
      })
    );
    expect(regOkRes.status).toBe(201);
    const regOkJson = await regOkRes.json();

    const legacyHash = await hashPassword("lama12");
    await prisma.user.update({
      where: { id: regOkJson.user.id },
      data: { passwordHash: legacyHash, mustChangePassword: false },
    });

    // 3. Login dengan sandi lama TETAP BERHASIL (200), namun memaksa ganti sandi
    const legacyLoginRes = await loginUser(
      jsonReq("http://localhost/api/auth/login", "POST", {
        identifier: "owner_legacy38",
        password: "lama12",
      })
    );
    expect(legacyLoginRes.status).toBe(200);
    const legacyLoginJson = await legacyLoginRes.json();
    expect(legacyLoginJson.mustChangePassword).toBe(true);
    expect(legacyLoginJson.redirectTo).toBe("/pengaturan?tab=lanjutan&forcePasswordChange=1");

    const dbUserAfterLogin = await prisma.user.findUniqueOrThrow({
      where: { id: regOkJson.user.id },
    });
    expect(dbUserAfterLogin.mustChangePassword).toBe(true);

    // 4. Mengganti sandi ke sandi umum ditolak 400; mengganti ke sandi kuat menonaktifkan paksaan
    activeSessionToken = extractSessionToken(legacyLoginRes)!;
    const weakUpdateRes = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_PROFILE",
        currentPassword: "lama12",
        newPassword: "1234567890",
      })
    );
    expect(weakUpdateRes.status).toBe(400);

    const strongUpdateRes = await postSettings(
      jsonReq("http://localhost/api/settings", "POST", {
        action: "UPDATE_PROFILE",
        currentPassword: "lama12",
        newPassword: "SandiKuatBaru#2026",
      })
    );
    expect(strongUpdateRes.status).toBe(200);

    const dbUserAfterUpgrade = await prisma.user.findUniqueOrThrow({
      where: { id: regOkJson.user.id },
    });
    expect(dbUserAfterUpgrade.mustChangePassword).toBe(false);
  });

  it("Scenario 39 (Tahap 5): Uses real Shift & Counter tables, links Sale.shiftId/counterId, and runs idempotent backfill from legacy ShiftClosing/SystemSetting", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Tahap 5",
        username: "owner_t5",
        email: "owner_t5@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Desain Data",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();
    const roomId = ownerJson.room.id as string;
    const ownerId = ownerJson.user.id as string;
    activeSessionToken = ownerToken;

    // 1. Konfigurasi 2 loket tersimpan di tabel Counter sungguhan (bukan hanya SystemSetting)
    const counterSaveRes = await createCounter(
      jsonReq("http://localhost/api/counters", "POST", {
        name: "Loket Drive Thru",
      })
    );
    expect(counterSaveRes.status).toBe(201);

    const dbCounters = await prisma.counter.findMany({
      where: { roomId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    expect(dbCounters.length).toBe(2);
    expect(dbCounters[0]?.slug).toBe("loket-1");
    expect(dbCounters[1]?.name).toBe("Loket Drive Thru");
    const secondCounter = dbCounters[1]!;

    // Buat produk untuk transaksi
    const cat = await prisma.category.create({
      data: { roomId, name: "Kopi", areaType: "TERBUKA" },
    });
    const prodRes = await createProduct(
      jsonReq("http://localhost/api/products", "POST", {
        sku: "T5-01",
        name: "Americano T5",
        categoryId: cat.id,
        stockMethod: "TETAP",
        purchaseUnit: "cup",
        sellUnit: "cup",
        conversionRatio: 1,
        costPrice: 7000,
        sellPrice: 18000,
        currentStock: 10,
      })
    );
    expect(prodRes.status).toBe(201);
    const prod = (await prodRes.json()).product;

    // 2. Tanpa Shift di model baru -> POST /api/sales ditolak 403
    const blockedSaleRes = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        items: [{ productId: prod.id, quantity: 1 }],
      })
    );
    expect(blockedSaleRes.status).toBe(403);

    // 3. Buka shift di loket ke-2 -> tersimpan di tabel Shift dan Sale otomatis terhubung ke shiftId & counterId
    const openJson = await openShiftForActiveUser(secondCounter.slug);
    const dbShift = await prisma.shift.findUniqueOrThrow({
      where: { id: openJson.activeShift.id },
    });
    expect(dbShift.status).toBe("AKTIF");
    expect(dbShift.counterSlug).toBe(secondCounter.slug);
    expect(dbShift.counterId).toBe(secondCounter.id);
    expect(dbShift.openingCashTotal).toBe(100000);

    const saleRes = await createSale(
      jsonReq("http://localhost/api/sales", "POST", {
        paymentMethod: "TUNAI",
        items: [{ productId: prod.id, quantity: 2 }],
      })
    );
    expect(saleRes.status).toBe(200);
    const saleJson = await saleRes.json();
    const dbSale = await prisma.sale.findUniqueOrThrow({
      where: { id: saleJson.sale.id },
    });
    expect(dbSale.shiftId).toBe(dbShift.id);
    expect(dbSale.counterId).toBe(secondCounter.id);

    // Tutup shift dan pastikan laporan membaca dari tabel Shift
    const closeRes = await postShift(
      jsonReq("http://localhost/api/shifts", "POST", {
        action: "CLOSE",
        denominations: { "100000": 1, "20000": 1, "10000": 1, "5000": 1, "1000": 1 },
        operationalExpenses: [],
        honestyConfirmed: true,
      })
    );
    expect(closeRes.status).toBe(201);
    const closedShift = await prisma.shift.findUniqueOrThrow({ where: { id: dbShift.id } });
    expect(closedShift.closedAt).not.toBeNull();
    expect(closedShift.closingCashTotal).toBe(136000);

    const reportRes = await getReports(new Request("http://localhost/api/reports?period=daily"));
    expect(reportRes.status).toBe(200);
    const reportJson = await reportRes.json();
    expect(reportJson.shiftAudits.some((s: { id: string; counterId: string }) => s.id === dbShift.id && s.counterId === secondCounter.slug)).toBe(true);

    // 4. Uji backfill idempoten dari data legacy (SystemSetting.openAreaPolicy, ShiftClosing.notes, & Sale tanpa shiftId)
    const legacyOpenedAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const legacyClosedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const legacySaleAt = new Date(Date.now() - 3 * 60 * 60 * 1000);

    await prisma.systemSetting.upsert({
      where: { id: `room_counters:${roomId}` },
      update: {
        openAreaPolicy: JSON.stringify([
          { id: "loket-1", name: "Loket Utama" },
          { id: "loket-legacy", name: "Loket Legacy" },
        ]),
      },
      create: {
        id: `room_counters:${roomId}`,
        openAreaPolicy: JSON.stringify([
          { id: "loket-1", name: "Loket Utama" },
          { id: "loket-legacy", name: "Loket Legacy" },
        ]),
      },
    });

    const legacyShiftClosing = await prisma.shiftClosing.create({
      data: {
        roomId,
        cashierId: ownerId,
        shiftDate: legacyOpenedAt,
        systemTxCount: 1,
        systemCashTotal: 18000,
        systemQrisTotal: 0,
        systemTransferTotal: 0,
        systemCardTotal: 0,
        systemGrandTotal: 18000,
        actualCashTotal: 118000,
        actualDigitalTotal: 0,
        cashDifference: 0,
        status: "SESUAI",
        notes: JSON.stringify({
          version: 2,
          counterId: "loket-legacy",
          counterName: "Loket Legacy",
          openedAt: legacyOpenedAt.toISOString(),
          closedAt: legacyClosedAt.toISOString(),
          openingCashTotal: 100000,
          openingDenominations: { "50000": 2 },
          closingDenominations: { "100000": 1, "10000": 1, "5000": 1, "1000": 3 },
          operationalExpenses: [],
          operationalExpenseTotal: 0,
          expectedCashAtClose: 118000,
          closingCashDifference: 0,
          handoverSyncStatus: "SHIFT_PERTAMA",
          handoverDifference: 0,
          previousShiftClosingCash: null,
        }),
        createdAt: legacyClosedAt,
      },
    });

    const unlinkedSale = await prisma.sale.create({
      data: {
        roomId,
        receiptNumber: "INV-LEGACY-T5-001",
        cashierId: ownerId,
        paymentMethod: "TUNAI",
        totalAmount: 18000,
        totalCost: 7000,
        cashReceived: 18000,
        changeAmount: 0,
        status: "NORMAL",
        createdAt: legacySaleAt,
      },
    });

    const { runTahap5Backfill } = await import("../scripts/backfill-tahap5.mjs");
    const firstRun = await runTahap5Backfill(prisma);
    expect(firstRun.countersCreated).toBeGreaterThanOrEqual(1);
    expect(firstRun.shiftsCreated).toBe(1);
    expect(firstRun.salesLinkedToShift).toBe(1);
    expect(firstRun.orphanAudit.roomsWithoutActiveCounter).toBe(0);

    const migratedShift = await prisma.shift.findUniqueOrThrow({
      where: { legacyShiftClosingId: legacyShiftClosing.id },
    });
    expect(migratedShift.counterSlug).toBe("loket-legacy");
    expect(migratedShift.openingCashTotal).toBe(100000);
    expect(migratedShift.closingCashTotal).toBe(118000);

    const linkedSaleAfter = await prisma.sale.findUniqueOrThrow({
      where: { id: unlinkedSale.id },
    });
    expect(linkedSaleAfter.shiftId).toBe(migratedShift.id);
    expect(linkedSaleAfter.counterId).toBe(migratedShift.counterId);

    // Jalankan kedua kali -> 100% idempoten (0 duplikasi)
    const secondRun = await runTahap5Backfill(prisma);
    expect(secondRun.countersCreated).toBe(0);
    expect(secondRun.shiftsCreated).toBe(0);
    expect(secondRun.salesLinkedToShift).toBe(0);
  });

  it("Scenario 40 (Tahap 6): Enforces cursor pagination, limit bounds, date filtering, strips base64 receipts from lists, serves /api/purchases/[id]/receipt, and migrates receipts idempotently", async () => {
    const ownerRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Tahap 6",
        username: "owner_t6",
        email: "owner_t6@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Skalabilitas",
      })
    );
    expect(ownerRes.status).toBe(201);
    const ownerToken = extractSessionToken(ownerRes)!;
    const ownerJson = await ownerRes.json();
    const roomId = ownerJson.room.id as string;
    const ownerId = ownerJson.user.id as string;

    // Buat ruangan kedua untuk memastikan /api/purchases/[id]/receipt terisolasi lintas tenant
    const otherRes = await registerUser(
      jsonReq("http://localhost/api/auth/register", "POST", {
        mode: "CREATE_ROOM",
        name: "Owner Lain T6",
        username: "owner_t6_other",
        email: "owner_t6_other@toko.id",
        password: "PasswordAman123",
        roomName: "Toko Lain",
      })
    );
    const otherToken = extractSessionToken(otherRes)!;

    activeSessionToken = ownerToken;

    const tinyPngBase64 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Seed 5 pembelian dengan timestamp & purchaseDate terurut jelas
    const baseTime = new Date("2026-11-10T05:00:00.000Z").getTime();
    const seededPurchaseIds: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const p = await prisma.purchase.create({
        data: {
          roomId,
          invoiceNumber: `NOTA-T6-0${i}`,
          supplierName: `Pemasok ${i}`,
          purchaseDate: new Date(`2026-11-0${i}T04:00:00.000Z`),
          fundingSource: "DANA_TOKO",
          captureMethod: i % 2 === 1 ? "DIGITAL_UPLOAD" : "TANPA_NOTA",
          receiptImageData: i % 2 === 1 ? tinyPngBase64 : "",
          receiptHash: i % 2 === 1 ? `hash-t6-${i}` : null,
          totalAmount: i * 10000,
          aiValidationStatus: i % 2 === 1 ? "BELUM_DICEK" : "TANPA_NOTA",
          approvalStatus: "MENUNGGU_PERSETUJUAN",
          submittedById: ownerId,
          createdAt: new Date(baseTime + i * 60_000),
        },
      });
      seededPurchaseIds.push(p.id);
    }

    // 1. Batas limit > 100 dipaksa menjadi 100; default limit = 50
    const capRes = await getPurchases(new Request("http://localhost/api/purchases?limit=999"));
    expect(capRes.status).toBe(200);
    const capJson = await capRes.json();
    expect(capJson.limit).toBe(100);
    expect(capJson.items.length).toBe(5);
    expect(capJson.nextCursor).toBeNull();
    // Pastikan foto base64 TIDAK disertakan di endpoint daftar
    for (const item of capJson.items) {
      expect(item).not.toHaveProperty("receiptImageData");
      expect(typeof item.hasReceipt).toBe("boolean");
    }

    // 2. Paginasi cursor-based dengan limit=2 menelusuri semua 5 item terurut desc tanpa duplikasi
    const collectedPurchaseIds: string[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    do {
      const url = cursor
        ? `http://localhost/api/purchases?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "http://localhost/api/purchases?limit=2";
      const pageRes = await getPurchases(new Request(url));
      expect(pageRes.status).toBe(200);
      const pageJson = await pageRes.json();
      expect(pageJson.items.length).toBeLessThanOrEqual(2);
      for (const row of pageJson.items) {
        collectedPurchaseIds.push(row.id);
      }
      cursor = pageJson.nextCursor;
      pageCount += 1;
    } while (cursor && pageCount < 10);

    expect(pageCount).toBe(3);
    expect(collectedPurchaseIds).toEqual([...seededPurchaseIds].reverse());

    // 3. Filter tanggal pembelian (from & to)
    const dateFilteredRes = await getPurchases(
      new Request("http://localhost/api/purchases?from=2026-11-02&to=2026-11-04")
    );
    expect(dateFilteredRes.status).toBe(200);
    const dateFilteredJson = await dateFilteredRes.json();
    expect(dateFilteredJson.items.map((p: { invoiceNumber: string }) => p.invoiceNumber)).toEqual([
      "NOTA-T6-04",
      "NOTA-T6-03",
      "NOTA-T6-02",
    ]);

    // 4. Endpoint khusus GET /api/purchases/[id]/receipt mengembalikan bukti nota & memblokir lintas ruangan
    const receiptTargetId = seededPurchaseIds[0]; // NOTA-T6-01 (punya base64)
    const receiptRes = await getPurchaseReceiptById(
      new Request(`http://localhost/api/purchases/${receiptTargetId}/receipt`),
      { params: Promise.resolve({ id: receiptTargetId }) }
    );
    expect(receiptRes.status).toBe(200);
    const receiptJson = await receiptRes.json();
    expect(receiptJson.hasReceipt).toBe(true);
    expect(receiptJson.storageType).toBe("INLINE_BASE64");
    expect(receiptJson.receiptImageData).toBe(tinyPngBase64);

    activeSessionToken = otherToken;
    const crossTenantReceiptRes = await getPurchaseReceiptById(
      new Request(`http://localhost/api/purchases/${receiptTargetId}/receipt`),
      { params: Promise.resolve({ id: receiptTargetId }) }
    );
    expect(crossTenantReceiptRes.status).toBe(404);
    activeSessionToken = ownerToken;

    // 5. Migrasi base64 -> object storage URL secara idempoten tanpa hapus base64 (default)
    const { migratePurchaseReceiptsToStorage } = await import(
      "../scripts/migrate-receipts-to-blob.mjs"
    );
    const dryReport = await migratePurchaseReceiptsToStorage(prisma, { dryRun: true });
    expect(dryReport.scanned).toBe(3);
    expect(dryReport.migrated).toBe(3);

    const migratedReport = await migratePurchaseReceiptsToStorage(prisma, {
      batchSize: 2,
      uploader: async ({ pathname }: { pathname: string }) =>
        `https://blob.vercel-storage.com/${pathname}`,
    });
    expect(migratedReport.migrated).toBe(3);
    expect(migratedReport.failed).toBe(0);

    // Setelah migrasi, endpoint detail mengembalikan OBJECT_STORAGE URL
    const migratedReceiptRes = await getPurchaseReceiptById(
      new Request(`http://localhost/api/purchases/${receiptTargetId}/receipt`),
      { params: Promise.resolve({ id: receiptTargetId }) }
    );
    const migratedReceiptJson = await migratedReceiptRes.json();
    expect(migratedReceiptJson.storageType).toBe("OBJECT_STORAGE");
    expect(migratedReceiptJson.receiptUrl).toContain("https://blob.vercel-storage.com/receipts/");

    // Jalankan ulang -> idempoten (0 migrasi ulang)
    const repeatReport = await migratePurchaseReceiptsToStorage(prisma, {
      uploader: async () => "https://should-not-run.example",
    });
    expect(repeatReport.scanned).toBe(0);
    expect(repeatReport.migrated).toBe(0);

    // 6. Paginasi cursor-based & batas limit pada GET /api/sales (termasuk tie-breaker timestamp identik)
    const sameTs = new Date("2026-11-12T06:00:00.000Z");
    const seededSaleIds: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      const s = await prisma.sale.create({
        data: {
          roomId,
          receiptNumber: `STRUK-T6-0${i}`,
          cashierId: ownerId,
          paymentMethod: "TUNAI",
          totalAmount: i * 5000,
          totalCost: i * 2000,
          cashReceived: i * 5000,
          changeAmount: 0,
          status: "NORMAL",
          // Baris 2 & 3 sengaja memakai timestamp identik untuk menguji composite cursor (createdAt, id)
          createdAt: i === 2 || i === 3 ? sameTs : new Date(sameTs.getTime() + (i - 2) * 30_000),
        },
      });
      seededSaleIds.push(s.id);
    }

    const salesCapRes = await listSales(new Request("http://localhost/api/sales?limit=500"));
    expect(salesCapRes.status).toBe(200);
    const salesCapJson = await salesCapRes.json();
    expect(salesCapJson.limit).toBe(100);
    expect(salesCapJson.items.length).toBe(5);

    const collectedSales: string[] = [];
    let saleCursor: string | null = null;
    let salePages = 0;
    do {
      const url = saleCursor
        ? `http://localhost/api/sales?limit=2&cursor=${encodeURIComponent(saleCursor)}`
        : "http://localhost/api/sales?limit=2";
      const pageRes = await listSales(new Request(url));
      expect(pageRes.status).toBe(200);
      const pageJson = await pageRes.json();
      expect(pageJson.items.length).toBeLessThanOrEqual(2);
      for (const s of pageJson.items) {
        collectedSales.push(s.id);
      }
      saleCursor = pageJson.nextCursor;
      salePages += 1;
    } while (saleCursor && salePages < 10);

    expect(salePages).toBe(3);
    expect(new Set(collectedSales).size).toBe(5);
    expect(collectedSales.sort()).toEqual([...seededSaleIds].sort());

    // Filter tanggal di GET /api/sales
    const salesDateRes = await listSales(new Request("http://localhost/api/sales?date=2026-11-12"));
    expect(salesDateRes.status).toBe(200);
    const salesDateJson = await salesDateRes.json();
    expect(salesDateJson.items.length).toBe(5);

    const salesEmptyDateRes = await listSales(
      new Request("http://localhost/api/sales?date=2026-11-01")
    );
    expect(salesEmptyDateRes.status).toBe(200);
    expect((await salesEmptyDateRes.json()).items.length).toBe(0);
  });
});
