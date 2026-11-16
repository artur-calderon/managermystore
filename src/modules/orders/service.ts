import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { diningTables, orderItems, orders, products } from "@/lib/db/schema";
import type { OrderStatus } from "@/lib/db/schema";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";
import { transaction } from "@/server/transaction";

import { recordSale } from "@/modules/cash/service";

const activeStatuses = ["pending", "preparing", "ready"] as const;

const kitchenTransitions: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "ready",
};

export type ItemInput = { productId: string; quantity: number };

export async function listOrders(establishmentId: string, statuses?: OrderStatus[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      channel: orders.channel,
      totalAmount: orders.totalAmount,
      customerName: orders.customerName,
      notes: orders.notes,
      createdAt: orders.createdAt,
      closedAt: orders.closedAt,
      tableId: orders.tableId,
      tableName: diningTables.name,
    })
    .from(orders)
    .leftJoin(
      diningTables,
      and(eq(diningTables.id, orders.tableId), eq(diningTables.establishmentId, orders.establishmentId)),
    )
    .where(
      and(
        eq(orders.establishmentId, establishmentId),
        statuses ? inArray(orders.status, statuses) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt));

  return rows;
}

export async function getOrder(establishmentId: string, orderId: string) {
  const [match] = await db
    .select({
      id: orders.id,
      status: orders.status,
      channel: orders.channel,
      totalAmount: orders.totalAmount,
      customerName: orders.customerName,
      notes: orders.notes,
      createdAt: orders.createdAt,
      closedAt: orders.closedAt,
      tableId: orders.tableId,
      tableName: diningTables.name,
    })
    .from(orders)
    .leftJoin(
      diningTables,
      and(
        eq(diningTables.id, orders.tableId),
        eq(diningTables.establishmentId, orders.establishmentId),
      ),
    )
    .where(and(eq(orders.establishmentId, establishmentId), eq(orders.id, orderId)))
    .limit(1);

  if (!match) {
    throw new AppError("not_found", "Pedido não encontrado.");
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.establishmentId, establishmentId), eq(orderItems.orderId, orderId)));

  return { ...match, items };
}

export async function createWaiterOrder(
  actor: Actor,
  input: { tableId: string; notes?: string; items?: ItemInput[] },
) {
  assertCan(actor.role, "orders.create");

  return transaction(async (tx) => {
    const [table] = await tx
      .select({ id: diningTables.id })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.id, input.tableId),
          eq(diningTables.establishmentId, actor.establishmentId),
          isNull(diningTables.deletedAt),
        ),
      )
      .limit(1);

    if (!table) {
      throw new AppError("not_found", "Mesa não encontrada.");
    }

    const [order] = await tx
      .insert(orders)
      .values({
        establishmentId: actor.establishmentId,
        tableId: table.id,
        channel: "waiter",
        createdByUserId: actor.userId,
        notes: input.notes?.trim() || null,
      })
      .returning();

    for (const item of input.items ?? []) {
      await addItem(tx, actor.establishmentId, order.id, item);
    }

    const totalAmount = await recomputeTotal(tx, actor.establishmentId, order.id);
    return { ...order, totalAmount };
  });
}

export async function createCatalogOrder(
  slug: string,
  input: { customerName?: string; notes?: string; items: ItemInput[] },
) {
  if (input.items.length === 0) {
    throw new AppError("empty_order", "Inclua ao menos um produto.");
  }

  const { getPublicEstablishment } = await import("@/modules/tenancy/service");
  const establishment = await getPublicEstablishment(slug);

  return transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        establishmentId: establishment.id,
        channel: "catalog",
        customerName: input.customerName?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    for (const item of input.items) {
      await addItem(tx, establishment.id, order.id, item, true);
    }

    const totalAmount = await recomputeTotal(tx, establishment.id, order.id);
    return { id: order.id, totalAmount, createdAt: order.createdAt };
  });
}

export async function upsertOrderItem(actor: Actor, orderId: string, item: ItemInput) {
  assertCan(actor.role, "orders.updateItems");

  return transaction(async (tx) => {
    const order = await lockPendingOrder(tx, actor.establishmentId, orderId);
    await addItem(tx, actor.establishmentId, order.id, item);
    const totalAmount = await recomputeTotal(tx, actor.establishmentId, order.id);
    return { orderId: order.id, totalAmount };
  });
}

