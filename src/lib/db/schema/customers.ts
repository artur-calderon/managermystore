import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { establishments } from "./tenancy";

/**
 * Clientes do cardápio digital. São separados da equipe (`users`) e pertencem a uma loja:
 * o mesmo e-mail pode ter contas independentes em lojas diferentes.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("customers_establishment_id_key").on(table.establishmentId, table.id),
    uniqueIndex("customers_establishment_email_uidx").on(table.establishmentId, sql`lower(${table.email})`),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    street: text("street").notNull(),
    number: text("number").notNull(),
    complement: text("complement"),
    neighborhood: text("neighborhood").notNull(),
    city: text("city").notNull(),
    postalCode: text("postal_code"),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("customer_addresses_customer_idx").on(table.customerId)],
);

/** Sessões do cliente. Guardamos só o hash do token; o token fica no cookie httpOnly. */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("customer_sessions_customer_idx").on(table.customerId)],
);
