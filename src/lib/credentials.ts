import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/server/password";

export async function authorizeCredentials(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  if (!user?.passwordHash || user.disabledAt) {
    return null;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name };
}
