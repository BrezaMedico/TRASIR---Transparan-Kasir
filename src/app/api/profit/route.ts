import { NextResponse } from "next/server";
import { requireAssignedUser } from "@/lib/auth";
import { canViewFinancials } from "@/lib/rbac";
import { getGrossProfitReport } from "@/lib/queries/profit";

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    // Informasi keuntungan kotor hanya boleh diakses oleh Pemilik dan Manajer
    if (!canViewFinancials(user.role)) {
      return NextResponse.json(
        {
          error:
            "Akses ditolak. Informasi keuntungan kotor hanya tersedia untuk Pemilik dan Manajer.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || searchParams.get("range") || "month";

    const report = await getGrossProfitReport(user.roomId, period);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat laporan keuntungan kotor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

