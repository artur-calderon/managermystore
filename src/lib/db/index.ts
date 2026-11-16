import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL não está definida. Copie .env.example para .env.local e informe a connection string do Neon.",
    );
  }

  return databaseUrl;
}

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({ connectionString: getDatabaseUrl() });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Db = Database | Tx;
