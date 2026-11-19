import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
  staffScope,
} from "@/server/login-throttle";
import { verifyPassword } from "@/server/password";

/**
 * Confere e-mail e senha da equipe. Lança `rate_limited` (AppError) depois de muitas falhas
 * seguidas da mesma conta ou do mesmo IP — vale também para quem chama a rota do Auth.js direto.
 */
export async function authorizeCredentials(email: string, password: string, ip: string | null = null) {
  const normalized = email.trim().toLowerCase();
  const scope = staffScope(normalized, ip);
  await assertLoginAllowed(scope);

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  if (!user?.passwordHash || user.disabledAt || !(await verifyPassword(password, user.passwordHash))) {
    await recordLoginFailure(scope);
    return null;
  }

  await clearLoginFailures(scope);
  return { id: user.id, email: user.email, name: user.name };
}
