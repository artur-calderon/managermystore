import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { diningTables, environments, orders } from "@/lib/db/schema";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";

const activeStatuses = ["pending", "preparing", "ready"] as const;

export type TableInput = {
  name: string;
  environmentId: string;
  capacity: number;
  notes?: string;
  digitalMenuEnabled?: boolean;
};

export async function listEnvironments(establishmentId: string, includeDeleted = false) {
  return db
    .select({
      id: environments.id,
      name: environments.name,
      deletedAt: environments.deletedAt,
    })
    .from(environments)
    .where(
      includeDeleted
        ? eq(environments.establishmentId, establishmentId)
        : and(eq(environments.establishmentId, establishmentId), isNull(environments.deletedAt)),
    )
    .orderBy(environments.name);
}

export async function createEnvironment(actor: Actor, name: string) {
  assertCan(actor.role, "tables.manage");
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError("invalid_name", "Informe o nome do ambiente.");
  }

  const [environment] = await db
    .insert(environments)
    .values({ establishmentId: actor.establishmentId, name: trimmed })
    .returning();
  return environment;
}

export async function ensureDefaultEnvironment(actor: Actor) {
  const [existing] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(and(eq(environments.establishmentId, actor.establishmentId), isNull(environments.deletedAt)))
    .limit(1);

  if (existing) {
    return existing;
  }

  return createEnvironment(actor, "Salão Principal");
}

export async function listTables(establishmentId: string) {
  const rows = await db
    .select({
      id: diningTables.id,
      name: diningTables.name,
      capacity: diningTables.capacity,
      notes: diningTables.notes,
      digitalMenuEnabled: diningTables.digitalMenuEnabled,
      environmentId: diningTables.environmentId,
      environmentName: environments.name,
      deletedAt: diningTables.deletedAt,
      orderId: orders.id,
    })
    .from(diningTables)
    .innerJoin(
      environments,
      and(
        eq(environments.id, diningTables.environmentId),
        eq(environments.establishmentId, diningTables.establishmentId),
      ),
    )
    .leftJoin(
      orders,
      and(
        eq(orders.tableId, diningTables.id),
        eq(orders.establishmentId, diningTables.establishmentId),
        inArray(orders.status, [...activeStatuses]),
      ),
    )
    .where(eq(diningTables.establishmentId, establishmentId));

  const tables = new Map<
    string,
    {
      id: string;
      name: string;
      capacity: number;
      notes: string | null;
      digitalMenuEnabled: boolean;
      environmentId: string;
      environmentName: string;
      deletedAt: Date | null;
      occupied: boolean;
      activeOrderId: string | null;
    }
  >();

  for (const row of rows) {
    const current = tables.get(row.id) ?? {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      notes: row.notes,
      digitalMenuEnabled: row.digitalMenuEnabled,
      environmentId: row.environmentId,
      environmentName: row.environmentName,
      deletedAt: row.deletedAt,
      occupied: false,
      activeOrderId: null,
    };
    if (row.orderId) {
      current.occupied = true;
      current.activeOrderId = row.orderId;
    }
    tables.set(row.id, current);
  }

  return [...tables.values()].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

export async function createTable(actor: Actor, input: string | TableInput) {
  assertCan(actor.role, "tables.manage");
  const data = typeof input === "string" ? { name: input } : input;
  const name = data.name.trim();
  if (!name) {
    throw new AppError("invalid_name", "Informe o nome da mesa.");
  }

  const environmentId =
    "environmentId" in data && data.environmentId
      ? data.environmentId
      : (await ensureDefaultEnvironment(actor)).id;
  await assertEnvironment(actor.establishmentId, environmentId);

  const capacity = normalizeCapacity("capacity" in data ? data.capacity : 4);
  const notes = "notes" in data ? data.notes?.trim() || null : null;
  const digitalMenuEnabled = "digitalMenuEnabled" in data ? Boolean(data.digitalMenuEnabled ?? true) : true;

  const [table] = await db
    .insert(diningTables)
    .values({
      establishmentId: actor.establishmentId,
      environmentId,
      name,
      capacity,
      notes,
      digitalMenuEnabled,
    })
    .returning();
  return table;
}

export async function updateTable(actor: Actor, tableId: string, input: TableInput) {
  assertCan(actor.role, "tables.manage");
  const name = input.name.trim();
  if (!name) {
    throw new AppError("invalid_name", "Informe o nome da mesa.");
  }

  await assertEnvironment(actor.establishmentId, input.environmentId);

  const [table] = await db
    .update(diningTables)
    .set({
      name,
      environmentId: input.environmentId,
      capacity: normalizeCapacity(input.capacity),
      notes: input.notes?.trim() || null,
      digitalMenuEnabled: Boolean(input.digitalMenuEnabled ?? true),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(diningTables.id, tableId),
        eq(diningTables.establishmentId, actor.establishmentId),
        isNull(diningTables.deletedAt),
      ),
    )
    .returning();

  if (!table) {
    throw new AppError("not_found", "Mesa não encontrada.");
  }

  return table;
}

export async function deactivateTable(actor: Actor, tableId: string) {
  assertCan(actor.role, "tables.manage");
  const [table] = await db
    .update(diningTables)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(diningTables.id, tableId),
        eq(diningTables.establishmentId, actor.establishmentId),
        isNull(diningTables.deletedAt),
      ),
    )
    .returning();

  if (!table) {
    throw new AppError("not_found", "Mesa não encontrada.");
  }

  return table;
}

export async function reactivateTable(actor: Actor, tableId: string) {
  assertCan(actor.role, "tables.manage");
  const [table] = await db
    .update(diningTables)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(diningTables.id, tableId),
        eq(diningTables.establishmentId, actor.establishmentId),
      ),
    )
    .returning();

  if (!table) {
    throw new AppError("not_found", "Mesa não encontrada.");
  }

  return table;
}

async function assertEnvironment(establishmentId: string, environmentId: string) {
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(
      and(
        eq(environments.id, environmentId),
        eq(environments.establishmentId, establishmentId),
        isNull(environments.deletedAt),
      ),
    )
    .limit(1);

  if (!environment) {
    throw new AppError("not_found", "Ambiente não encontrado.");
  }
}

function normalizeCapacity(value: number | undefined) {
  const capacity = Number(value ?? 4);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new AppError("invalid_capacity", "Informe a capacidade de lugares.");
  }
  return capacity;
}
