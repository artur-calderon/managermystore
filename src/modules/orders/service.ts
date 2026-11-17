import { and, count, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { db, type Tx } from "@/lib/db";
import {
  deliverySettings,
  diningTables,
  establishments,
  orderItems,
  orders,
  products,
  type PaymentMethod,
} from "@/lib/db/schema";
import { activeOrderStatuses, type OrderStatus } from "@/lib/db/schema";
import { loadProductConfig, resolveItemSelection, type ItemSelection } from "@/modules/catalog/variations";
import { formatAddress, getAddress, type Customer } from "@/modules/customers/service";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";
import { transaction } from "@/server/transaction";

import { recordSale } from "@/modules/cash/service";

const kitchenTransitions: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "ready",
};

export type ItemInput = { productId: string; quantity: number } & ItemSelection;

/** Ordena por produto para que transações concorrentes travem os produtos sempre na mesma ordem. */
function byProduct<T extends { productId: string }>(items: readonly T[]) {
  return [...items].sort((a, b) => a.productId.localeCompare(b.productId));
}

const deliveryColumns = {
  customerPhone: orders.customerPhone,
  deliveryAddress: orders.deliveryAddress,
  deliveryFee: orders.deliveryFee,
  paymentMethod: orders.paymentMethod,
  changeFor: orders.changeFor,
};

/** Limite de pedidos de delivery aguardando aceite por cliente (protege contra abuso/spam). */
const MAX_PENDING_DELIVERY_ORDERS = 3;

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
      ...deliveryColumns,
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
      ...deliveryColumns,
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

    for (const item of byProduct(input.items ?? [])) {
      await addItem(tx, actor.establishmentId, order.id, item, "add");
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

    for (const item of byProduct(input.items)) {
      await addItem(tx, establishment.id, order.id, item, "add");
    }

    const totalAmount = await recomputeTotal(tx, establishment.id, order.id);
    return { id: order.id, totalAmount, createdAt: order.createdAt };
  });
}

/** Pedido de delivery feito pelo cliente logado no cardápio digital. */
export async function createDeliveryOrder(
  customer: Customer,
  input: {
    addressId: string;
    paymentMethod: PaymentMethod;
    changeFor?: string;
    notes?: string;
    items: ItemInput[];
  },
) {
  if (input.items.length === 0) {
    throw new AppError("empty_order", "Seu carrinho está vazio.");
  }

  const address = await getAddress(customer, input.addressId);

  return transaction(async (tx) => {
    const [store] = await tx
      .select({
        status: establishments.status,
        isOpen: establishments.isOpen,
        deletedAt: establishments.deletedAt,
        deliveryEnabled: deliverySettings.enabled,
        fee: deliverySettings.fee,
        paymentMethods: deliverySettings.paymentMethods,
      })
      .from(establishments)
      .leftJoin(deliverySettings, eq(deliverySettings.establishmentId, establishments.id))
      .where(eq(establishments.id, customer.establishmentId))
      .limit(1);

    if (!store || store.deletedAt || store.status !== "active" || !store.isOpen) {
      throw new AppError("store_closed", "A loja está fechada no momento. Tente novamente mais tarde.");
    }
    if (!store.deliveryEnabled) {
      throw new AppError("delivery_disabled", "Esta loja não está aceitando pedidos de delivery.");
    }
    if (!store.paymentMethods?.includes(input.paymentMethod)) {
      throw new AppError("invalid_payment_method", "Forma de pagamento não aceita por esta loja.");
    }

    const [pending] = await tx
      .select({ total: count() })
      .from(orders)
      .where(
        and(
          eq(orders.establishmentId, customer.establishmentId),
          eq(orders.customerId, customer.id),
          eq(orders.status, "pending"),
        ),
      );
    if ((pending?.total ?? 0) >= MAX_PENDING_DELIVERY_ORDERS) {
      throw new AppError(
        "too_many_pending",
        "Você já tem pedidos aguardando a loja. Aguarde a confirmação antes de enviar outro.",
      );
    }

    const [order] = await tx
      .insert(orders)
      .values({
        establishmentId: customer.establishmentId,
        channel: "delivery",
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        deliveryAddress: formatAddress(address),
        deliveryFee: store.fee ?? "0",
        paymentMethod: input.paymentMethod,
        notes: input.notes?.trim() || null,
      })
      .returning();

    for (const item of byProduct(input.items)) {
      // Itens iguais (mesma variação/opções) são somados na mesma linha.
      const quantity = await addItem(tx, customer.establishmentId, order.id, item, "add");
      if (quantity > 99) {
        throw new AppError("invalid_quantity", "Quantidade máxima por item: 99.");
      }
    }

    const totalAmount = await recomputeTotal(tx, customer.establishmentId, order.id);

    if (input.paymentMethod === "cash" && input.changeFor?.trim()) {
      let changeCents: number;
      try {
        changeCents = toCents(input.changeFor.trim().replace(",", "."));
      } catch {
        changeCents = Number.NaN;
      }
      if (!Number.isFinite(changeCents) || changeCents < toCents(totalAmount)) {
        throw new AppError("invalid_change", "O troco precisa ser para um valor igual ou maior que o total do pedido.");
      }
      await tx.update(orders).set({ changeFor: fromCents(changeCents) }).where(eq(orders.id, order.id));
    }

    return { id: order.id, totalAmount };
  });
}

