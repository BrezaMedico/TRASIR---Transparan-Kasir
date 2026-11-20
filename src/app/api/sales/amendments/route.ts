import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";
import { restoreStockForSaleItem } from "@/lib/inventory";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const requestAmendmentSchema = z.object({
  action: z.literal("REQUEST"),
  saleId: z.string().min(1),
  amendmentType: z.enum(["PEMBATALAN", "RETUR", "PERUBAHAN"]),
  reason: z.string().min(5, "Alasan pengajuan wajib diisi minimal 5 karakter"),
  proofImageData: z.string().optional().nullable(),
  proposedPayload: z.string().optional().nullable(),
});

const reviewAmendmentSchema = z.object({
  action: z.literal("REVIEW"),
  amendmentId: z.string().min(1),
  decision: z.enum(["DISETUJUI", "DITOLAK"]),
  reviewNotes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (body.action === "REQUEST") {
      const parsed = requestAmendmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data pengajuan tidak lengkap" },
          { status: 400 }
        );
      }

      const { saleId, amendmentType, reason, proofImageData, proposedPayload } = parsed.data;
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: { items: true },
      });

      if (!sale) {
        return NextResponse.json({ error: "Transaksi penjualan tidak ditemukan." }, { status: 404 });
      }

      if (sale.status === "DIBATALKAN" || sale.status === "DIKEMBALIKAN") {
        return NextResponse.json(
          { error: "Transaksi ini sudah dibatalkan atau dikembalikan." },
          { status: 400 }
        );
      }

      const amendment = await prisma.$transaction(async (tx) => {
        const created = await tx.saleAmendment.create({
          data: {
            saleId: sale.id,
            amendmentType,
            reason: reason.trim(),
            proofImageData: proofImageData || null,
            proposedPayload: proposedPayload || null,
            status: "MENUNGGU_PERSETUJUAN",
            requestedById: user.id,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { status: "MENUNGGU_PERSETUJUAN" },
        });

        await recordAuditLog(
          {
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PERUBAHAN_TRANSAKSI",
            actionSummary: `Mengajukan ${amendmentType} untuk struk #${sale.receiptNumber}: "${reason.trim()}"`,
            entityType: "SaleAmendment",
            entityId: created.id,
            beforeData: { saleStatus: sale.status, totalAmount: sale.totalAmount },
            afterData: { amendmentType, reason: reason.trim(), status: "MENUNGGU_PERSETUJUAN" },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/penjualan",
          },
          tx
        );

        await createNotification(
          {
            title: `Pengajuan ${amendmentType} Struk #${sale.receiptNumber}`,
            message: `${user.name} mengajukan ${amendmentType} untuk struk #${sale.receiptNumber}. Alasan: ${reason.trim()}`,
            severity: "WARNING",
            category: "PENJUALAN",
            targetRole: "PEMILIK",
            linkUrl: "/penjualan",
          },
          tx
        );

        return created;
      });

      return NextResponse.json({ amendment });
    }

    if (body.action === "REVIEW") {
      const parsed = reviewAmendmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Keputusan review tidak valid" },
          { status: 400 }
        );
      }

      const canApprove = await checkUserPermission(user.role, "penjualan", "approve");
      if (!canApprove) {
        return NextResponse.json(
          { error: "Anda tidak memiliki kewenangan menyetujui atau menolak pengajuan perubahan transaksi." },
          { status: 403 }
        );
      }

      const { amendmentId, decision, reviewNotes } = parsed.data;
      const amendment = await prisma.saleAmendment.findUnique({
        where: { id: amendmentId },
        include: { sale: { include: { items: true } } },
      });

      if (!amendment) {
        return NextResponse.json({ error: "Data pengajuan tidak ditemukan." }, { status: 404 });
      }

      if (amendment.status !== "MENUNGGU_PERSETUJUAN") {
        return NextResponse.json({ error: "Pengajuan ini sudah diproses sebelumnya." }, { status: 400 });
      }

      // Segregation of duties: Cashier or staff cannot approve their own amendment request
      if (user.role !== "PEMILIK" && amendment.requestedById === user.id) {
        return NextResponse.json(
          { error: "Pemisahan Wewenang: Anda tidak dapat menyetujui pengajuan perubahan transaksi yang Anda buat sendiri." },
          { status: 403 }
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        let nextSaleStatus = "NORMAL";
        if (decision === "DISETUJUI") {
          if (amendment.amendmentType === "PEMBATALAN") {
            nextSaleStatus = "DIBATALKAN";
            for (const item of amendment.sale.items) {
              await restoreStockForSaleItem(tx, {
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
              });
            }
          } else if (amendment.amendmentType === "RETUR") {
            nextSaleStatus = "DIKEMBALIKAN";
            for (const item of amendment.sale.items) {
              await restoreStockForSaleItem(tx, {
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
              });
            }
          } else {
            nextSaleStatus = "DIUBAH";
            if (amendment.proposedPayload) {
              try {
                const payload = JSON.parse(amendment.proposedPayload);
                if (payload.paymentMethod) {
                  await tx.sale.update({
                    where: { id: amendment.saleId },
                    data: { paymentMethod: String(payload.paymentMethod) },
                  });
                }
              } catch {
                // ignore malformed optional payload
              }
            }
          }
        }

        await tx.sale.update({
          where: { id: amendment.saleId },
          data: { status: nextSaleStatus },
        });

        const rev = await tx.saleAmendment.update({
          where: { id: amendment.id },
          data: {
            status: decision,
            reviewedById: user.id,
            reviewNotes: reviewNotes?.trim() || null,
            reviewedAt: new Date(),
          },
        });

        await recordAuditLog(
          {
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PERUBAHAN_TRANSAKSI",
            actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} ${
              amendment.amendmentType
            } struk #${amendment.sale.receiptNumber}`,
            entityType: "SaleAmendment",
            entityId: amendment.id,
            beforeData: { saleStatus: "MENUNGGU_PERSETUJUAN" },
            afterData: {
              decision,
              newSaleStatus: nextSaleStatus,
              stockRestored:
                decision === "DISETUJUI" &&
                (amendment.amendmentType === "PEMBATALAN" || amendment.amendmentType === "RETUR"),
            },
            approvalState: decision,
            linkUrl: "/penjualan",
          },
          tx
        );

        await createNotification(
          {
            title: `Keputusan ${amendment.amendmentType} Struk #${amendment.sale.receiptNumber}`,
            message: `Pengajuan ${amendment.amendmentType} struk #${amendment.sale.receiptNumber} telah ${decision.toLowerCase()} oleh ${user.name}.`,
            severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
            category: "PENJUALAN",
            userId: amendment.requestedById,
            linkUrl: "/penjualan",
          },
          tx
        );

        return rev;
      });

      return NextResponse.json({ amendment: updated });
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses perubahan transaksi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

