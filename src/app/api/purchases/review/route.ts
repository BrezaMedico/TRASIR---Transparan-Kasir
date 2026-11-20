import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSessionUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const reviewSchema = z.object({
  purchaseId: z.string().min(1),
  decision: z.enum(["DISETUJUI", "PERLU_PERBAIKAN", "DITOLAK"]),
  ownerNotes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canApprove = await checkUserPermission(user.role, "pembelian", "approve");
    if (!canApprove) {
      return NextResponse.json(
        { error: "Hanya Pemilik (atau pejabat dengan izin persetujuan aktif) yang dapat memutuskan pengajuan pembelian." },
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

    if ((decision === "PERLU_PERBAIKAN" || decision === "DITOLAK") && (!ownerNotes || !ownerNotes.trim())) {
      return NextResponse.json(
        { error: "Catatan perbaikan atau alasan penolakan wajib diisi." },
        { status: 400 }
      );
    }

    const existing = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: true, submittedBy: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Pengajuan pembelian tidak ditemukan." }, { status: 404 });
    }

    if (existing.approvalStatus === "DISETUJUI") {
      return NextResponse.json(
        { error: "Pengajuan pembelian ini sudah disetujui sebelumnya." },
        { status: 400 }
      );
    }

    // Segregation of duties: non-owner cannot approve their own purchase
    if (user.role !== "PEMILIK" && existing.submittedById === user.id) {
      return NextResponse.json(
        { error: "Pemisahan Wewenang: Anda tidak dapat menyetujui pengajuan pembelian yang Anda buat sendiri." },
        { status: 403 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Only when decision === "DISETUJUI", stock increases in Inventory (Page 7), new products register in Catalog (Page 6), and expense counts in Financial Report (Page 8)
      if (decision === "DISETUJUI") {
        let defaultCategory = await tx.category.findFirst({ where: { areaType: "TERBUKA" } });
        if (!defaultCategory) {
          defaultCategory = await tx.category.create({
            data: { name: "Umum", areaType: "TERBUKA" },
          });
        }

        let defaultWarehouse = await tx.warehouse.findFirst({ where: { isDefault: true } });
        if (!defaultWarehouse) {
          defaultWarehouse = await tx.warehouse.create({
            data: { name: "Gudang Utama", isDefault: true },
          });
        }

        for (const item of existing.items) {
          const ratio = item.conversionRatio > 0 ? item.conversionRatio : 1;
          const addedSellUnits = Number((item.quantity * ratio).toFixed(4));
          const costPerSellUnit = Math.max(1, Math.round(item.unitCost / ratio));

          if (item.productId) {
            const prod = await tx.product.findUnique({ where: { id: item.productId } });
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

          // New product added inline during purchase entry -> automatically register to Page 6 Catalog upon Owner approval
          const skuCode = `PRD-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 90 + 10)}`;
          const newProd = await tx.product.create({
            data: {
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

      const result = await tx.purchase.update({
        where: { id: existing.id },
        data: {
          approvalStatus: decision,
          ownerNotes: ownerNotes?.trim() || null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
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

      await createNotification(
        {
          title: `Keputusan Pembelian #${existing.invoiceNumber}: ${decision.replace("_", " ")}`,
          message:
            decision === "DISETUJUI"
              ? `Pembelian dari ${existing.supplierName} telah disetujui oleh ${user.name}. Stok otomatis ditambahkan ke inventaris.`
              : `Pengajuan pembelian #${existing.invoiceNumber} berstatus ${decision.replace("_", " ")}. Catatan: ${ownerNotes}`,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

