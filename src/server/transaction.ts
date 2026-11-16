import { db, type Tx } from "@/lib/db";

import { rethrowDb } from "./errors";

export async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => run(tx));
  } catch (error) {
    rethrowDb(error);
  }
}

export type { Tx };
