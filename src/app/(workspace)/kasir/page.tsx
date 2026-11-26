import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import { getDefaultRedirectForRole } from "@/lib/rbac";
import { getCatalogPayload } from "@/lib/queries/catalog";
import { getActiveShiftForUser } from "@/lib/queries/shift";
import { getRoomCountersWithLiveStatus } from "@/lib/queries/counters";
import { KasirClient } from "@/components/kasir/KasirClient";
import WorkspaceLoading from "../loading";

export const dynamic = "force-dynamic";

async function KasirDataSection({ roomId, userId }: { roomId: string; userId: string }) {
  const [initialCatalog, initialActiveShift, initialCounters] = await Promise.all([
    getCatalogPayload(roomId).catch(() => null),
    getActiveShiftForUser(roomId, userId).catch(() => null),
    getRoomCountersWithLiveStatus(roomId).catch(() => []),
  ]);
  return (
    <KasirClient
      initialCatalog={initialCatalog}
      initialActiveShift={initialActiveShift}
      initialCounters={initialCounters}
    />
  );
}

export default async function KasirPage() {
  const snapshot = await getServerSessionSnapshot();
  const user = snapshot.user;
  const canView = Boolean(snapshot.permissions?.kasir?.canView);

  if (user && user.isAssigned && user.roomId && !canView) {
    redirect(getDefaultRedirectForRole(user.role, true));
  }

  if (!user || !user.isAssigned || !user.roomId || !canView) {
    return <KasirClient initialCatalog={null} />;
  }

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <KasirDataSection roomId={user.roomId} userId={user.id} />
    </Suspense>
  );
}
