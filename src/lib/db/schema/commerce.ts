import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { customers } from "./customers";
import { establishmentMembers, establishments } from "./tenancy";

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("categories_establishment_id_key").on(table.establishmentId, table.id),
    uniqueIndex("categories_name_active_key")
      .on(table.establishmentId, table.name)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: money("price").notNull(),
    costPrice: money("cost_price"),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("products_establishment_id_key").on(table.establishmentId, table.id),
    foreignKey({
      columns: [table.establishmentId, table.categoryId],
      foreignColumns: [categories.establishmentId, categories.id],
      name: "products_category_establishment_fk",
    }).onDelete("restrict"),
    uniqueIndex("products_name_active_key")
      .on(table.establishmentId, table.categoryId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index("products_establishment_category_idx").on(table.establishmentId, table.categoryId),
    check("products_price_check", sql`${table.price} >= 0`),
    check("products_cost_price_check", sql`${table.costPrice} is null or ${table.costPrice} >= 0`),
    check("products_stock_quantity_check", sql`${table.stockQuantity} >= 0`),
  ],
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("environments_establishment_id_key").on(table.establishmentId, table.id),
    uniqueIndex("environments_name_active_key")
      .on(table.establishmentId, table.name)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const diningTables = pgTable(
  "tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(4),
    notes: text("notes"),
    digitalMenuEnabled: boolean("digital_menu_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("tables_establishment_id_key").on(table.establishmentId, table.id),
    foreignKey({
      columns: [table.establishmentId, table.environmentId],
      foreignColumns: [environments.establishmentId, environments.id],
      name: "tables_environment_establishment_fk",
    }).onDelete("restrict"),
    uniqueIndex("tables_name_active_key")
      .on(table.establishmentId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index("tables_establishment_environment_idx").on(table.establishmentId, table.environmentId),
    check("tables_capacity_check", sql`${table.capacity} > 0`),
  ],
);

export const orderStatuses = [
  "pending",
  "preparing",
  "ready",
  "out_for_delivery",
  "closed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
/** Pedidos em andamento (ainda não fechados nem cancelados). */
export const activeOrderStatuses = ["pending", "preparing", "ready", "out_for_delivery"] as const;
export type ActiveOrderStatus = (typeof activeOrderStatuses)[number];
export const orderChannels = ["waiter", "catalog", "delivery"] as const;
export type OrderChannel = (typeof orderChannels)[number];

export { paymentMethods, type PaymentMethod } from "../../payment-methods";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "restrict" }),
    tableId: uuid("table_id"),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    totalAmount: money("total_amount").notNull().default("0"),
    createdByUserId: uuid("created_by_user_id"),
    customerName: text("customer_name"),
    notes: text("notes"),
    // Delivery: cliente, cópia do endereço/telefone no momento do pedido, taxa e pagamento.
    customerId: uuid("customer_id"),
    customerPhone: text("customer_phone"),
    deliveryAddress: text("delivery_address"),
    deliveryFee: money("delivery_fee").notNull().default("0"),
    paymentMethod: text("payment_method"),
    changeFor: money("change_for"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    // Atualizado em toda alteração: é o que as telas em tempo real observam.
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("orders_establishment_id_key").on(table.establishmentId, table.id),
    foreignKey({
      columns: [table.establishmentId, table.tableId],
      foreignColumns: [diningTables.establishmentId, diningTables.id],
      name: "orders_table_establishment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.establishmentId, table.createdByUserId],
      foreignColumns: [establishmentMembers.establishmentId, establishmentMembers.userId],
      name: "orders_member_establishment_fk",
    }).onDelete("restrict"),
    check(
      "orders_channel_check",
      sql`(
        (${table.channel} = 'waiter' and ${table.tableId} is not null and ${table.createdByUserId} is not null)
        or (${table.channel} = 'catalog' and ${table.createdByUserId} is null)
        or (
          ${table.channel} = 'delivery' and ${table.tableId} is null and ${table.createdByUserId} is null
          and ${table.customerId} is not null and ${table.deliveryAddress} is not null and ${table.paymentMethod} is not null
        )
      )`,
    ),
    check(
      "orders_status_check",
      sql`${table.status} in ('pending', 'preparing', 'ready', 'out_for_delivery', 'closed', 'cancelled')`,
    ),
    check("orders_channel_value_check", sql`${table.channel} in ('waiter', 'catalog', 'delivery')`),
    check("orders_total_check", sql`${table.totalAmount} >= 0`),
    check("orders_delivery_fee_check", sql`${table.deliveryFee} >= 0`),
    check("orders_change_for_check", sql`${table.changeFor} is null or ${table.changeFor} > 0`),
    foreignKey({
      columns: [table.establishmentId, table.customerId],
      foreignColumns: [customers.establishmentId, customers.id],
      name: "orders_customer_establishment_fk",
    }).onDelete("restrict"),
    index("orders_customer_idx").on(table.customerId, table.updatedAt),
    index("orders_establishment_status_idx").on(table.establishmentId, table.status),
    index("orders_active_status_idx")
      .on(table.establishmentId, table.status)
      .where(sql`${table.status} in ('pending', 'preparing', 'ready', 'out_for_delivery')`),
    index("orders_establishment_table_idx").on(table.establishmentId, table.tableId),
    index("orders_establishment_updated_idx").on(table.establishmentId, table.updatedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id").notNull(),
    orderId: uuid("order_id").notNull(),
    productId: uuid("product_id").notNull(),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("order_items_order_product_key").on(table.orderId, table.productId),
    foreignKey({
      columns: [table.establishmentId, table.orderId],
      foreignColumns: [orders.establishmentId, orders.id],
      name: "order_items_order_establishment_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.establishmentId, table.productId],
      foreignColumns: [products.establishmentId, products.id],
      name: "order_items_product_establishment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.establishmentId],
      foreignColumns: [establishments.id],
      name: "order_items_establishment_fk",
    }).onDelete("restrict"),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check("order_items_price_check", sql`${table.unitPrice} >= 0`),
    index("order_items_establishment_product_idx").on(table.establishmentId, table.productId),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    establishmentId: uuid("establishment_id")
      .notNull()
      .references(() => establishments.id, { onDelete: "restrict" }),
    orderId: uuid("order_id"),
    type: text("type").notNull(),
    amount: money("amount").notNull(),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.establishmentId, table.orderId],
      foreignColumns: [orders.establishmentId, orders.id],
      name: "cash_movements_order_establishment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.establishmentId, table.createdByUserId],
      foreignColumns: [establishmentMembers.establishmentId, establishmentMembers.userId],
      name: "cash_movements_member_establishment_fk",
    }).onDelete("restrict"),
    check("cash_movements_type_check", sql`${table.type} in ('in', 'out')`),
    check("cash_movements_amount_check", sql`${table.amount} > 0`),
    check(
      "cash_movements_description_check",
      sql`${table.type} = 'in' or ${table.description} is not null`,
    ),
    uniqueIndex("cash_movements_one_sale")
      .on(table.orderId)
      .where(sql`${table.orderId} is not null and ${table.type} = 'in'`),
    index("cash_movements_establishment_occurred_idx").on(
      table.establishmentId,
      table.occurredAt,
    ),
  ],
);

export const deliverySettings = pgTable(
  "delivery_settings",
  {
    establishmentId: uuid("establishment_id")
      .primaryKey()
      .references(() => establishments.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    fee: money("fee").notNull().default("0"),
    paymentMethods: text("payment_methods")
      .array()
      .notNull()
      .default(sql`'{cash,pix,credit_card,debit_card}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("delivery_settings_fee_check", sql`${table.fee} >= 0`),
    check(
      "delivery_settings_payment_methods_check",
      sql`${table.paymentMethods} <@ array['cash', 'pix', 'credit_card', 'debit_card', 'meal_voucher']::text[]`,
    ),
  ],
);