/** Pedidos do cliente (mais recentes primeiro), com itens. */
export async function listCustomerOrders(customer: Customer, limit = 20) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      notes: orders.notes,
      ...deliveryColumns,
    })
    .from(orders)
    .where(and(eq(orders.establishmentId, customer.establishmentId), eq(orders.customerId, customer.id)))
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  return withItems(customer.establishmentId, rows);
}

export async function getCustomerOrdersVersion(customer: Customer) {
  const [row] = await db
    .select({ lastUpdate: max(orders.updatedAt), total: count() })
    .from(orders)
    .where(and(eq(orders.establishmentId, customer.establishmentId), eq(orders.customerId, customer.id)));

  return `${row?.lastUpdate?.getTime() ?? 0}:${row?.total ?? 0}`;
}

export async function upsertOrderItem(actor: Actor, orderId: string, item: ItemInput) {
  assertCan(actor.role, "orders.updateItems");

  return transaction(async (tx) => {
    const order = await lockPendingOrder(tx, actor.establishmentId, orderId);
    await addItem(tx, actor.establishmentId, order.id, item, "set");
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
    await restoreStock(tx, actor.establishmentId, removed);

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

/** Delivery: marca um pedido pronto como "saiu para entrega". */
export async function dispatchOrder(actor: Actor, orderId: string) {
  assertCan(actor.role, "orders.close");

  return transaction(async (tx) => {
    const order = await lockOrder(tx, actor.establishmentId, orderId);

    if (order.channel !== "delivery") {
      throw new AppError("invalid_transition", "Somente pedidos de delivery saem para entrega.");
    }
    if (order.status !== "ready") {
      throw new AppError("invalid_transition", "O pedido precisa estar pronto para sair para entrega.");
    }

    const [updated] = await tx
      .update(orders)
      .set({ status: "out_for_delivery" })
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

    // Cancelou: o que tinha saído do estoque volta.
    const items = await tx
      .select({ productId: orderItems.productId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.establishmentId, actor.establishmentId), eq(orderItems.orderId, order.id)));
    await restoreStock(tx, actor.establishmentId, items);

    return updated;
  });
}

export async function closeOrder(actor: Actor, orderId: string) {
  assertCan(actor.role, "orders.close");

  return transaction(async (tx) => {
    const order = await lockOrder(tx, actor.establishmentId, orderId);

    // Delivery fecha depois de sair para entrega; os demais canais fecham a partir de "pronto".
    const closableFrom: OrderStatus = order.channel === "delivery" ? "out_for_delivery" : "ready";
    if (order.status !== closableFrom) {
      throw new AppError(
        "invalid_transition",
        order.channel === "delivery"
          ? "Pedidos de delivery só podem ser fechados depois de saírem para entrega."
          : "Somente pedidos prontos podem ser fechados.",
      );
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

/** Pedidos prontos para fechar no caixa: "pronto" (salão/balcão) ou "saiu para entrega" (delivery). */
export async function listClosableOrders(establishmentId: string) {
  const rows = await listOrders(establishmentId, ["ready", "out_for_delivery"]);
  return rows.filter((order) =>
    order.channel === "delivery" ? order.status === "out_for_delivery" : order.status === "ready",
  );
}

export async function listActiveOrders(establishmentId: string) {
  return withItems(establishmentId, await listOrders(establishmentId, [...activeOrderStatuses]));
}

/** Lista pedidos com seus itens em duas consultas (sem uma consulta por pedido). */
export async function listOrdersWithItems(establishmentId: string, statuses: OrderStatus[], limit?: number) {
  const rows = await listOrders(establishmentId, statuses);
  return withItems(establishmentId, limit === undefined ? rows : rows.slice(0, limit));
}

/**
 * Assinatura barata do estado dos pedidos do estabelecimento.
 * Muda sempre que um pedido é criado ou alterado (status, itens, total), pois `updated_at` é
 * atualizado em toda escrita. As telas em tempo real comparam esse valor para saber se recarregam.
 */
export async function getOrdersVersion(establishmentId: string) {
  const [row] = await db
    .select({ lastUpdate: max(orders.updatedAt), total: count() })
    .from(orders)
    .where(eq(orders.establishmentId, establishmentId));

  return `${row?.lastUpdate?.getTime() ?? 0}:${row?.total ?? 0}`;
}

async function withItems<T extends { id: string }>(establishmentId: string, rows: T[]) {
  if (rows.length === 0) {
    return [];
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.establishmentId, establishmentId),
        inArray(
          orderItems.orderId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(orderItems.createdAt);

  const byOrder = new Map<string, (typeof items)[number][]>();
  for (const item of items) {
    const current = byOrder.get(item.orderId) ?? [];
    current.push(item);
    byOrder.set(item.orderId, current);
  }

  return rows.map((row) => ({ ...row, items: byOrder.get(row.id) ?? [] }));
}

async function lockOrder(
  tx: Tx,
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
  tx: Tx,
  establishmentId: string,
  orderId: string,
) {
  const order = await lockOrder(tx, establishmentId, orderId);

  if (order.status !== "pending") {
    throw new AppError("final_order", "Somente pedidos pendentes podem ter itens alterados.");
  }

  return order;
}

/**
 * Inclui (ou atualiza) um item no pedido: valida variação/opções, calcula o preço no servidor e
 * baixa o estoque do produto na mesma transação. `add` soma à linha igual existente; `set` define a
 * quantidade (devolvendo ao estoque se diminuir). Devolve a quantidade final da linha.
 */
async function addItem(tx: Tx, establishmentId: string, orderId: string, item: ItemInput, mode: "add" | "set") {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new AppError("invalid_quantity", "A quantidade precisa ser um inteiro maior que zero.");
  }

  // Trava a linha do produto: dois pedidos simultâneos não vendem a mesma unidade.
  const [product] = await tx
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, item.productId),
        eq(products.establishmentId, establishmentId),
        isNull(products.deletedAt),
        eq(products.isAvailable, true),
      ),
    )
    .limit(1)
    .for("update");

  if (!product) {
    throw new AppError("not_found", "Produto não encontrado neste estabelecimento.");
  }

  const resolved = resolveItemSelection(product, await loadProductConfig(tx, product.id), item);

  const [existing] = await tx
    .select({ id: orderItems.id, quantity: orderItems.quantity })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.productId, product.id),
        eq(orderItems.configKey, resolved.configKey),
      ),
    )
    .limit(1)
    .for("update");

  const previous = existing?.quantity ?? 0;
  const quantity = mode === "add" ? previous + item.quantity : item.quantity;
  const delta = quantity - previous;

  if (delta > product.stockQuantity) {
    throw new AppError("out_of_stock", stockMessage(product.name, product.stockQuantity));
  }

  if (delta !== 0) {
    await tx
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${delta}` })
      .where(eq(products.id, product.id));
  }

  const values = {
    quantity,
    unitPrice: resolved.unitPrice,
    productName: product.name,
    variantId: resolved.variantId,
    variantName: resolved.variantName,
    options: resolved.options,
    notes: resolved.notes,
    updatedAt: new Date(),
  };

  if (existing) {
    await tx.update(orderItems).set(values).where(eq(orderItems.id, existing.id));
  } else {
    await tx.insert(orderItems).values({
      ...values,
      establishmentId,
      orderId,
      productId: product.id,
      configKey: resolved.configKey,
    });
  }

  return quantity;
}

function stockMessage(name: string, stock: number) {
  if (stock <= 0) {
    return `${name} está esgotado.`;
  }
  return `Estoque insuficiente de ${name}: ${stock === 1 ? "resta 1 unidade" : `restam ${stock} unidades`}.`;
}

/** Devolve ao estoque as quantidades de itens retirados/cancelados. */
async function restoreStock(tx: Tx, establishmentId: string, items: { productId: string; quantity: number }[]) {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }

  for (const [productId, quantity] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
    await tx
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} + ${quantity}` })
      .where(and(eq(products.id, productId), eq(products.establishmentId, establishmentId)));
  }
}

async function recomputeTotal(
  tx: Tx,
  establishmentId: string,
  orderId: string,
) {
  const items = await tx
    .select({ quantity: orderItems.quantity, unitPrice: orderItems.unitPrice })
    .from(orderItems)
    .where(and(eq(orderItems.establishmentId, establishmentId), eq(orderItems.orderId, orderId)));

  const [order] = await tx
    .select({ deliveryFee: orders.deliveryFee })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishmentId)));

  // Total = itens + taxa de entrega (zero fora do delivery).
  const total = fromCents(
    items.reduce((sum, item) => sum + item.quantity * toCents(item.unitPrice), 0) +
      toCents(order?.deliveryFee ?? "0"),
  );

  await tx
    .update(orders)
    .set({ totalAmount: total })
    .where(and(eq(orders.id, orderId), eq(orders.establishmentId, establishmentId)));

  return total;
}
