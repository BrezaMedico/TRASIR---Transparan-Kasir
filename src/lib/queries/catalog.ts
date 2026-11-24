import { prisma, withDbRetry } from "@/lib/prisma";
import { ensureSystemBaseline, seedRoomDefaults } from "@/lib/rbac";

export async function getCatalogPayload(roomId: string) {
  await withDbRetry(() => ensureSystemBaseline());
  await withDbRetry(() => seedRoomDefaults(prisma, roomId));

  const [products, categories, units, warehouses, pendingRequestsCount] = await withDbRetry(() =>
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
      prisma.productRequest.count({
        where: { roomId, status: "MENUNGGU_PERSETUJUAN" },
      }),
    ])
  );

  return JSON.parse(
    JSON.stringify({ products, categories, units, warehouses, pendingRequestsCount })
  );
}
