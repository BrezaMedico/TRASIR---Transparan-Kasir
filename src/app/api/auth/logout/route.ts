import { NextResponse } from "next/server";
import { getCurrentSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST() {
  const user = await getCurrentSessionUser();
  if (user) {
    try {
      await recordAuditLog({
        roomId: user.roomId,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        actionType: "LOGIN",
        actionSummary: `${user.name} (${user.role}) keluar (logout) dari sistem`,
        entityType: "Session",
        entityId: user.id,
        approvalState: "TERCATAT",
        linkUrl: "/aktivitas",
      });
    } catch {
      // Abaikan kegagalan log audit sementara agar proses keluar tetap tuntas
    }
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

