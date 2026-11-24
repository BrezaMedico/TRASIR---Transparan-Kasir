import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import { getDefaultRedirectForRole } from "@/lib/rbac";
import { getCatalogPayload } from "@/lib/queries/catalog";
import { KasirClient } from "@/components/kasir/KasirClient";
import WorkspaceLoading from "../loading";

export const dynamic = "force-dynamic";

async function KasirDataSection({ roomId }: { roomId: string }) {
  let initialCatalog = null;
  try {
    initialCatalog = await getCatalogPayload(roomId);
  } catch {
    initialCatalog = null;
  }
  return <KasirClient initialCatalog={initialCatalog} />;
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
      <KasirDataSection roomId={user.roomId} />
    </Suspense>
  );
}
