import { prisma, withDbRetry } from "@/lib/prisma";
import { ensureSystemBaseline, seedRoomDefaults } from "@/lib/rbac";
import { isProductRequestHiddenForUser } from "@/lib/product-request-batch";

export async function getCatalogPayload(
  roomId: string,
  viewer?: { userId: string; isAdmin: boolean }
) {
  await withDbRetry(() => ensureSystemBaseline());
  await withDbRetry(() => seedRoomDefaults(prisma, roomId));

  const [products, categories, units, warehouses, pendingRows] = await withDbRetry(() =>
    Promise.all([
      prisma.product.findMany({
        where: { roomId, isActive: true },
        include: {
          category: true,
          variants: {
            include: {
              ingredients: {
                include: { material: true },
              },
            },
          },
          warehouseStocks: {
            include: { warehouse: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({ where: { roomId }, orderBy: { name: "asc" } }),
      prisma.unit.findMany({ orderBy: [{ group: "asc" }, { name: "asc" }] }),
      prisma.warehouse.findMany({ where: { roomId }, orderBy: { name: "asc" } }),
      prisma.productRequest.findMany({
        where: {
          roomId,
          status: "MENUNGGU_PERSETUJUAN",
          ...(viewer && !viewer.isAdmin ? { requestedById: viewer.userId } : {}),
        },
        select: {
          id: true,
          variantsJson: true,
        },
      }),
    ])
  );

  const pendingRequestsCount = viewer
    ? pendingRows.filter((r) => !isProductRequestHiddenForUser(r.variantsJson, viewer.userId)).length
    : pendingRows.length;

  return JSON.parse(
    JSON.stringify({ products, categories, units, warehouses, pendingRequestsCount })
  );
}
