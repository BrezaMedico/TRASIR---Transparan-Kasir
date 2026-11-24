import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import { canViewFinancials, getDefaultRedirectForRole } from "@/lib/rbac";
import { getDashboardPayload } from "@/lib/queries/dashboard";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import WorkspaceLoading from "../loading";

export const dynamic = "force-dynamic";

async function DashboardDataSection({ roomId }: { roomId: string }) {
  let initialData = null;
  try {
    initialData = await getDashboardPayload(roomId, "month");
  } catch {
    initialData = null;
  }
  return <DashboardClient initialData={initialData} />;
}

export default async function DashboardPage() {
  const snapshot = await getServerSessionSnapshot();
  const user = snapshot.user;
  if (user && user.isAssigned && user.roomId && !canViewFinancials(user.role)) {
    redirect(getDefaultRedirectForRole(user.role, true));
  }

  if (!user || !user.isAssigned || !user.roomId) {
    return <DashboardClient initialData={null} />;
  }

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <DashboardDataSection roomId={user.roomId} />
    </Suspense>
  );
}
