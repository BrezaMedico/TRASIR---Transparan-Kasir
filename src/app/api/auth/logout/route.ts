import { NextResponse } from "next/server";
import { getCurrentSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export async function POST() {
  const user = await getCurrentSessionUser();
  if (user) {
    await recordAuditLog({
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
  }

  const res = NextResponse.json({ success: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

