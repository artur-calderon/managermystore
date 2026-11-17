import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { WaiterApp, type WaiterProduct, type WaiterTable } from "@/components/waiter/waiter-app";
import { roleLabels } from "@/components/layout/navigation";
import { itemDetail } from "@/lib/order-item-options";
import { emptyConfig } from "@/lib/product-config";
import { db } from "@/lib/db";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { loadProductConfigs } from "@/modules/catalog/variations";
import { listActiveOrders } from "@/modules/orders/service";
import { listTables } from "@/modules/tables/service";
import { getEstablishmentForActor } from "@/modules/tenancy/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function WaiterPage() {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <Waiter />
    </Suspense>
  );
}

async function Waiter() {
  await connection();
  const actor = await requirePageActor("/garcom");
  if (!can(actor.role, "orders.create")) {
    redirect("/painel");
  }

  const [establishment, tables, categories, products, active] = await Promise.all([
    getEstablishmentForActor(actor),
    listTables(actor.establishmentId),
    listCategories(actor.establishmentId),
    listProducts(actor.establishmentId),
    listActiveOrders(actor.establishmentId),
  ]);
  const configs = await loadProductConfigs(
    db,
    products.map((product) => product.id),
  );

  const ordersByTable = new Map<string, WaiterTable["orders"]>();
  for (const order of active) {
    if (!order.tableId) continue;
    const current = ordersByTable.get(order.tableId) ?? [];
    current.push({
      id: order.id,
      status: order.status as "pending" | "preparing" | "ready",
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        variantName: item.variantName,
        detail: itemDetail(item),
        quantity: item.quantity,
      })),
    });
    ordersByTable.set(order.tableId, current);
  }

  const waiterTables: WaiterTable[] = tables
    .filter((table) => !table.deletedAt)
    .map((table) => ({
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      environmentId: table.environmentId,
      environmentName: table.environmentName,
      orders: (ordersByTable.get(table.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }));

  const waiterProducts: WaiterProduct[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    categoryId: product.categoryId,
    categoryName: product.categoryName,
    stockQuantity: product.stockQuantity,
    isAvailable: product.isAvailable,
    config: configs.get(product.id) ?? emptyConfig,
  }));

  return (
    <WaiterApp
      tables={waiterTables}
      products={waiterProducts}
      categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      userName={actor.userName}
      roleLabel={roleLabels[actor.role]}
      establishmentName={actor.establishmentName}
      open={establishment.status === "active"}
      now={new Date().toISOString()}
      timeZone={actor.timezone}
      canViewOrders={can(actor.role, "orders.view")}
      panelHref={actor.role === "waiter" ? "/painel/pedidos" : "/painel"}
    />
  );
}
