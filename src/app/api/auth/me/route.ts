import { NextResponse } from "next/server";
import { getServerSessionSnapshot } from "@/lib/server-session";

export async function GET() {
  try {
    const snapshot = await getServerSessionSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat sesi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
