import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";
import { deductStockForSaleItem } from "@/lib/inventory";
import { recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const saleItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  quantity: z.number().positive(),
});

const createSaleSchema = z.object({
  paymentMethod: z.enum(["TUNAI", "QRIS", "TRANSFER", "KARTU"]),
  cashReceived: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(saleItemInputSchema).min(1, "Keranjang belanja tidak boleh kosong"),
});

export async function GET(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canViewSales =
      (await checkUserPermission(user.role, "penjualan", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view"));
    if (!canViewSales) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses riwayat penjualan." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cashierFilter = searchParams.get("cashierId");

    // KASIR only sees their own sales & shift unless they have manager/owner role
    const whereClause =
      user.role === "KASIR"
        ? { cashierId: user.id }
        : cashierFilter
        ? { cashierId: cashierFilter }
        : {};

    const [sales, amendments, shifts, cashiers] = await Promise.all([
      prisma.sale.findMany({
        where: whereClause,
        include: {
          cashier: { select: { id: true, name: true, role: true, username: true } },
          items: true,
          amendments: {
            include: {
              requestedBy: { select: { id: true, name: true, role: true } },
              reviewedBy: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.saleAmendment.findMany({
        where: user.role === "KASIR" ? { requestedById: user.id } : {},
        include: {
          sale: { include: { items: true, cashier: { select: { id: true, name: true } } } },
          requestedBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.shiftClosing.findMany({
        where: user.role === "KASIR" ? { cashierId: user.id } : {},
        include: {
          cashier: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({ sales, amendments, shifts, cashiers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data penjualan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canCreateSale = await checkUserPermission(user.role, "kasir", "create");
    if (!canCreateSale) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mencatat transaksi kasir." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data transaksi tidak valid" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const createdSale = await prisma.$transaction(async (tx) => {
      let grandTotal = 0;
      let grandCost = 0;

      const preparedItems: {
        productId: string;
        variantId: string | null;
        productName: string;
        variantName: string | null;
        quantity: number;
        unitPrice: number;
        unitCost: number;
        subtotal: number;
        totalCost: number;
      }[] = [];

      for (const reqItem of data.items) {
        const product = await tx.product.findUnique({
          where: { id: reqItem.productId },
          include: { variants: true },
        });
        if (!product) {
          throw new Error("Produk tidak ditemukan di database.");
        }

        let unitPrice = product.sellPrice;
        let variantName: string | null = null;
        let resolvedVariantId: string | null = null;

        if (product.stockMethod === "RESEP") {
          const variant = reqItem.variantId
            ? product.variants.find((v) => v.id === reqItem.variantId)
            : product.variants[0];
          if (!variant) {
            throw new Error(`Pilih varian untuk produk resep "${product.name}".`);
          }
          unitPrice = variant.sellPrice;
          variantName = variant.name;
          resolvedVariantId = variant.id;
        }

        // Deduct stock atomically and get accurate HPP (unitCost & totalCost)
        const deduction = await deductStockForSaleItem(tx, {
          productId: product.id,
          variantId: resolvedVariantId,
          quantity: reqItem.quantity,
        });

        const subtotal = Math.round(unitPrice * reqItem.quantity);
        grandTotal += subtotal;
        grandCost += deduction.totalCost;

        preparedItems.push({
          productId: product.id,
          variantId: resolvedVariantId,
          productName: product.name,
          variantName,
          quantity: reqItem.quantity,
          unitPrice,
          unitCost: deduction.unitCost,
          subtotal,
          totalCost: deduction.totalCost,
        });
      }

      const cashReceived =
        data.paymentMethod === "TUNAI"
          ? Math.max(data.cashReceived ?? grandTotal, 0)
          : grandTotal;

      if (data.paymentMethod === "TUNAI" && cashReceived < grandTotal) {
        throw new Error(
          `Nominal uang tunai diterima (Rp ${cashReceived}) kurang dari total belanja (Rp ${grandTotal}).`
        );
      }

      const changeAmount = data.paymentMethod === "TUNAI" ? cashReceived - grandTotal : 0;
      const receiptNumber = `TRX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      const sale = await tx.sale.create({
        data: {
          receiptNumber,
          cashierId: user.id,
          paymentMethod: data.paymentMethod,
          totalAmount: grandTotal,
          totalCost: grandCost,
          cashReceived,
          changeAmount,
          status: "NORMAL",
          notes: data.notes?.trim() || null,
          items: {
            create: preparedItems,
          },
        },
        include: {
          items: true,
          cashier: { select: { id: true, name: true, role: true } },
        },
      });

      await recordAuditLog(
        {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENJUALAN",
          actionSummary: `Transaksi penjualan #${sale.receiptNumber} (${sale.paymentMethod}) senilai Rp ${sale.totalAmount}`,
          entityType: "Sale",
          entityId: sale.id,
          afterData: {
            receiptNumber: sale.receiptNumber,
            paymentMethod: sale.paymentMethod,
            totalAmount: sale.totalAmount,
            totalCost: sale.totalCost,
            itemCount: preparedItems.length,
          },
          approvalState: "TERCATAT",
          linkUrl: "/penjualan",
        },
        tx
      );

      return sale;
    });

    return NextResponse.json({ sale: createdSale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses transaksi penjualan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

