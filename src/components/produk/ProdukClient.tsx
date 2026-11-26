"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { invalidateCache } from "@/lib/client-cache";
import { isStoreAdmin } from "@/lib/rbac-shared";
import { groupProductRequestsIntoBatches } from "@/lib/product-request-batch";
import type { InitialProdukCatalog, ProductItem } from "./types";
import { RawMaterialDrawer } from "./RawMaterialDrawer";
import { ProductDrawer } from "./ProductDrawer";
import { ProposalCartDrawer } from "./ProposalCartDrawer";
import { ProductBatchReviewDrawer } from "./ProductBatchReviewDrawer";
import { PRODUK_PAGE_STEP, useProdukCatalog } from "./useProdukCatalog";
import { ProdukHeaderControls, type ProdukTabKey } from "./ProdukHeaderControls";
import { ProdukCatalogTab } from "./ProdukCatalogTab";
import { ProdukMaterialsTab } from "./ProdukMaterialsTab";
import { ProdukRequestsTab } from "./ProdukRequestsTab";
import { ProdukModals } from "./ProdukModals";

export function ProdukClient({
  initialCatalog = null,
}: {
  initialCatalog?: InitialProdukCatalog | null;
}) {
  const catalog = useProdukCatalog(initialCatalog);

  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [reqStatusFilter, setReqStatusFilter] = useState("ALL");
  const [catalogLimit, setCatalogLimit] = useState(PRODUK_PAGE_STEP);
  const [materialsLimit, setMaterialsLimit] = useState(PRODUK_PAGE_STEP);
  const [requestsLimit, setRequestsLimit] = useState(PRODUK_PAGE_STEP);

  const [materialDrawerOpen, setMaterialDrawerOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ProductItem | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  useEffect(() => {
    setCatalogLimit(PRODUK_PAGE_STEP);
  }, [search, methodFilter]);

  useEffect(() => {
    setMaterialsLimit(PRODUK_PAGE_STEP);
  }, [search]);

  useEffect(() => {
    setRequestsLimit(PRODUK_PAGE_STEP);
  }, [search, reqStatusFilter]);

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialDrawerOpen(true);
  };
  const openEditMaterial = (mat: ProductItem) => {
    setEditingMaterial(mat);
    setMaterialDrawerOpen(true);
  };
  const openAddProduct = () => {
    setEditingProduct(null);
    setProductDrawerOpen(true);
  };
  const openEditProduct = (prod: ProductItem) => {
    setEditingProduct(prod);
    setProductDrawerOpen(true);
  };

  return (
    <AppShell>
      {(session) => {
        catalog.activeCartRoomRef.current = session.user.roomId ?? null;
        const isAdmin = isStoreAdmin(session.user.role);
        const canCreate = Boolean(session.permissions.produk?.canCreate);
        const canEdit = Boolean(session.permissions.produk?.canEdit);
        const canAccessRequests = isAdmin || canCreate;
        const effectiveTab: ProdukTabKey =
          catalog.pageTab === "requests" && !canAccessRequests ? "catalog" : catalog.pageTab;
        const q = search.trim().toLowerCase();

        const sellableProducts = catalog.products.filter((p) => !p.isRawMaterial);
        const rawMaterialProducts = catalog.products.filter((p) => p.isRawMaterial);

        const filteredSellable = sellableProducts.filter((p) => {
          if (methodFilter === "RESEP" && p.stockMethod !== "RESEP") return false;
          if (methodFilter === "READY" && p.stockMethod === "RESEP") return false;
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        });

        const filteredMaterials = rawMaterialProducts.filter((p) => {
          if (!q) return true;
          return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
        });

        const filteredRequests = catalog.requests.filter((r) => {
          if (reqStatusFilter !== "ALL" && r.status !== reqStatusFilter) return false;
          if (!q) return true;
          return (
            r.name.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.requestedBy.name.toLowerCase().includes(q)
          );
        });
        const groupedBatches = groupProductRequestsIntoBatches(filteredRequests);

        return (
          <div className="space-y-5">
            <ProdukHeaderControls
              effectiveTab={effectiveTab}
              isAdmin={isAdmin}
              canCreate={canCreate}
              canEdit={canEdit}
              canAccessRequests={canAccessRequests}
              sellableCount={sellableProducts.length}
              materialsCount={rawMaterialProducts.length}
              pendingRequestsCount={catalog.pendingRequestsCount}
              proposalCartCount={catalog.proposalCart.length}
              search={search}
              onSearchChange={setSearch}
              methodFilter={methodFilter}
              onMethodFilterChange={setMethodFilter}
              reqStatusFilter={reqStatusFilter}
              onReqStatusFilterChange={setReqStatusFilter}
              onOpenAddMaterial={openAddMaterial}
              onOpenAddProduct={openAddProduct}
              onOpenCartDrawer={() => setCartDrawerOpen(true)}
              onActivateTab={(tabKey) => {
                catalog.setPageTab(tabKey);
                if (tabKey === "requests") catalog.loadRequests();
              }}
            />

            {effectiveTab === "catalog" && (
              <ProdukCatalogTab
                loading={catalog.loading}
                allProducts={catalog.products}
                filteredSellable={filteredSellable}
                visibleSellable={filteredSellable.slice(0, catalogLimit)}
                isAdmin={isAdmin}
                canCreate={canCreate}
                canEdit={canEdit}
                proposalCart={catalog.proposalCart}
                onOpenAddMaterial={openAddMaterial}
                onOpenAddProduct={openAddProduct}
                onEditProduct={openEditProduct}
                onDeleteProduct={catalog.setDeletingTarget}
                onShowMore={() => setCatalogLimit((prev) => prev + PRODUK_PAGE_STEP)}
                onCollapse={() => setCatalogLimit(PRODUK_PAGE_STEP)}
              />
            )}

            {effectiveTab === "materials" && (
              <ProdukMaterialsTab
                loading={catalog.loading}
                filteredMaterials={filteredMaterials}
                visibleMaterials={filteredMaterials.slice(0, materialsLimit)}
                isAdmin={isAdmin}
                canCreate={canCreate}
                canEdit={canEdit}
                restockingId={catalog.restockingId}
                proposalCart={catalog.proposalCart}
                onOpenAddMaterial={openAddMaterial}
                onQuickRestock={catalog.handleQuickRestockPack}
                onEditMaterial={openEditMaterial}
                onDeleteMaterial={catalog.setDeletingTarget}
                onShowMore={() => setMaterialsLimit((prev) => prev + PRODUK_PAGE_STEP)}
                onCollapse={() => setMaterialsLimit(PRODUK_PAGE_STEP)}
              />
            )}

            {effectiveTab === "requests" && canAccessRequests && (
              <ProdukRequestsTab
                loadingRequests={catalog.loadingRequests}
                isAdmin={isAdmin}
                groupedBatches={groupedBatches}
                visibleBatches={groupedBatches.slice(0, requestsLimit)}
                onReviewBatch={catalog.setReviewingBatch}
                onDeleteBatch={catalog.setDeletingBatch}
                onShowMore={() => setRequestsLimit((prev) => prev + PRODUK_PAGE_STEP)}
                onCollapse={() => setRequestsLimit(PRODUK_PAGE_STEP)}
              />
            )}

            <ProductBatchReviewDrawer
              batch={catalog.reviewingBatch}
              isOpen={Boolean(catalog.reviewingBatch)}
              onClose={() => catalog.setReviewingBatch(null)}
              isAdmin={isAdmin}
              currentUserId={session.user.id}
              onCompleted={catalog.handleBatchReviewCompleted}
            />

            <RawMaterialDrawer
              isOpen={materialDrawerOpen}
              onClose={() => setMaterialDrawerOpen(false)}
              editingProduct={editingMaterial}
              categories={catalog.categories}
              units={catalog.units}
              isAdmin={isAdmin}
              canSave={editingMaterial ? canEdit : canCreate}
              onRequestDelete={catalog.setDeletingTarget}
              onAddToCart={!isAdmin ? catalog.handleAddToCart : undefined}
              onSaved={async (mode) => {
                invalidateCache("/api/dashboard");
                if (mode === "REQUEST") {
                  catalog.setPageTab("requests");
                  await catalog.loadRequests();
                } else {
                  catalog.setPageTab("materials");
                  await catalog.loadCatalog();
                }
              }}
            />

            <ProductDrawer
              isOpen={productDrawerOpen}
              onClose={() => setProductDrawerOpen(false)}
              editingProduct={editingProduct}
              products={catalog.products}
              queuedMaterials={!isAdmin ? catalog.queuedMaterialsAsProducts : []}
              categories={catalog.categories}
              units={catalog.units}
              isAdmin={isAdmin}
              canSave={editingProduct ? canEdit : canCreate}
              onRequestDelete={catalog.setDeletingTarget}
              onAddToCart={!isAdmin ? catalog.handleAddToCart : undefined}
              onSwitchToAddMaterial={() => {
                setProductDrawerOpen(false);
                openAddMaterial();
              }}
              onSaved={async (mode) => {
                invalidateCache("/api/dashboard");
                if (mode === "REQUEST") {
                  catalog.setPageTab("requests");
                  await catalog.loadRequests();
                } else {
                  catalog.setPageTab("catalog");
                  await catalog.loadCatalog();
                }
              }}
            />

            {!isAdmin && (canCreate || canEdit) && (
              <ProposalCartDrawer
                isOpen={cartDrawerOpen}
                onClose={() => setCartDrawerOpen(false)}
                items={catalog.proposalCart}
                onRemoveItem={(tempId) =>
                  catalog.setProposalCart((prev) => prev.filter((item) => item.clientTempId !== tempId))
                }
                onClearCart={() => catalog.setProposalCart([])}
                onOpenAddMaterial={openAddMaterial}
                onOpenAddProduct={openAddProduct}
                onSubmitted={async () => {
                  invalidateCache("/api/dashboard");
                  catalog.setPageTab("requests");
                  await catalog.loadRequests();
                }}
              />
            )}

            <ProdukModals
              portalMounted={catalog.portalMounted}
              isAdmin={isAdmin}
              canCreate={canCreate}
              canEdit={canEdit}
              products={catalog.products}
              proposalCart={catalog.proposalCart}
              onOpenCartDrawer={() => setCartDrawerOpen(true)}
              deletingTarget={catalog.deletingTarget}
              deletingBusy={catalog.deletingBusy}
              onCloseDeleteTarget={() => catalog.setDeletingTarget(null)}
              onConfirmDelete={catalog.handleConfirmDelete}
              deletingBatch={catalog.deletingBatch}
              deletingBatchScope={catalog.deletingBatchScope}
              onCloseDeleteBatch={() => catalog.setDeletingBatch(null)}
              onConfirmDeleteBatch={catalog.handleConfirmDeleteBatch}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
