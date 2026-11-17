import { Suspense } from "react";
import { connection } from "next/server";

import { OrdersBoard, type BoardOrder } from "@/components/orders/orders-board";
import { LiveRefresh } from "@/components/shared/live-refresh";
import { listProducts } from "@/modules/catalog/service";
import { getDeliverySettings } from "@/modules/delivery/service";
import { listActiveOrders, listOrdersWithItems } from "@/modules/orders/service";
import { listTables } from "@/modules/tables/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Orders />
    </Suspense>
  );
}

async function Orders() {
  await connection();
  const actor = await requirePageActor("/painel/pedidos");
  // O garçom lança pedidos pelo modo garçom; aqui ele apenas acompanha.
  const viewOnly = actor.role === "waiter";
  const [tables, products, active, closed, delivery] = await Promise.all([
    listTables(actor.establishmentId),
    listProducts(actor.establishmentId, true),
    listActiveOrders(actor.establishmentId),
    listOrdersWithItems(actor.establishmentId, ["closed"], 12),
    getDeliverySettings(actor.establishmentId),
  ]);

  const orders = [...active, ...closed].map(toBoardOrder);

  return (
    <>
      <LiveRefresh />
      <OrdersBoard
        orders={orders}
        tables={tables.filter((table) => !table.deletedAt).map((table) => ({ id: table.id, name: table.name }))}
        products={products.map((product) => ({ id: product.id, name: product.name }))}
        now={new Date().toISOString()}
        timeZone={actor.timezone}
        canCreate={!viewOnly && can(actor.role, "orders.create")}
        canUpdateItems={!viewOnly && can(actor.role, "orders.updateItems")}
        canKitchen={can(actor.role, "orders.kitchen")}
        canClose={can(actor.role, "orders.close")}
        canCancel={can(actor.role, "orders.cancel")}
        deliveryEnabled={delivery.enabled}
      />
    </>
  );
}

function toBoardOrder(order: Awaited<ReturnType<typeof listActiveOrders>>[number]): BoardOrder {
  return {
    id: order.id,
    status: order.status as BoardOrder["status"],
    channel: order.channel as BoardOrder["channel"],
    tableName: order.tableName,
    customerName: order.customerName,
    notes: order.notes,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
    delivery:
      order.channel === "delivery"
        ? {
            phone: order.customerPhone,
            address: order.deliveryAddress,
            fee: order.deliveryFee,
            paymentMethod: order.paymentMethod,
            changeFor: order.changeFor,
          }
        : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}
