import { Suspense } from "react";
import { itemDetail, itemTitle } from "@/lib/order-item-options";
import { connection } from "next/server";

import { LiveRefresh } from "@/components/shared/live-refresh";
import { TablesFloor, type FloorOrder, type FloorTable } from "@/components/tables/tables-floor";
import { listProducts } from "@/modules/catalog/service";
import { listActiveOrders } from "@/modules/orders/service";
import { listTables } from "@/modules/tables/service";
import { getEstablishmentForActor } from "@/modules/tenancy/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function TablesPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Tables />
    </Suspense>
  );
}

async function Tables() {
  await connection();
  const actor = await requirePageActor("/painel/mesas");
  const [establishment, tables, products, active] = await Promise.all([
    getEstablishmentForActor(actor),
    listTables(actor.establishmentId),
    listProducts(actor.establishmentId, true),
    listActiveOrders(actor.establishmentId),
  ]);

  const ordersByTable = new Map<string, FloorOrder[]>();
  for (const order of active) {
    if (!order.tableId || order.channel !== "waiter") continue;
    const status = order.status;
    if (status !== "pending" && status !== "preparing" && status !== "ready") continue;
    const current = ordersByTable.get(order.tableId) ?? [];
    current.push({
      id: order.id,
      status,
      totalAmount: order.totalAmount,
      notes: order.notes,
      items: order.items.map((item) => ({
        id: item.id,
        productName: itemTitle(item),
        detail: itemDetail(item),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
    ordersByTable.set(order.tableId, current);
  }

  const floor: FloorTable[] = tables
    .filter((table) => !table.deletedAt || ordersByTable.has(table.id))
    .map((table) => ({
      id: table.id,
      name: table.name,
      orders: ordersByTable.get(table.id) ?? [],
    }));

  return (
    <>
      <LiveRefresh />
      <TablesFloor
      tables={floor}
      products={products.map((product) => ({ id: product.id, name: product.name }))}
      open={establishment.status === "active"}
      canManage={can(actor.role, "tables.manage")}
      canCreate={can(actor.role, "orders.create")}
      canUpdateItems={can(actor.role, "orders.updateItems")}
      canClose={can(actor.role, "orders.close")}
      canCancel={can(actor.role, "orders.cancel")}
    />
    </>
  );
}
