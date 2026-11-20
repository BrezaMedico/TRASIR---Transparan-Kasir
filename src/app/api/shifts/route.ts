import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const shiftClosingSchema = z.object({
  actualCashTotal: z.number().int().min(0, "Nominal uang tunai fisik tidak boleh negatif"),
  actualDigitalTotal: z.number().int().min(0, "Nominal bukti digital tidak boleh negatif"),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Calculate system summary for today's active sales (excluding DIBATALKAN & DIKEMBALIKAN)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const salesWhere =
      user.role === "KASIR"
        ? {
            cashierId: user.id,
            createdAt: { gte: startOfToday },
            status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
          }
        : {
            createdAt: { gte: startOfToday },
            status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
          };

    const todaySales = await prisma.sale.findMany({
      where: salesWhere,
    });

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

    const closings = await prisma.shiftClosing.findMany({
      where: user.role === "KASIR" ? { cashierId: user.id } : {},
      include: {
        cashier: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

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
    const message = err instanceof Error ? err.message : "Gagal memuat data rekonsiliasi shift.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = shiftClosingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data tutup shift tidak valid" },
        { status: 400 }
      );
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const salesWhere =
      user.role === "KASIR"
        ? {
            cashierId: user.id,
            createdAt: { gte: startOfToday },
            status: { notIn: ["DIBATALKAN", "DIKEMBALIKAN"] },
          }
        : {
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
    const cashDifference = actualCashTotal - systemCashTotal;
    const digitalDifference = actualDigitalTotal - systemDigitalTotal;
    const totalDifference = cashDifference + digitalDifference;
    const hasDiscrepancy = cashDifference !== 0 || digitalDifference !== 0;

    const closing = await prisma.$transaction(async (tx) => {
      const created = await tx.shiftClosing.create({
        data: {
          cashierId: user.id,
          systemTxCount: todaySales.length,
          systemCashTotal,
          systemQrisTotal,
          systemTransferTotal,
          systemCardTotal,
          systemGrandTotal,
          actualCashTotal,
          actualDigitalTotal,
          cashDifference,
          digitalDifference,
          totalDifference,
          status: hasDiscrepancy ? "PERLU_DIPERIKSA" : "SESUAI",
          notes: notes?.trim() || null,
        },
        include: {
          cashier: { select: { id: true, name: true, role: true } },
        },
      });

      await recordAuditLog(
        {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PENJUALAN",
          actionSummary: `Tutup Shift & Rekonsiliasi Kas oleh ${user.name} (Selisih: Rp ${totalDifference})`,
          entityType: "ShiftClosing",
          entityId: created.id,
          afterData: {
            systemGrandTotal,
            actualTotal: actualCashTotal + actualDigitalTotal,
            cashDifference,
            digitalDifference,
            status: created.status,
          },
          approvalState: "TERCATAT",
          linkUrl: "/penjualan",
        },
        tx
      );

      if (hasDiscrepancy) {
        await createNotification(
          {
            title: `Selisih Kas Tutup Shift (${user.name})`,
            message: `Terdapat selisih rekonsiliasi kas sebesar Rp ${totalDifference} pada penutupan shift ${user.name}. Perlu diperiksa oleh Pemilik.`,
            severity: "WARNING",
            category: "SHIFT",
            targetRole: "PEMILIK",
            linkUrl: "/penjualan",
          },
          tx
        );
      }

      return created;
    });

    return NextResponse.json({ closing });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan rekonsiliasi tutup shift.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

