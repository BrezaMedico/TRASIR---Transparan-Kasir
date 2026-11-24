import React, { Suspense } from "react";
import { getServerSessionSnapshot } from "@/lib/server-session";
import { getCatalogPayload } from "@/lib/queries/catalog";
import { ProdukClient } from "@/components/produk/ProdukClient";
import WorkspaceLoading from "../loading";

export const dynamic = "force-dynamic";

async function ProdukDataSection({ roomId }: { roomId: string }) {
  let initialCatalog = null;
  try {
    initialCatalog = await getCatalogPayload(roomId);
  } catch {
    initialCatalog = null;
  }
  return <ProdukClient initialCatalog={initialCatalog} />;
}

export default async function ProdukPage() {
  const snapshot = await getServerSessionSnapshot();
  const user = snapshot.user;
  const canView = Boolean(
    snapshot.permissions?.produk?.canView || snapshot.permissions?.kasir?.canView
  );

  if (!user || !user.isAssigned || !user.roomId || !canView) {
    return <ProdukClient initialCatalog={null} />;
  }

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ProdukDataSection roomId={user.roomId} />
    </Suspense>
  );
}
