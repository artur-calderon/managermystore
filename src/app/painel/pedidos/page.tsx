import { Suspense } from "react";
import { connection } from "next/server";

import { OrdersBoard, type BoardOrder } from "@/components/orders/orders-board";
import { listProducts } from "@/modules/catalog/service";
import { getOrder, listActiveOrders, listOrders } from "@/modules/orders/service";
import { listTables } from "@/modules/tables/service";
import { can } from "@/server/authorization";
import { requireActor } from "@/server/context";

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Orders />
    </Suspense>
  );
}

async function Orders() {
  await connection();
  const actor = await requireActor();
  const [tables, products, active, closedRows] = await Promise.all([
    listTables(actor.establishmentId),
    listProducts(actor.establishmentId, true),
    listActiveOrders(actor.establishmentId),
    listOrders(actor.establishmentId, ["closed"]),
  ]);

  const closed = [];
  for (const row of closedRows.slice(0, 12)) {
    closed.push(await getOrder(actor.establishmentId, row.id));
  }

  const orders = [...active, ...closed].map(toBoardOrder);

  return (
    <OrdersBoard
      orders={orders}
      tables={tables.filter((table) => !table.deletedAt).map((table) => ({ id: table.id, name: table.name }))}
      products={products.map((product) => ({ id: product.id, name: product.name }))}
      now={new Date().toISOString()}
      timeZone={actor.timezone}
      canCreate={can(actor.role, "orders.create")}
      canUpdateItems={can(actor.role, "orders.updateItems")}
      canKitchen={can(actor.role, "orders.kitchen")}
      canClose={can(actor.role, "orders.close")}
      canCancel={can(actor.role, "orders.cancel")}
    />
  );
}

function toBoardOrder(order: Awaited<ReturnType<typeof getOrder>>): BoardOrder {
  return {
    id: order.id,
    status: order.status as BoardOrder["status"],
    channel: order.channel as BoardOrder["channel"],
    tableName: order.tableName,
    customerName: order.customerName,
    notes: order.notes,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}
