import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { validateProofAttachment } from "@/lib/attachment";
import { computeReceiptHash } from "@/lib/gemini";
import { formatRupiah } from "@/lib/format";
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
  captureMethod: z.enum(["LIVE_CAMERA", "DIGITAL_UPLOAD", "TANPA_NOTA"]).optional().default("TANPA_NOTA"),
  receiptImageData: z.string().optional().nullable(),
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
    const trimmedReceipt = data.receiptImageData?.trim() || "";
    const hasReceipt = trimmedReceipt.length > 0;

    if (hasReceipt) {
      const proofCheck = validateProofAttachment(trimmedReceipt);
      if (!proofCheck.valid) {
        return NextResponse.json(
          { error: proofCheck.error || "Format lampiran nota tidak valid." },
          { status: 400 }
        );
      }
    }

    const receiptHash = hasReceipt ? computeReceiptHash(trimmedReceipt) : null;
    const resolvedCaptureMethod = hasReceipt
      ? data.captureMethod === "TANPA_NOTA"
        ? "DIGITAL_UPLOAD"
        : data.captureMethod
      : "TANPA_NOTA";
    const initialAiStatus = hasReceipt ? "BELUM_DICEK" : "TANPA_NOTA";

    const savedPurchase = await prisma.$transaction(async (tx) => {
      if (data.id) {
        if (!canEdit) {
          throw new Error("FORBIDDEN:Anda tidak memiliki izin mengubah pengajuan pembelian.");
        }
        const prev = await tx.purchase.findFirst({
          where: { id: data.id, roomId: user.roomId },
        });
        if (!prev) {
          throw new Error("Pengajuan pembelian yang ingin diperbaiki tidak ditemukan.");
        }
        if (prev.approvalStatus === "DISETUJUI") {
          throw new Error("BAD_REQUEST:Pembelian yang sudah disetujui tidak dapat diubah langsung.");
        }
        if (!isStoreAdmin(user.role) && prev.submittedById !== user.id) {
          throw new Error(
            "FORBIDDEN:Anda hanya dapat memperbaiki pengajuan pembelian milik Anda sendiri."
          );
        }
        if (
          prev.approvalStatus !== "MENUNGGU_PERSETUJUAN" &&
          prev.approvalStatus !== "PERLU_PERBAIKAN"
        ) {
          throw new Error(
            "BAD_REQUEST:Hanya pengajuan berstatus Menunggu Persetujuan atau Perlu Perbaikan yang dapat diubah."
          );
        }

        await tx.purchaseItem.deleteMany({ where: { purchaseId: prev.id } });

        const updated = await tx.purchase.update({
          where: { id: prev.id },
          data: {
            invoiceNumber: data.invoiceNumber.trim(),
            supplierName: data.supplierName.trim(),
            purchaseDate: new Date(data.purchaseDate),
            fundingSource: data.fundingSource,
            captureMethod: resolvedCaptureMethod,
            receiptImageData: trimmedReceipt,
            receiptHash,
            totalAmount: data.totalAmount,
            aiValidationStatus: initialAiStatus,
            aiExtractedSupplier: null,
            aiExtractedDate: null,
            aiExtractedTotal: null,
            aiAnalysisJson: null,
            approvalStatus: "MENUNGGU_PERSETUJUAN",
            items: {
              create: data.items.map((it) => ({
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
                aiExtractedQty: null,
                aiExtractedPrice: null,
                aiDiscrepancyNote: null,
              })),
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
            actionSummary: `Mengirim perbaikan pembelian #${updated.invoiceNumber} dari ${updated.supplierName}${
              hasReceipt ? " dengan lampiran nota" : " tanpa nota"
            }`,
            entityType: "Purchase",
            entityId: updated.id,
            beforeData: { totalAmount: prev.totalAmount, approvalStatus: prev.approvalStatus },
            afterData: {
              totalAmount: updated.totalAmount,
              hasReceipt,
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
            message: `${user.name} mengirim perbaikan pembelian dari ${updated.supplierName} senilai ${formatRupiah(
              updated.totalAmount
            )}${hasReceipt ? " beserta lampiran nota." : " tanpa lampiran nota."}`,
            severity: "INFO",
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
          captureMethod: resolvedCaptureMethod,
          receiptImageData: trimmedReceipt,
          receiptHash,
          totalAmount: data.totalAmount,
          aiValidationStatus: initialAiStatus,
          aiExtractedSupplier: null,
          aiExtractedDate: null,
          aiExtractedTotal: null,
          aiAnalysisJson: null,
          approvalStatus: "MENUNGGU_PERSETUJUAN",
          submittedById: user.id,
          items: {
            create: data.items.map((it) => ({
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
              aiExtractedQty: null,
              aiExtractedPrice: null,
              aiDiscrepancyNote: null,
            })),
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
          actionSummary: `Mengajukan pembelian #${created.invoiceNumber} dari ${created.supplierName}${
            hasReceipt ? " dengan lampiran nota" : " tanpa nota"
          }`,
          entityType: "Purchase",
          entityId: created.id,
          afterData: {
            invoiceNumber: created.invoiceNumber,
            supplierName: created.supplierName,
            totalAmount: created.totalAmount,
            hasReceipt,
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: `/pembelian/${created.id}`,
        },
        tx
      );

      await createNotification(
        {
          roomId: user.roomId,
          title: `Pengajuan Pembelian #${created.invoiceNumber}`,
          message: `${user.name} mengajukan pembelian dari ${created.supplierName} senilai ${formatRupiah(
            created.totalAmount
          )}${hasReceipt ? " beserta lampiran nota." : " tanpa lampiran nota."}`,
          severity: "INFO",
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan pengajuan pembelian.";
    if (message.startsWith("FORBIDDEN:")) {
      return NextResponse.json({ error: message.slice(10) }, { status: 403 });
    }
    if (message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: message.slice(12) }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
