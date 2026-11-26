import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { getServerSessionSnapshot } from "@/lib/server-session";

export async function GET() {
  try {
    const snapshot = await getServerSessionSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    return handleApiError(err, "/api/auth/me", "Gagal memuat sesi.");
  }
}
