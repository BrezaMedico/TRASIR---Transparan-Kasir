import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { isStoreAdmin } from "@/lib/rbac";
import { applyApprovedProductRequest } from "@/lib/inventory";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { z } from "zod";

const reviewSchema = z.object({
  decision: z.enum(["DISETUJUI", "DITOLAK"], {
    error: "Keputusan harus DISETUJUI atau DITOLAK.",
  }),
  rejectionReason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const reviewer = auth.user;

    // Hanya Pemilik atau Manajer yang boleh menyetujui/menolak pengajuan produk baru
    if (!isStoreAdmin(reviewer.role)) {
      return NextResponse.json(
        { error: "Hanya Pemilik atau Manajer yang berwenang memutuskan pengajuan produk baru." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Keputusan review tidak valid." },
        { status: 400 }
      );
    }

    const { decision, rejectionReason } = parsed.data;
    const now = new Date();
    const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgres");

    const result = await prisma.$transaction(
      async (tx) => {
        const reqRow = await tx.productRequest.findUnique({
          where: { id },
          include: {
            category: true,
            requestedBy: { select: { id: true, name: true, username: true, role: true } },
          },
        });

        if (!reqRow || reqRow.roomId !== reviewer.roomId) {
          throw new Error("NOT_FOUND:Pengajuan produk tidak ditemukan pada ruangan ini.");
        }

        if (reqRow.status !== "MENUNGGU_PERSETUJUAN") {
          throw new Error(
            `CONFLICT:Pengajuan produk ini sudah diproses sebelumnya (${reqRow.status}).`
          );
        }

        const cleanReason = decision === "DITOLAK" ? rejectionReason?.trim() || null : null;
        const claim = await tx.productRequest.updateMany({
          where: {
            id: reqRow.id,
            roomId: reviewer.roomId,
            status: "MENUNGGU_PERSETUJUAN",
          },
          data: {
            status: decision,
            reviewedById: reviewer.id,
            reviewedAt: now,
            rejectionReason: cleanReason,
          },
        });
        if (claim.count !== 1) {
          throw new Error("CONFLICT:Pengajuan produk ini sudah diproses sebelumnya.");
        }

        let approvedProduct = null;

      if (decision === "DISETUJUI") {
        approvedProduct = await applyApprovedProductRequest(tx, {
          roomId: reviewer.roomId,
          reqRow,
        });
      }

      const updatedRequest =
        approvedProduct !== null
          ? await tx.productRequest.update({
              where: { id: reqRow.id },
              data: { approvedProductId: approvedProduct.id },
              include: {
                category: { select: { id: true, name: true, areaType: true } },
                requestedBy: { select: { id: true, name: true, username: true, role: true } },
                reviewedBy: { select: { id: true, name: true, username: true, role: true } },
              },
            })
          : await tx.productRequest.findUniqueOrThrow({
              where: { id: reqRow.id },
              include: {
                category: { select: { id: true, name: true, areaType: true } },
                requestedBy: { select: { id: true, name: true, username: true, role: true } },
                reviewedBy: { select: { id: true, name: true, username: true, role: true } },
              },
            });

      await recordAuditLog(
        {
          roomId: reviewer.roomId,
          actorId: reviewer.id,
          actorName: reviewer.name,
          actorRole: reviewer.role,
          actionType: "PRODUCT_REQUEST",
          actionSummary: `${decision === "DISETUJUI" ? "Menyetujui" : "Menolak"} pengajuan produk "${reqRow.name}" (SKU: ${reqRow.sku}) dari ${reqRow.requestedBy.name}`,
          entityType: "ProductRequest",
          entityId: reqRow.id,
          beforeData: { status: "MENUNGGU_PERSETUJUAN" },
          afterData: {
            status: decision,
            approvedProductId: approvedProduct?.id ?? null,
            rejectionReason: updatedRequest.rejectionReason,
          },
          approvalState: decision,
          linkUrl: "/produk",
        },
        tx
      );

      await createNotification(
        {
          roomId: reviewer.roomId,
          title:
            decision === "DISETUJUI"
              ? `Pengajuan Produk Disetujui: ${reqRow.name}`
              : `Pengajuan Produk Ditolak: ${reqRow.name}`,
          message:
            decision === "DISETUJUI"
              ? `Produk "${reqRow.name}" telah disetujui oleh ${reviewer.name} dan kini aktif di katalog.`
              : `Pengajuan produk "${reqRow.name}" ditolak oleh ${reviewer.name}.${
                  updatedRequest.rejectionReason ? ` Alasan: ${updatedRequest.rejectionReason}` : ""
                }`,
          severity: decision === "DISETUJUI" ? "INFO" : "WARNING",
          category: "KATALOG",
          userId: reqRow.requestedById,
          linkUrl: "/produk",
        },
        tx
      );

      return { productRequest: updatedRequest, product: approvedProduct };
    },
      isPostgres
        ? { isolationLevel: "Serializable", maxWait: 20000, timeout: 30000 }
        : undefined
    );

    return NextResponse.json(result);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2034"
    ) {
      return NextResponse.json(
        { error: "Pengajuan produk sedang diproses bersamaan. Silakan muat ulang." },
        { status: 409 }
      );
    }
    const rawMsg = err instanceof Error ? err.message : "";
    if (rawMsg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ error: rawMsg.replace("NOT_FOUND:", "") }, { status: 404 });
    }
    if (rawMsg.startsWith("CONFLICT:")) {
      return NextResponse.json({ error: rawMsg.replace("CONFLICT:", "") }, { status: 409 });
    }
    return handleApiError(err, "/api/product-requests/[id]/review", "Gagal memproses keputusan produk.");
  }
}

