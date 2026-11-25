import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { restoreStockForSaleItem } from "@/lib/inventory";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { validateProofAttachment } from "@/lib/attachment";
import { z } from "zod";

const requestAmendmentSchema = z.object({
  action: z.literal("REQUEST"),
  saleId: z.string().min(1, "ID transaksi wajib disertakan."),
  amendmentType: z.enum(["PEMBATALAN", "RETUR", "PERUBAHAN"]).default("PEMBATALAN"),
  reason: z
    .string()
    .trim()
    .min(5, "Alasan pembatalan atau koreksi wajib diisi minimal 5 karakter.")
    .max(600, "Alasan maksimal 600 karakter."),
  proofImageData: z.string().optional().nullable(),
  proposedPayload: z.string().optional().nullable(),
});

const reviewAmendmentSchema = z.object({
  action: z.literal("REVIEW"),
  amendmentId: z.string().min(1, "ID pengajuan wajib disertakan."),
  decision: z.enum(["DISETUJUI", "DITOLAK"]),
  reviewNotes: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();

    if (body.action === "REQUEST") {
      const canRequest =
        (await checkUserPermission(user.role, "penjualan", "create")) ||
        (await checkUserPermission(user.role, "penjualan", "view"));
      if (!canRequest) {
        return NextResponse.json(
          { error: "Anda tidak memiliki izin mengajukan pembatalan transaksi." },
          { status: 403 }
        );
      }

      const parsed = requestAmendmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Data pengajuan tidak lengkap." },
          { status: 400 }
        );
      }

      const { saleId, amendmentType, reason, proofImageData, proposedPayload } = parsed.data;

      // Validasi tipe file dan ukuran lampiran bukti pendukung (opsional)
      const proofCheck = validateProofAttachment(proofImageData);
      if (!proofCheck.valid) {
        return NextResponse.json({ error: proofCheck.error }, { status: 400 });
      }

      const sale = await prisma.sale.findFirst({
        where: { id: saleId, roomId: user.roomId },
        include: { items: true },
      });

      if (!sale) {
        return NextResponse.json(
          { error: "Transaksi tidak ditemukan pada ruangan ini." },
          { status: 404 }
        );
      }

      if (!isStoreAdmin(user.role) && sale.cashierId !== user.id) {
        return NextResponse.json(
          { error: "Anda hanya dapat mengajukan pembatalan pada transaksi yang Anda catat." },
          { status: 403 }
        );
      }

      // Cegah pembatalan ganda pada transaksi yang sudah dibatalkan/dikembalikan
      if (sale.status === "DIBATALKAN" || sale.status === "DIKEMBALIKAN") {
        return NextResponse.json(
          {
            error:
              "Transaksi ini sudah berstatus dibatalkan atau dikembalikan dan tidak dapat dibatalkan ulang.",
          },
          { status: 409 }
        );
      }

      // Cegah pengajuan ganda yang masih menunggu persetujuan untuk transaksi yang sama
      const existingPending = await prisma.saleAmendment.findFirst({
        where: {
          saleId: sale.id,
          roomId: user.roomId,
          status: "MENUNGGU_PERSETUJUAN",
        },
        select: { id: true },
      });

      if (existingPending) {
        return NextResponse.json(
          {
            error:
              "Transaksi ini sudah memiliki pengajuan yang sedang menunggu persetujuan Pemilik atau Manajer.",
          },
          { status: 409 }
        );
      }

      // Jangan mengubah stok maupun perhitungan keuntungan sebelum disetujui
      const amendment = await prisma.$transaction(async (tx) => {
        const created = await tx.saleAmendment.create({
          data: {
            roomId: user.roomId,
            saleId: sale.id,
            amendmentType,
            reason: reason.trim(),
            proofImageData: proofImageData?.trim() || null,
            proofMimeType: proofCheck.mimeType,
            proposedPayload: proposedPayload || null,
            status: "MENUNGGU_PERSETUJUAN",
            requestedById: user.id,
          },
          include: {
            requestedBy: { select: { id: true, name: true, role: true } },
            sale: { select: { id: true, receiptNumber: true, totalAmount: true, status: true } },
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { status: "MENUNGGU_PERSETUJUAN" },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PERUBAHAN_TRANSAKSI",
            actionSummary: `Mengajukan ${amendmentType} untuk struk #${sale.receiptNumber}: "${reason.trim()}"`,
            entityType: "SaleAmendment",
            entityId: created.id,
            beforeData: { saleStatus: sale.status, totalAmount: sale.totalAmount },
            afterData: {
              amendmentType,
              reason: reason.trim(),
              hasProof: Boolean(proofImageData),
              proofMimeType: proofCheck.mimeType,
              status: "MENUNGGU_PERSETUJUAN",
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: "/penjualan",
          },
          tx
        );

        const amendmentLabelMap: Record<string, string> = {
          PEMBATALAN: "Pembatalan",
          RETUR: "Retur",
          PERUBAHAN: "Perubahan",
        };
        const amendLabel = amendmentLabelMap[amendmentType] || amendmentType;

        await createNotification(
          {
            roomId: user.roomId,
            title: `Pengajuan ${amendLabel} Struk #${sale.receiptNumber}`,
            message: `${user.name} mengajukan ${amendLabel} untuk struk #${sale.receiptNumber}. Alasan: ${reason.trim()}`,
            severity: "WARNING",
            category: "PENJUALAN",
            targetRole: null,
            linkUrl: "/penjualan",
          },
          tx
        );

        return created;
      });

      return NextResponse.json({ amendment }, { status: 201 });
    }

    if (body.action === "REVIEW") {
      const parsed = reviewAmendmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Keputusan review tidak valid." },
          { status: 400 }
        );
      }

      // Persetujuan hanya dapat dilakukan oleh Pemilik atau Manajer ruangan
      if (!isStoreAdmin(user.role)) {
        return NextResponse.json(
          {
            error:
              "Hanya Pemilik atau Manajer yang berwenang menyetujui atau menolak pengajuan pembatalan transaksi.",
          },
          { status: 403 }
        );
      }

      const { amendmentId, decision, reviewNotes } = parsed.data;
      const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");

      const updated = await prisma.$transaction(
        async (tx) => {
          const amendment = await tx.saleAmendment.findFirst({
            where: { id: amendmentId, roomId: user.roomId },
            include: { sale: { include: { items: true } } },
          });

          if (!amendment) {
            throw new Error("NOT_FOUND:Data pengajuan pembatalan tidak ditemukan pada ruangan ini.");
          }

          if (amendment.status !== "MENUNGGU_PERSETUJUAN") {
            throw new Error(
              `CONFLICT:Pengajuan ini sudah diproses sebelumnya (${amendment.status}).`
            );
          }

          // Aturan keamanan audit: Pengaju TIDAK BOLEH menyetujui atau menolak permintaannya sendiri
          if (amendment.requestedById === user.id) {
            throw new Error(
              "FORBIDDEN:Pengaju tidak diperbolehkan memutuskan permintaannya sendiri. Persetujuan harus dilakukan oleh Pemilik atau Manajer lain."
            );
          }

          if (
            decision === "DISETUJUI" &&
            (amendment.sale.status === "DIBATALKAN" || amendment.sale.status === "DIKEMBALIKAN")
          ) {
            throw new Error(
              "CONFLICT:Transaksi ini sudah dibatalkan sebelumnya sehingga pembatalan ganda ditolak."
            );
          }

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
                  // abaikan payload opsional yang tidak valid
                }
              }
            }
          }

          await tx.sale.update({
            where: { id: amendment.saleId },
            data: { status: nextSaleStatus },
          });

          const reviewedAt = new Date();
          const rev = await tx.saleAmendment.update({
            where: { id: amendment.id },
            data: {
              status: decision,
              reviewedById: user.id,
              reviewNotes: reviewNotes?.trim() || null,
              reviewedAt,
            },
            include: {
              requestedBy: { select: { id: true, name: true, role: true } },
              reviewedBy: { select: { id: true, name: true, role: true } },
              sale: { select: { id: true, receiptNumber: true, status: true, totalAmount: true } },
            },
          });

          await recordAuditLog(
            {
              roomId: user.roomId,
              actorId: user.id,
              actorName: user.name,
              actorRole: user.role,
              actionType: "PERUBAHAN_TRANSAKSI",
              actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} ${
                amendment.amendmentType
              } struk #${amendment.sale.receiptNumber}`,
              entityType: "SaleAmendment",
              entityId: amendment.id,
              beforeData: {
                saleStatus: amendment.sale.status,
                requestedById: amendment.requestedById,
              },
              afterData: {
                decision,
                reviewedById: user.id,
                reviewedAt: reviewedAt.toISOString(),
                reviewNotes: reviewNotes?.trim() || null,
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

          const reviewedAmendLabelMap: Record<string, string> = {
            PEMBATALAN: "Pembatalan",
            RETUR: "Retur",
            PERUBAHAN: "Perubahan",
          };
          const reviewedAmendLabel =
            reviewedAmendLabelMap[amendment.amendmentType] || amendment.amendmentType;

          await createNotification(
            {
              roomId: user.roomId,
              title: `Keputusan ${reviewedAmendLabel} Struk #${amendment.sale.receiptNumber}`,
              message: `Pengajuan ${reviewedAmendLabel} struk #${amendment.sale.receiptNumber} telah ${
                decision === "DISETUJUI" ? "disetujui" : "ditolak"
              } oleh ${user.name}.${reviewNotes?.trim() ? ` Catatan: ${reviewNotes.trim()}` : ""}`,
              severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
              category: "PENJUALAN",
              userId: amendment.requestedById,
              linkUrl: "/penjualan",
            },
            tx
          );

          return rev;
        },
        isPostgres
          ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }
          : undefined
      );

      return NextResponse.json({ amendment: updated });
    }

    return NextResponse.json({ error: "Action tidak dikenali." }, { status: 400 });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Gagal memproses perubahan transaksi.";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: rawMsg.replace("FORBIDDEN:", "") }, { status: 403 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return NextResponse.json({ error: rawMsg }, { status: 500 });
  }
}
