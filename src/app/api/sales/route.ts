import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { deductStockForSaleItem } from "@/lib/inventory";
import { recordAuditLog } from "@/lib/audit";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { z } from "zod";

const saleItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  quantity: z.number().positive(),
});

const createSaleSchema = z.object({
  paymentMethod: z.enum(["TUNAI", "QRIS", "TRANSFER", "KARTU"]),
  discountAmount: z.number().int().min(0).optional(),
  cashReceived: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(saleItemInputSchema).min(1, "Keranjang belanja tidak boleh kosong"),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canViewSales =
      (await checkUserPermission(user.role, "penjualan", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view"));
    if (!canViewSales) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses riwayat transaksi." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cashierFilter = searchParams.get("cashierId");
    const statusFilter = searchParams.get("status");
    const admin = isStoreAdmin(user.role);

    const whereClause: Record<string, unknown> = {
      roomId: user.roomId,
    };

    if (!admin) {
      whereClause.cashierId = user.id;
    } else if (cashierFilter) {
      whereClause.cashierId = cashierFilter;
    }

    if (
      statusFilter &&
      ["NORMAL", "MENUNGGU_PERSETUJUAN", "DIBATALKAN", "DIKEMBALIKAN", "DIUBAH"].includes(
        statusFilter
      )
    ) {
      whereClause.status = statusFilter;
    }

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
        where: admin
          ? { roomId: user.roomId }
          : { roomId: user.roomId, requestedById: user.id },
        include: {
          sale: {
            include: { items: true, cashier: { select: { id: true, name: true } } },
          },
          requestedBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Hanya mengembalikan ringkasan tutup shift operasional tanpa informasi selisih hasil tutup shift
      prisma.shiftClosing.findMany({
        where: admin ? { roomId: user.roomId } : { roomId: user.roomId, cashierId: user.id },
        select: {
          id: true,
          shiftDate: true,
          systemTxCount: true,
          systemCashTotal: true,
          systemQrisTotal: true,
          systemTransferTotal: true,
          systemCardTotal: true,
          systemGrandTotal: true,
          actualCashTotal: true,
          actualDigitalTotal: true,
          notes: true,
          createdAt: true,
          cashier: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        where: { roomId: user.roomId, isActive: true, isAssigned: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({ sales, amendments, shifts, cashiers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data transaksi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

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
      let grossSubtotal = 0;
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
        const product = await tx.product.findFirst({
          where: { id: reqItem.productId, roomId: user.roomId, isActive: true },
          include: { variants: true },
        });
        if (!product) {
          throw new Error("Produk tidak ditemukan pada katalog ruangan ini.");
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

        // Potong stok secara atomik dan ambil snapshot HPP historis saat transaksi terjadi
        const deduction = await deductStockForSaleItem(tx, {
          productId: product.id,
          variantId: resolvedVariantId,
          quantity: reqItem.quantity,
        });

        const subtotal = Math.round(unitPrice * reqItem.quantity);
        grossSubtotal += subtotal;
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

      const discountAmount = Math.min(Math.max(0, data.discountAmount ?? 0), grossSubtotal);
      const grandTotal = grossSubtotal - discountAmount;

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
      const receiptNumber = `TRX-${getJakartaDateKey().replace(/-/g, "")}-${crypto.randomInt(
        100000,
        1000000
      )}`;

      const sale = await tx.sale.create({
        data: {
          roomId: user.roomId,
          receiptNumber,
          cashierId: user.id,
          paymentMethod: data.paymentMethod,
          discountAmount,
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
          roomId: user.roomId,
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
            discountAmount: sale.discountAmount,
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
