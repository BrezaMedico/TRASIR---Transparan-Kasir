import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { analyzePurchaseReceiptWithGemini, computeReceiptHash } from "@/lib/gemini";
import { z } from "zod";

const purchaseItemSchema = z.object({
  productId: z.string().optional().nullable(),
  isNewProduct: z.boolean().optional(),
  itemName: z.string().min(1, "Nama barang wajib diisi"),
  categoryName: z.string().optional().nullable(),
  quantity: z.number().positive("Jumlah barang harus > 0"),
  unit: z.string().min(1, "Satuan wajib dipilih"),
  conversionRatio: z.number().positive().optional(),
  sellUnit: z.string().optional(),
  unitCost: z.number().int().min(0, "Harga beli tidak boleh negatif"),
  sellPrice: z.number().int().min(0).optional(),
  subtotal: z.number().int().min(0),
});

const purchaseSchema = z.object({
  id: z.string().optional(),
  invoiceNumber: z.string().min(1, "Nomor nota wajib diisi"),
  supplierName: z.string().min(1, "Nama pemasok wajib diisi"),
  purchaseDate: z.string().min(1, "Tanggal pembelian wajib diisi"),
  fundingSource: z.enum(["DANA_TOKO", "BELANJA_PEMILIK"]),
  captureMethod: z.enum(["LIVE_CAMERA", "DIGITAL_UPLOAD"]),
  receiptImageData: z.string().min(10, "Bukti foto/file nota wajib dilampirkan"),
  totalAmount: z.number().int().min(0),
  items: z.array(purchaseItemSchema).min(1, "Minimal 1 barang harus dimasukkan"),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView = await checkUserPermission(user.role, "pembelian", "view");
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengakses modul Pembelian." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const purchase = await prisma.purchase.findFirst({
        where: { id, roomId: user.roomId },
        include: {
          submittedBy: { select: { id: true, name: true, role: true, username: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
          items: { include: { product: true } },
        },
      });
      if (!purchase) {
        return NextResponse.json(
          { error: "Data pembelian tidak ditemukan pada ruangan ini." },
          { status: 404 }
        );
      }
      return NextResponse.json({ purchase });
    }

    const purchases = await prisma.purchase.findMany({
      where: { roomId: user.roomId },
      include: {
        submittedBy: { select: { id: true, name: true, role: true, username: true } },
        reviewedBy: { select: { id: true, name: true, role: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ purchases });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar pembelian.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canCreate = await checkUserPermission(user.role, "pembelian", "create");
    const canEdit = await checkUserPermission(user.role, "pembelian", "edit");
    if (!canCreate && !canEdit) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mencatat atau memperbaiki pengajuan pembelian." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data pembelian tidak lengkap" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const receiptHash = computeReceiptHash(data.receiptImageData);

    const existingDuplicate = await prisma.purchase.findFirst({
      where: {
        roomId: user.roomId,
        id: data.id ? { not: data.id } : undefined,
        OR: [{ invoiceNumber: data.invoiceNumber.trim() }, { receiptHash }],
      },
      select: { id: true, invoiceNumber: true, supplierName: true },
    });

    const aiValidation = await analyzePurchaseReceiptWithGemini({
      supplierName: data.supplierName.trim(),
      invoiceNumber: data.invoiceNumber.trim(),
      purchaseDate: data.purchaseDate,
      totalAmount: data.totalAmount,
      items: data.items.map((it) => ({
        itemName: it.itemName,
        quantity: it.quantity,
        unit: it.unit,
        unitCost: it.unitCost,
        subtotal: it.subtotal,
      })),
      receiptImageData: data.receiptImageData,
      isDuplicateInDatabase: Boolean(existingDuplicate),
      duplicateRef: existingDuplicate
        ? `${existingDuplicate.invoiceNumber} (${existingDuplicate.supplierName})`
        : null,
    });

    const savedPurchase = await prisma.$transaction(async (tx) => {
      if (data.id) {
        const prev = await tx.purchase.findFirst({
          where: { id: data.id, roomId: user.roomId },
        });
        if (!prev) {
          throw new Error("Pengajuan pembelian yang ingin diperbaiki tidak ditemukan.");
        }
        if (prev.approvalStatus === "DISETUJUI") {
          throw new Error("Pembelian yang sudah disetujui tidak dapat diubah langsung.");
        }

        await tx.purchaseItem.deleteMany({ where: { purchaseId: prev.id } });

        const updated = await tx.purchase.update({
          where: { id: prev.id },
          data: {
            invoiceNumber: data.invoiceNumber.trim(),
            supplierName: data.supplierName.trim(),
            purchaseDate: new Date(data.purchaseDate),
            fundingSource: data.fundingSource,
            captureMethod: data.captureMethod,
            receiptImageData: data.receiptImageData,
            receiptHash,
            totalAmount: data.totalAmount,
            aiValidationStatus: aiValidation.status,
            aiExtractedSupplier: aiValidation.extractedSupplier,
            aiExtractedDate: aiValidation.extractedDate,
            aiExtractedTotal: aiValidation.extractedTotal,
            aiAnalysisJson: JSON.stringify(aiValidation),
            approvalStatus: "MENUNGGU_PERSETUJUAN",
            items: {
              create: data.items.map((it, idx) => {
                const aiRow = aiValidation.items[idx];
                return {
                  productId: it.productId || null,
                  isNewProduct: Boolean(it.isNewProduct || !it.productId),
                  itemName: it.itemName.trim(),
                  categoryName: it.categoryName || null,
                  quantity: it.quantity,
                  unit: it.unit,
                  conversionRatio: it.conversionRatio ?? 1,
                  sellUnit: it.sellUnit ?? it.unit,
                  unitCost: it.unitCost,
                  sellPrice: it.sellPrice ?? Math.round(it.unitCost * 1.25),
                  subtotal: it.subtotal,
                  aiExtractedQty: aiRow?.quantity ?? it.quantity,
                  aiExtractedPrice: aiRow?.unitCost ?? it.unitCost,
                  aiDiscrepancyNote: aiRow?.discrepancyNote ?? null,
                };
              }),
            },
          },
          include: { items: true },
        });

        await recordAuditLog(
          {
            roomId: user.roomId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.role,
            actionType: "PEMBELIAN",
            actionSummary: `Mengirim perbaikan pengajuan pembelian #${updated.invoiceNumber} (${updated.supplierName})`,
            entityType: "Purchase",
            entityId: updated.id,
            beforeData: { totalAmount: prev.totalAmount, approvalStatus: prev.approvalStatus },
            afterData: {
              totalAmount: updated.totalAmount,
              aiValidationStatus: updated.aiValidationStatus,
              approvalStatus: updated.approvalStatus,
            },
            approvalState: "MENUNGGU_PERSETUJUAN",
            linkUrl: `/pembelian/${updated.id}`,
          },
          tx
        );

        await createNotification(
          {
            roomId: user.roomId,
            title: `Perbaikan Pembelian #${updated.invoiceNumber}`,
            message: `${user.name} mengirim perbaikan data pembelian dari ${updated.supplierName} (Status AI: ${updated.aiValidationStatus}).`,
            severity: updated.aiValidationStatus === "SESUAI" ? "INFO" : "WARNING",
            category: "PEMBELIAN",
            targetRole: null,
            linkUrl: `/pembelian/${updated.id}`,
          },
          tx
        );

        return updated;
      }

      const created = await tx.purchase.create({
        data: {
          roomId: user.roomId,
          invoiceNumber: data.invoiceNumber.trim(),
          supplierName: data.supplierName.trim(),
          purchaseDate: new Date(data.purchaseDate),
          fundingSource: data.fundingSource,
          captureMethod: data.captureMethod,
          receiptImageData: data.receiptImageData,
          receiptHash,
          totalAmount: data.totalAmount,
          aiValidationStatus: aiValidation.status,
          aiExtractedSupplier: aiValidation.extractedSupplier,
          aiExtractedDate: aiValidation.extractedDate,
          aiExtractedTotal: aiValidation.extractedTotal,
          aiAnalysisJson: JSON.stringify(aiValidation),
          approvalStatus: "MENUNGGU_PERSETUJUAN",
          submittedById: user.id,
          items: {
            create: data.items.map((it, idx) => {
              const aiRow = aiValidation.items[idx];
              return {
                productId: it.productId || null,
                isNewProduct: Boolean(it.isNewProduct || !it.productId),
                itemName: it.itemName.trim(),
                categoryName: it.categoryName || null,
                quantity: it.quantity,
                unit: it.unit,
                conversionRatio: it.conversionRatio ?? 1,
                sellUnit: it.sellUnit ?? it.unit,
                unitCost: it.unitCost,
                sellPrice: it.sellPrice ?? Math.round(it.unitCost * 1.25),
                subtotal: it.subtotal,
                aiExtractedQty: aiRow?.quantity ?? it.quantity,
                aiExtractedPrice: aiRow?.unitCost ?? it.unitCost,
                aiDiscrepancyNote: aiRow?.discrepancyNote ?? null,
              };
            }),
          },
        },
        include: { items: true },
      });

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PEMBELIAN",
          actionSummary: `Mengajukan pembelian baru #${created.invoiceNumber} dari ${created.supplierName} (Validasi AI: ${created.aiValidationStatus})`,
          entityType: "Purchase",
          entityId: created.id,
          afterData: {
            invoiceNumber: created.invoiceNumber,
            supplierName: created.supplierName,
            totalAmount: created.totalAmount,
            aiValidationStatus: created.aiValidationStatus,
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: `/pembelian/${created.id}`,
        },
        tx
      );

      await createNotification(
        {
          roomId: user.roomId,
          title:
            created.aiValidationStatus === "SESUAI"
              ? `Pengajuan Pembelian Baru #${created.invoiceNumber}`
              : `Nota Perlu Diperiksa (${created.aiValidationStatus}) #${created.invoiceNumber}`,
          message: `${user.name} mengajukan pembelian dari ${created.supplierName}. ${aiValidation.neutralEvaluationSummary}`,
          severity: created.aiValidationStatus === "SESUAI" ? "INFO" : "WARNING",
          category: "PEMBELIAN",
          targetRole: null,
          linkUrl: `/pembelian/${created.id}`,
        },
        tx
      );

      return created;
    });

    return NextResponse.json({
      purchase: savedPurchase,
      aiValidation,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan pengajuan pembelian.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