export async function removeOrderItem(actor: Actor, orderId: string, itemId: string) {
  assertCan(actor.role, "orders.updateItems");

  return transaction(async (tx) => {
    const order = await lockPendingOrder(tx, actor.establishmentId, orderId);
    const removed = await tx
      .delete(orderItems)
      .where(
        and(
          eq(orderItems.id, itemId),
          eq(orderItems.orderId, order.id),
          eq(orderItems.establishmentId, actor.establishmentId),
        ),
      )
      .returning();

    if (removed.length === 0) {
      throw new AppError("not_found", "Item não encontrado.");
    }

    const totalAmount = await recomputeTotal(tx, actor.establishmentId, order.id);
    return { orderId: order.id, totalAmount };
  });
}

export async function advanceOrder(actor: Actor, orderId: string) {
  assertCan(actor.role, "orders.kitchen");

  return transaction(async (tx) => {
    const order = await lockOrder(tx, actor.establishmentId, orderId);
    const next = kitchenTransitions[order.status as OrderStatus];

    if (!next) {
      throw new AppError("invalid_transition", "Este pedido não pode avançar na cozinha.");
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: next })
      .where(eq(orders.id, order.id))
      .returning();

    return updated;
  });
}

export async function cancelOrder(actor: Actor, orderId: string) {
  assertCan(actor.role, "orders.cancel");

  return transaction(async (tx) => {
    const order = await lockOrder(tx, actor.establishmentId, orderId);

    if (order.status === "closed" || order.status === "cancelled") {
      throw new AppError("final_order", "Pedidos fechados ou cancelados não podem ser alterados.");
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: "cancelled", closedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();

    return updated;
  });
}

export async function closeOrder(actor: Actor, orderId: string) {
  assertCan(actor.role, "orders.close");

  return transaction(async (tx) => {
    const order = await lockOrder(tx, actor.establishmentId, orderId);

    if (order.status !== "ready") {
      throw new AppError("invalid_transition", "Somente pedidos prontos podem ser fechados.");
    }

    const totalAmount = await recomputeTotal(tx, actor.establishmentId, order.id);
    if (toCents(totalAmount) <= 0) {
      throw new AppError("empty_order", "O pedido não tem valor para lançar no caixa.");
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: "closed", totalAmount, closedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();

    await recordSale(tx, {
      establishmentId: actor.establishmentId,
      orderId: order.id,
      amount: totalAmount,
      userId: actor.userId,
    });

    return updated;
  });
}

export async function listActiveOrders(establishmentId: string) {
  const rows = await listOrders(establishmentId, [...activeStatuses]);
  const detailed = [];

  for (const row of rows) {
    detailed.push(await getOrder(establishmentId, row.id));
  }

  return detailed;
}

async function lockOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  establishmentId: string,
  orderId: string,
) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishmentId)))
    .for("update");

  if (!order) {
    throw new AppError("not_found", "Pedido não encontrado.");
  }

  return order;
}

async function lockPendingOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  establishmentId: string,
  orderId: string,
) {
  const order = await lockOrder(tx, establishmentId, orderId);

  if (order.status !== "pending") {
    throw new AppError("final_order", "Somente pedidos pendentes podem ter itens alterados.");
  }

  return order;
}

async function addItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  establishmentId: string,
  orderId: string,
  item: ItemInput,
  availableOnly = true,
) {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new AppError("invalid_quantity", "A quantidade precisa ser um inteiro maior que zero.");
  }

  const [product] = await tx
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, item.productId),
        eq(products.establishmentId, establishmentId),
        isNull(products.deletedAt),
        availableOnly ? eq(products.isAvailable, true) : undefined,
      ),
    )
    .limit(1);

  if (!product) {
    throw new AppError("not_found", "Produto não encontrado neste estabelecimento.");
  }

  await tx
    .insert(orderItems)
    .values({
      establishmentId,
      orderId,
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
    })
    .onConflictDoUpdate({
      target: [orderItems.orderId, orderItems.productId],
      set: {
        quantity: item.quantity,
        unitPrice: product.price,
        productName: product.name,
      },
    });
}

async function recomputeTotal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  establishmentId: string,
  orderId: string,
) {
  const items = await tx
    .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice })
    .from(orderItems)
    .where(and(eq(orderItems.establishmentId, establishmentId), eq(orderItems.orderId, orderId)));

  const total = fromCents(
    items.reduce((sum, item) => sum + item.quantity * toCents(item.unitPrice), 0),
  );

  await tx
    .update(orders)
    .set({ totalAmount: total })
    .where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishmentId)));

  return total;
}
