import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { deductStockForSaleItem } from "@/lib/inventory";
import { recordAuditLog } from "@/lib/audit";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { AppError, handleApiError } from "@/lib/api-error";
import {
  buildDescCursorWhere,
  decodeCursor,
  encodeCursor,
  parseJakartaDateRange,
  parseLimitParam,
} from "@/lib/pagination";
import { z } from "zod";

const MAX_TX_CONFLICT_RETRIES = 3;

function isWriteConflictError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034"
  );
}

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
    const limit = parseLimitParam(searchParams.get("limit"));
    const cursorParam = searchParams.get("cursor");
    const cursor = cursorParam ? decodeCursor(cursorParam) : null;
    if (cursorParam && !cursor) {
      return NextResponse.json({ error: "Parameter cursor tidak valid." }, { status: 400 });
    }

    const { range: dateRange, error: dateError } = parseJakartaDateRange(searchParams);
    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 });
    }

    const admin = isStoreAdmin(user.role);

    const baseFilter: Record<string, unknown> = {
      roomId: user.roomId,
    };

    if (!admin) {
      baseFilter.cashierId = user.id;
    } else if (cashierFilter) {
      baseFilter.cashierId = cashierFilter;
    }

    if (
      statusFilter &&
      ["NORMAL", "MENUNGGU_PERSETUJUAN", "DIBATALKAN", "DIKEMBALIKAN", "DIUBAH"].includes(
        statusFilter
      )
    ) {
      baseFilter.status = statusFilter;
    }

    if (dateRange) {
      baseFilter.createdAt = dateRange;
    }

    const whereClause = cursor
      ? { AND: [baseFilter, buildDescCursorWhere(cursor)] }
      : baseFilter;

    const salesRows = await prisma.sale.findMany({
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = salesRows.length > limit;
    const sales = hasMore ? salesRows.slice(0, limit) : salesRows;
    const nextCursor =
      hasMore && sales.length > 0 ? encodeCursor(sales[sales.length - 1]) : null;

    const [amendments, shifts, cashiers] = cursor
      ? [[], [], []]
      : await Promise.all([
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
            take: 100,
          }),
          // Hanya mengembalikan ringkasan tutup shift operasional tanpa informasi selisih hasil tutup shift
          prisma.shift.findMany({
            where: admin
              ? { roomId: user.roomId, status: { not: "AKTIF" } }
              : { roomId: user.roomId, userId: user.id, status: { not: "AKTIF" } },
            select: {
              id: true,
              openedAt: true,
              closedAt: true,
              systemTxCount: true,
              systemCashTotal: true,
              systemQrisTotal: true,
              systemTransferTotal: true,
              systemCardTotal: true,
              systemGrandTotal: true,
              closingCashTotal: true,
              actualDigitalTotal: true,
              closingNote: true,
              createdAt: true,
              user: { select: { id: true, name: true, role: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          prisma.user.findMany({
            where: { roomId: user.roomId, isActive: true, isAssigned: true },
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
          }),
        ]);

    const normalizedShifts = shifts.map((s) => ({
      id: s.id,
      shiftDate: s.closedAt ?? s.openedAt,
      systemTxCount: s.systemTxCount,
      systemCashTotal: s.systemCashTotal,
      systemQrisTotal: s.systemQrisTotal,
      systemTransferTotal: s.systemTransferTotal,
      systemCardTotal: s.systemCardTotal,
      systemGrandTotal: s.systemGrandTotal,
      actualCashTotal: s.closingCashTotal ?? 0,
      actualDigitalTotal: s.actualDigitalTotal,
      notes: s.closingNote ?? null,
      createdAt: s.createdAt,
      cashier: s.user,
    }));

    return NextResponse.json({
      items: sales,
      nextCursor,
      limit,
      sales,
      amendments,
      shifts: normalizedShifts,
      cashiers,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/sales", "Gagal memuat data transaksi.");
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

    // Validasi di server: kasir wajib memiliki shift aktif pada model Shift sebelum mencatat penjualan
    const precheckActiveShift = await prisma.shift.findFirst({
      where: {
        roomId: user.roomId,
        userId: user.id,
        status: "AKTIF",
      },
      select: { id: true, counterId: true },
    });
    if (!precheckActiveShift) {
      return NextResponse.json(
        {
          error:
            "Buka shift kasir terlebih dahulu sebelum mencatat transaksi penjualan.",
          code: "NO_ACTIVE_SHIFT",
        },
        { status: 403 }
      );
    }

    const runSaleTransaction = () =>
      prisma.$transaction(async (tx) => {
        const activeShift = await tx.shift.findFirst({
          where: {
            roomId: user.roomId,
            userId: user.id,
            status: "AKTIF",
          },
          select: { id: true, counterId: true },
        });
        if (!activeShift) {
          throw new Error("SHIFT_REQUIRED");
        }

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
            throw new AppError("Produk tidak ditemukan pada katalog ruangan ini.", 400);
          }

          let unitPrice = product.sellPrice;
          let variantName: string | null = null;
          let resolvedVariantId: string | null = null;

          if (product.stockMethod === "RESEP") {
            const variant = reqItem.variantId
              ? product.variants.find((v) => v.id === reqItem.variantId)
              : product.variants[0];
            if (!variant) {
              throw new AppError(`Pilih varian untuk produk resep "${product.name}".`, 400);
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
          throw new AppError(
            `Nominal uang tunai diterima (Rp ${cashReceived}) kurang dari total belanja (Rp ${grandTotal}).`,
            400
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
            shiftId: activeShift.id,
            counterId: activeShift.counterId ?? null,
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

    let createdSale;
    for (let attempt = 1; attempt <= MAX_TX_CONFLICT_RETRIES; attempt += 1) {
      try {
        createdSale = await runSaleTransaction();
        break;
      } catch (txErr) {
        if (isWriteConflictError(txErr) && attempt < MAX_TX_CONFLICT_RETRIES) {
          continue;
        }
        throw txErr;
      }
    }

    return NextResponse.json({ sale: createdSale });
  } catch (err) {
    return handleApiError(err, "POST /api/sales", "Gagal memproses transaksi penjualan.");
  }
}
