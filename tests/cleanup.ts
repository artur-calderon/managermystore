import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  cashMovements,
  categories,
  diningTables,
  environments,
  orderItems,
  orders,
  products,
  establishments,
  users,
} from "@/lib/db/schema";

export async function removeTenant(establishmentId: string, userIds: string[]) {
  await db.delete(cashMovements).where(eq(cashMovements.establishmentId, establishmentId));
  await db.delete(orderItems).where(eq(orderItems.establishmentId, establishmentId));
  await db.delete(orders).where(eq(orders.establishmentId, establishmentId));
  await db.delete(products).where(eq(products.establishmentId, establishmentId));
  await db.delete(categories).where(eq(categories.establishmentId, establishmentId));
  await db.delete(diningTables).where(eq(diningTables.establishmentId, establishmentId));
  await db.delete(environments).where(eq(environments.establishmentId, establishmentId));
  await db.delete(establishments).where(eq(establishments.id, establishmentId));

  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}
