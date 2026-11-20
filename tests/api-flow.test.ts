import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { POST as setupOwner } from "../src/app/api/auth/setup/route";
import { POST as loginUser } from "../src/app/api/auth/login/route";
import { POST as createProduct, GET as listProducts } from "../src/app/api/products/route";

describe("TRASIR Full-Stack API Integration Flow", () => {
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
    await prisma.user.deleteMany();
  });

  it("initializes First-Time Owner account when database has 0 users and rejects duplicate setup", async () => {
    const req1 = new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Budi Santoso",
        username: "pemilik",
        email: "budi@trasir.id",
        password: "PasswordAman123",
        storeName: "Toko Kopi & Sembako TRASIR",
      }),
    });

    const res1 = await setupOwner(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.user.role).toBe("PEMILIK");
    expect(data1.redirectTo).toBe("/dashboard");

    // Second setup attempt must be blocked (403)
    const req2 = new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Attacker",
        username: "hacker",
        email: "hacker@trasir.id",
        password: "PasswordAman123",
      }),
    });
    const res2 = await setupOwner(req2);
    expect(res2.status).toBe(403);

    // Login with created Owner account works and records AuditLog
    const loginReq = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "pemilik",
        password: "PasswordAman123",
      }),
    });
    const loginRes = await loginUser(loginReq);
    expect(loginRes.status).toBe(200);

    const logs = await prisma.auditLog.findMany({ where: { actionType: "LOGIN" } });
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects unauthenticated access to protected API endpoints (401)", async () => {
    const prodRes = await listProducts();
    expect(prodRes.status).toBe(401);

    const postProdReq = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized Product" }),
    });
    const postProdRes = await createProduct(postProdReq);
    expect(postProdRes.status).toBe(401);
  });
});

