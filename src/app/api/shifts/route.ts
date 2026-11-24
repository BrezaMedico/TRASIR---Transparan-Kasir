import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { getJakartaStartOfDay } from "@/lib/date-jakarta";
import { z } from "zod";

const shiftClosingSchema = z.object({
  actualCashTotal: z.number().int().min(0, "Nominal uang tunai tidak boleh negatif"),
  actualDigitalTotal: z.number().int().min(0, "Nominal pembayaran digital tidak boleh negatif"),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Mengambil ringkasan transaksi shift hari ini dan riwayat tutup shift.
 * Fitur melihat selisih hasil tutup shift telah dihapus sepenuhnya;
 * data historis di database tetap aman dan fungsi tutup shift tetap berjalan normal.
 */
export async function GET() {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView =
      (await checkUserPermission(user.role, "penjualan", "view")) ||
      (await checkUserPermission(user.role, "kasir", "view"));
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses fitur tutup shift." },
        { status: 403 }
      );
    }

    const startOfToday = getJakartaStartOfDay();
    const admin = isStoreAdmin(user.role);

    const salesWhere = admin
      ? {
          roomId: user.roomId,
          createdAt: { gte: startOfToday },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        }
      : {
          roomId: user.roomId,
          cashierId: user.id,
          createdAt: { gte: startOfToday },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        };

    const [todaySales, closings] = await Promise.all([
      prisma.sale.findMany({ where: salesWhere }),
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
    ]);

    let systemCashTotal = 0;
    let systemQrisTotal = 0;
    let systemTransferTotal = 0;
    let systemCardTotal = 0;

    for (const s of todaySales) {
      if (s.paymentMethod === "TUNAI") systemCashTotal += s.totalAmount;
      else if (s.paymentMethod === "QRIS") systemQrisTotal += s.totalAmount;
      else if (s.paymentMethod === "TRANSFER") systemTransferTotal += s.totalAmount;
      else if (s.paymentMethod === "KARTU") systemCardTotal += s.totalAmount;
    }

    const systemDigitalTotal = systemQrisTotal + systemTransferTotal + systemCardTotal;
    const systemGrandTotal = systemCashTotal + systemDigitalTotal;

    return NextResponse.json({
      summary: {
        systemTxCount: todaySales.length,
        systemCashTotal,
        systemQrisTotal,
        systemTransferTotal,
        systemCardTotal,
        systemDigitalTotal,
        systemGrandTotal,
      },
      closings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data tutup shift.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canClose =
      (await checkUserPermission(user.role, "penjualan", "create")) ||
      (await checkUserPermission(user.role, "kasir", "create"));
    if (!canClose) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin melakukan tutup shift." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = shiftClosingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tutup shift tidak valid." },
        { status: 400 }
      );
    }

    const startOfToday = getJakartaStartOfDay();
    const admin = isStoreAdmin(user.role);

    const salesWhere = admin
      ? {
          roomId: user.roomId,
          createdAt: { gte: startOfToday },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        }
      : {
          roomId: user.roomId,
          cashierId: user.id,
          createdAt: { gte: startOfToday },
          status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
        };

    const todaySales = await prisma.sale.findMany({ where: salesWhere });

    let systemCashTotal = 0;
    let systemQrisTotal = 0;
    let systemTransferTotal = 0;
    let systemCardTotal = 0;

    for (const s of todaySales) {
      if (s.paymentMethod === "TUNAI") systemCashTotal += s.totalAmount;
      else if (s.paymentMethod === "QRIS") systemQrisTotal += s.totalAmount;
      else if (s.paymentMethod === "TRANSFER") systemTransferTotal += s.totalAmount;
      else if (s.paymentMethod === "KARTU") systemCardTotal += s.totalAmount;
    }

    const systemDigitalTotal = systemQrisTotal + systemTransferTotal + systemCardTotal;
    const systemGrandTotal = systemCashTotal + systemDigitalTotal;
    const { actualCashTotal, actualDigitalTotal, notes } = parsed.data;
    const recordedGrandTotal = actualCashTotal + actualDigitalTotal;

    const closing = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftClosing.create({
        data: {
          roomId: user.roomId,
          cashierId: user.id,
          systemTxCount: todaySales.length,
          systemCashTotal,
          systemQrisTotal,
          systemTransferTotal,
          systemCardTotal,
          systemGrandTotal,
          actualCashTotal,
          actualDigitalTotal,
          // Kolom lama dipertahankan di skema untuk integritas data historis tanpa diekspos ke pengguna
          cashDifference: 0,
          digitalDifference: 0,
          totalDifference: 0,
          status: "TERCATAT",
          notes: notes?.trim() || null,
        },
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
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENJUALAN",
          actionSummary: `Tutup Shift oleh ${user.name} (${todaySales.length} transaksi, total pencatatan Rp ${recordedGrandTotal})`,
          entityType: "ShiftClosing",
          entityId: created.id,
          afterData: {
            systemTxCount: todaySales.length,
            systemGrandTotal,
            actualCashTotal,
            actualDigitalTotal,
            recordedGrandTotal,
            notes: created.notes,
          },
          approvalState: "TERCATAT",
          linkUrl: "/penjualan",
        },
        tx
      );

      return created;
    });

    return NextResponse.json({ closing }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan data tutup shift.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
