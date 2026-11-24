import React from "react";
import { PurchaseDetailView } from "@/components/pembelian/PurchaseDetailView";

export default async function PembelianDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseDetailView purchaseId={id} />;
}

