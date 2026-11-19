import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tentativas de login que falharam, para limitar ataques de força bruta.
 * `key` identifica o alvo (e-mail da equipe, e-mail do cliente por loja) ou a origem (IP).
 * Fica no Postgres porque na Vercel cada requisição pode cair numa instância diferente.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("auth_attempts_key_created_idx").on(table.key, table.createdAt)],
);
