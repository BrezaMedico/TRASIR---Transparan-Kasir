import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireAssignedUser } from "@/lib/auth";
import { canViewFinancials } from "@/lib/rbac";
import { getDashboardPayload } from "@/lib/queries/dashboard";

export async function GET(request: Request) {
  try {
    const auth = await requireAssignedUser();
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    // Dashboard memuat data keuntungan kotor -> wajib Pemilik atau Manajer
    if (!canViewFinancials(user.role)) {
      return NextResponse.json(
        {
          error:
            "Akses ditolak. Halaman Dashboard & informasi keuntungan kotor hanya untuk Pemilik dan Manajer.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || searchParams.get("period") || "month";
    const payload = await getDashboardPayload(user.roomId, range);
    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err, "/api/dashboard", "Gagal memuat data dashboard.");
  }
}
