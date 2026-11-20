import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export interface AuditInput {
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  actionType:
    | "LOGIN"
    | "PEMBELIAN"
    | "PENJUALAN"
    | "PERUBAHAN_TRANSAKSI"
    | "PERUBAHAN_STOK"
    | "STOK_OPNAME"
    | "KATALOG"
    | "HAK_AKSES"
    | "PENGATURAN";
  actionSummary: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  approvalState?: "MENUNGGU_PERSETUJUAN" | "DISETUJUI" | "DITOLAK" | "PERLU_PERBAIKAN" | "TERCATAT";
  linkUrl?: string | null;
}

export async function recordAuditLog(
  input: AuditInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      actionType: input.actionType,
      actionSummary: input.actionSummary,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeData: input.beforeData !== undefined ? JSON.stringify(input.beforeData) : null,
      afterData: input.afterData !== undefined ? JSON.stringify(input.afterData) : null,
      approvalState: input.approvalState ?? "TERCATAT",
      linkUrl: input.linkUrl ?? null,
    },
  });
}

export interface NotificationInput {
  title: string;
  message: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  category: "PEMBELIAN" | "PENJUALAN" | "STOK_OPNAME" | "PERUBAHAN_STOK" | "SHIFT" | "SISTEM";
  targetRole?: string | null;
  userId?: string | null;
  linkUrl: string;
}

export async function createNotification(
  input: NotificationInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.notification.create({
    data: {
      title: input.title,
      message: input.message,
      severity: input.severity ?? "INFO",
      category: input.category,
      targetRole: input.targetRole ?? null,
      userId: input.userId ?? null,
      linkUrl: input.linkUrl,
    },
  });
}

