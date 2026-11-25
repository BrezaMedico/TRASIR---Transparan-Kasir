import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { recordAuditLog } from "@/lib/audit";
import { validateProofAttachment } from "@/lib/attachment";
import {
  parseProductRequestEnvelope,
  serializeProductRequestEnvelope,
} from "@/lib/product-request-batch";
import { z } from "zod";

const updateReceiptSchema = z.object({
  batchId: z.string().trim().optional(),
  requestIds: z.array(z.string().min(1)).optional(),
  receiptImageData: z.string().nullable(),
  receiptSource: z.enum(["FISIK", "DIGITAL"]).optional().nullable(),
});

export async function PATCH(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await request.json();
    const parsed = updateReceiptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Data pembaruan nota tidak valid." },
        { status: 400 }
      );
    }

    const { batchId, requestIds, receiptImageData, receiptSource } = parsed.data;
    if (!batchId && (!requestIds || requestIds.length === 0)) {
      return NextResponse.json(
        { error: "Sertakan batchId atau daftar requestIds yang akan diperbarui." },
        { status: 400 }
      );
    }

    const candidates = await prisma.productRequest.findMany({
      where: {
        roomId: user.roomId,
        ...(requestIds && requestIds.length > 0 ? { id: { in: requestIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const batchRows = (
      requestIds && requestIds.length > 0
        ? candidates
        : candidates.filter((row) => parseProductRequestEnvelope(row.variantsJson).batchId === batchId)
    ).sort((a, b) => {
      const idxA = parseProductRequestEnvelope(a.variantsJson).batchIndex ?? Number.MAX_SAFE_INTEGER;
      const idxB = parseProductRequestEnvelope(b.variantsJson).batchIndex ?? Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) return idxA - idxB;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    if (batchRows.length === 0) {
      return NextResponse.json(
        { error: "Paket pengajuan produk tidak ditemukan pada ruangan ini." },
        { status: 404 }
      );
    }

    const isOwnerOfBatch = batchRows.every((row) => row.requestedById === user.id);
    if (!isStoreAdmin(user.role) && !isOwnerOfBatch) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin mengubah lampiran nota pengajuan ini." },
        { status: 403 }
      );
    }

    const hasPendingRow = batchRows.some((row) => row.status === "MENUNGGU_PERSETUJUAN");
    if (!hasPendingRow) {
      return NextResponse.json(
        { error: "Lampiran nota hanya dapat diganti selama pengajuan masih menunggu persetujuan." },
        { status: 400 }
      );
    }

    const trimmedReceipt = receiptImageData?.trim() || "";
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

    const resolvedSource: "FISIK" | "DIGITAL" | null = hasReceipt
      ? receiptSource || "DIGITAL"
      : null;

    const leadRow = batchRows[0];
    const leadEnv = parseProductRequestEnvelope(leadRow.variantsJson);

    await prisma.$transaction(async (tx) => {
      const nextLeadEnv = {
        ...leadEnv,
        receiptImageData: hasReceipt ? trimmedReceipt : null,
        receiptSource: resolvedSource,
        aiScanResult: null,
      };

      await tx.productRequest.update({
        where: { id: leadRow.id },
        data: {
          variantsJson: serializeProductRequestEnvelope(nextLeadEnv),
        },
      });

      // Bersihkan lampiran/hasil cek lama pada baris non-lead agar grup membaca data terbaru dari leadRow
      for (const extraRow of batchRows.slice(1)) {
        const extraEnv = parseProductRequestEnvelope(extraRow.variantsJson);
        if (extraEnv.receiptImageData || extraEnv.receiptSource || extraEnv.aiScanResult) {
          await tx.productRequest.update({
            where: { id: extraRow.id },
            data: {
              variantsJson: serializeProductRequestEnvelope({
                ...extraEnv,
                receiptImageData: null,
                receiptSource: null,
                aiScanResult: null,
              }),
            },
          });
        }
      }

      await recordAuditLog(
        {
          roomId: user.roomId,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: hasReceipt
            ? `${user.name} memperbarui lampiran nota pengajuan (${leadEnv.batchTitle || leadRow.name})`
            : `${user.name} menghapus lampiran nota pengajuan (${leadEnv.batchTitle || leadRow.name})`,
          entityType: "ProductRequestBatch",
          entityId: leadEnv.batchId || leadRow.id,
          afterData: {
            batchId: leadEnv.batchId || null,
            hasReceipt,
            receiptSource: resolvedSource,
          },
          approvalState: "MENUNGGU_PERSETUJUAN",
          linkUrl: "/produk?tab=requests",
        },
        tx
      );
    });

    return NextResponse.json({
      receiptImageData: hasReceipt ? trimmedReceipt : null,
      receiptSource: resolvedSource,
      aiScanResult: null,
      leadRequestId: leadRow.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memperbarui lampiran nota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
