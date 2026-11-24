import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAssignedUser } from "@/lib/auth";
import { checkUserPermission, isStoreAdmin } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const canView =
      (await checkUserPermission(user.role, "produk", "view")) ||
      (await checkUserPermission(user.role, "produk", "create"));
    if (!canView) {
      return NextResponse.json(
        { error: "Anda tidak memiliki izin melihat pengajuan produk." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const whereClause: Record<string, unknown> = {
      roomId: user.roomId,
    };

    // Pegawai hanya melihat pengajuan miliknya sendiri; Pemilik & Manajer melihat seluruh ruangan
    if (!isStoreAdmin(user.role)) {
      whereClause.requestedById = user.id;
    }

    if (
      statusFilter &&
      ["MENUNGGU_PERSETUJUAN", "DISETUJUI", "DITOLAK"].includes(statusFilter)
    ) {
      whereClause.status = statusFilter;
    }

    const requests = await prisma.productRequest.findMany({
      where: whereClause,
      include: {
        category: { select: { id: true, name: true, areaType: true } },
        requestedBy: { select: { id: true, name: true, username: true, role: true } },
        reviewedBy: { select: { id: true, name: true, username: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const pendingCount = requests.filter((r) => r.status === "MENUNGGU_PERSETUJUAN").length;

    return NextResponse.json({ requests, pendingCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat daftar pengajuan produk.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Status pengajuan produk hanya dapat diproses melalui endpoint review Pemilik/Manajer." },
    { status: 403 }
  );
}

