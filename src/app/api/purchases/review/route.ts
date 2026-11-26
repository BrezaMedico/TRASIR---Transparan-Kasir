import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const reviewSchema = z.object({
  purchaseId: z.string().min(1),
  decision: z.enum(["DISETUJUI", "PERLU_PERBAIKAN", "DITOLAK"]),
  ownerNotes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    if (!isStoreAdmin(user.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang dapat memutuskan pengajuan pembelian." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Keputusan tidak valid" },
        { status: 400 }
      );
    }

    const { purchaseId, decision, ownerNotes } = parsed.data;

    if (
      (decision === "PERLU_PERBAIKAN" || decision === "DITOLAK") &&
      (!ownerNotes || !ownerNotes.trim())
    ) {
      return NextResponse.json(
        { error: "Catatan perbaikan atau alasan penolakan wajib diisi." },
        { status: 400 }
      );
    }

    const existing = await prisma.purchase.findFirst({
      where: { id: purchaseId, roomId: user.roomId },
      include: { items: true, submittedBy: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pengajuan pembelian tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    if (existing.approvalStatus === "DISETUJUI") {
      return NextResponse.json(
        { error: "Pengajuan pembelian ini sudah disetujui sebelumnya." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.purchase.updateMany({
        where: {
          id: existing.id,
          roomId: user.roomId,
          approvalStatus: { not: "DISETUJUI" },
        },
        data: {
          approvalStatus: decision,
          ownerNotes: ownerNotes?.trim() || null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (claim.count !== 1) {
        throw new Error("CONFLICT:Pengajuan pembelian ini sudah disetujui sebelumnya.");
      }

      if (decision === "DISETUJUI") {
        let defaultCategory = await tx.category.findFirst({
          where: { roomId: user.roomId, areaType: "TERBUKA" },
        });
        if (!defaultCategory) {
          defaultCategory = await tx.category.create({
            data: { roomId: user.roomId, name: "Umum", areaType: "TERBUKA" },
          });
        }

        let defaultWarehouse = await tx.warehouse.findFirst({
          where: { roomId: user.roomId, isDefault: true },
        });
        if (!defaultWarehouse) {
          defaultWarehouse = await tx.warehouse.create({
            data: { roomId: user.roomId, name: "Gudang Utama", isDefault: true },
          });
        }

        for (const item of existing.items) {
          const ratio = item.conversionRatio > 0 ? item.conversionRatio : 1;
          const addedSellUnits = Number((item.quantity * ratio).toFixed(4));
          const costPerSellUnit = Math.max(1, Math.round(item.unitCost / ratio));

          if (item.productId) {
            const prod = await tx.product.findFirst({
              where: { id: item.productId, roomId: user.roomId },
            });
            if (prod) {
              await tx.product.update({
                where: { id: prod.id },
                data: {
                  currentStock: { increment: addedSellUnits },
                  costPrice: costPerSellUnit,
                },
              });

              await tx.productStock.upsert({
                where: {
                  productId_warehouseId: {
                    productId: prod.id,
                    warehouseId: defaultWarehouse.id,
                  },
                },
                update: { quantity: { increment: addedSellUnits } },
                create: {
                  productId: prod.id,
                  warehouseId: defaultWarehouse.id,
                  quantity: addedSellUnits,
                },
              });
              continue;
            }
          }

          const skuCode = `PRD-${Date.now().toString().slice(-5)}-${Math.floor(
            Math.random() * 90 + 10
          )}`;
          const newProd = await tx.product.create({
            data: {
              roomId: user.roomId,
              sku: skuCode,
              name: item.itemName,
              categoryId: defaultCategory.id,
              stockMethod: ratio > 1 ? "PECAH" : "TETAP",
              purchaseUnit: item.unit,
              sellUnit: ratio > 1 ? item.sellUnit : item.unit,
              conversionRatio: ratio,
              costPrice: costPerSellUnit,
              sellPrice: item.sellPrice > 0 ? item.sellPrice : Math.round(costPerSellUnit * 1.3),
              currentStock: addedSellUnits,
            },
          });

          await tx.purchaseItem.update({
            where: { id: item.id },
            data: { productId: newProd.id, isNewProduct: false },
          });

          await tx.productStock.create({
            data: {
              productId: newProd.id,
              warehouseId: defaultWarehouse.id,
              quantity: addedSellUnits,
            },
          });
        }
      }

      const result = await tx.purchase.findUniqueOrThrow({
        where: { id: existing.id },
        include: { items: true },
      });

      const decisionLabel =
        decision === "DISETUJUI"
          ? "Menerima (Menyetujui)"
          : decision === "PERLU_PERBAIKAN"
          ? "Meminta Perbaikan"
          : "Menolak";

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PEMBELIAN",
          actionSummary: `${decisionLabel} pengajuan pembelian #${existing.invoiceNumber} (${existing.supplierName})`,
          entityType: "Purchase",
          entityId: existing.id,
          beforeData: { approvalStatus: existing.approvalStatus },
          afterData: {
            approvalStatus: decision,
            ownerNotes: ownerNotes?.trim() || null,
            stockUpdated: decision === "DISETUJUI",
          },
          approvalState: decision,
          linkUrl: `/pembelian/${existing.id}`,
        },
        tx
      );

      const decisionStatusLabel =
        decision === "DISETUJUI"
          ? "Disetujui"
          : decision === "PERLU_PERBAIKAN"
          ? "Perlu Perbaikan"
          : "Ditolak";

      await createNotification(
        {
          roomId: user.roomId,
          title: `Keputusan Pembelian #${existing.invoiceNumber}: ${decisionStatusLabel}`,
          message:
            decision === "DISETUJUI"
              ? `Pembelian dari ${existing.supplierName} telah disetujui oleh ${user.name}. Stok otomatis ditambahkan ke inventaris.`
              : `Pengajuan pembelian #${existing.invoiceNumber} berstatus ${decisionStatusLabel}. Catatan: ${ownerNotes}`,
          severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
          category: "PEMBELIAN",
          userId: existing.submittedById,
          linkUrl: `/pembelian/${existing.id}`,
        },
        tx
      );

      return result;
    });

    return NextResponse.json({ purchase: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memproses keputusan pembelian.";
    if (message.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: message.slice(9) }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
