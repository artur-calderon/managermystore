import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { cashMovements, orderItems, orders } from "@/lib/db/schema";
import { getEstablishmentForActor, type Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { fromCents, toCents } from "@/server/money";
import { zonedEnd, zonedStart } from "@/server/time";

export async function getReport(actor: Actor, from: string, to: string) {
  assertCan(actor.role, "reports.view");
  const establishment = await getEstablishmentForActor(actor);
  const start = zonedStart(from, establishment.timezone);
  const end = zonedEnd(to, establishment.timezone);

  const [sales] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
      orders: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.establishmentId, actor.establishmentId),
        eq(orders.status, "closed"),
        gte(orders.closedAt, start),
        lte(orders.closedAt, end),
      ),
    );

  const [quantities] = await db
    .select({
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.id, orderItems.orderId), eq(orders.establishmentId, orderItems.establishmentId)),
    )
    .where(
      and(
        eq(orderItems.establishmentId, actor.establishmentId),
        eq(orders.status, "closed"),
        gte(orders.closedAt, start),
        lte(orders.closedAt, end),
      ),
    );

  const topProducts = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: sql<number>`sum(${orderItems.quantity})::int`,
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.id, orderItems.orderId), eq(orders.establishmentId, orderItems.establishmentId)),
    )
    .where(
      and(
        eq(orderItems.establishmentId, actor.establishmentId),
        eq(orders.status, "closed"),
        gte(orders.closedAt, start),
        lte(orders.closedAt, end),
      ),
    )
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(sql`sum(${orderItems.quantity}) desc`)
    .limit(10);

  const movements = await db
    .select({
      type: cashMovements.type,
      total: sql<string>`coalesce(sum(${cashMovements.amount}), 0)::text`,
    })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.establishmentId, actor.establishmentId),
        gte(cashMovements.occurredAt, start),
        lte(cashMovements.occurredAt, end),
      ),
    )
    .groupBy(cashMovements.type);

  const inflow = movements.find((movement) => movement.type === "in")?.total ?? "0";
  const outflow = movements.find((movement) => movement.type === "out")?.total ?? "0";

  return {
    revenue: sales?.revenue ?? "0.00",
    orderCount: sales?.orders ?? 0,
    productQuantity: quantities?.quantity ?? 0,
    topProducts,
    inflow,
    outflow,
    balance: fromCents(toCents(inflow) - toCents(outflow)),
  };
}

export async function getSalesByChannel(actor: Actor, from: string, to: string) {
  assertCan(actor.role, "reports.view");
  const establishment = await getEstablishmentForActor(actor);
  const start = zonedStart(from, establishment.timezone);
  const end = zonedEnd(to, establishment.timezone);

  return db
    .select({
      channel: orders.channel,
      total: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.establishmentId, actor.establishmentId),
        eq(orders.status, "closed"),
        gte(orders.closedAt, start),
        lte(orders.closedAt, end),
      ),
    )
    .groupBy(orders.channel);
}
