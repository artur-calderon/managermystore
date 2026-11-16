import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const roleValues = ["owner", "admin", "waiter", "kitchen", "cashier"] as const;
export type Role = (typeof roleValues)[number];

export const establishments = pgTable(
  "establishments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("active"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check("establishments_status_check", sql`${table.status} in ('active', 'suspended')`),
    check(
      "establishments_slug_check",
      sql`${table.slug} = lower(${table.slug}) and char_length(${table.slug}) between 3 and 63 and ${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    index("establishments_status_idx").on(table.status),
  ],
);

export const establishmentMembers = pgTable(
  "establishment_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check(
      "establishment_members_role_check",
      sql`${table.role} in ('owner', 'admin', 'waiter', 'kitchen', 'cashier')`,
    ),
    unique("establishment_members_establishment_user_key").on(
      table.establishmentId,
      table.userId,
    ),
    unique("establishment_members_establishment_id_key").on(table.establishmentId, table.id),
    uniqueIndex("establishment_members_one_owner")
      .on(table.establishmentId)
      .where(sql`${table.role} = 'owner' and ${table.deletedAt} is null`),
    index("establishment_members_user_id_idx").on(table.userId),
    index("establishment_members_establishment_id_idx").on(table.establishmentId),
  ],
);
