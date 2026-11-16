import { and, desc, eq } from "drizzle-orm";

import { db, type Tx } from "@/lib/db";
import { cashMovements, diningTables, orders } from "@/lib/db/schema";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";

export async function listCashMovements(actor: Actor) {
  assertCan(actor.role, "cash.manage");

  return db
    .select({
      id: cashMovements.id,
      type: cashMovements.type,
      amount: cashMovements.amount,
      description: cashMovements.description,
      occurredAt: cashMovements.occurredAt,
      orderId: cashMovements.orderId,
      tableName: diningTables.name,
      customerName: orders.customerName,
      channel: orders.channel,
    })
    .from(cashMovements)
    .leftJoin(
      orders,
      and(eq(orders.id, cashMovements.orderId), eq(orders.establishmentId, cashMovements.establishmentId)),
    )
    .leftJoin(
      diningTables,
      and(eq(diningTables.id, orders.tableId), eq(diningTables.establishmentId, orders.establishmentId)),
    )
    .where(eq(cashMovements.establishmentId, actor.establishmentId))
    .orderBy(desc(cashMovements.occurredAt));
}

export async function addCashMovement(
  actor: Actor,
  input: { type: "in" | "out"; amount: string; description?: string },
) {
  assertCan(actor.role, "cash.manage");
  const amount = normalizeAmount(input.amount);

  if (input.type === "out" && !input.description?.trim()) {
    throw new AppError("description_required", "Informe o motivo da saída.");
  }

  const [movement] = await db
    .insert(cashMovements)
    .values({
      establishmentId: actor.establishmentId,
      type: input.type,
      amount,
      description: input.description?.trim() || null,
      createdByUserId: actor.userId,
    })
    .returning();

  return movement;
}

export async function recordSale(
  tx: Tx,
  input: { establishmentId: string; orderId: string; amount: string; userId: string },
) {
  const [movement] = await tx
    .insert(cashMovements)
    .values({
      establishmentId: input.establishmentId,
      orderId: input.orderId,
      type: "in",
      amount: input.amount,
      description: "Fechamento de pedido",
      createdByUserId: input.userId,
    })
    .returning();

  return movement;
}

function normalizeAmount(value: string) {
  const cents = toCents(value.replace(",", "."));
  if (cents <= 0) {
    throw new AppError("invalid_amount", "O valor precisa ser maior que zero.");
  }
  return fromCents(cents);
}
