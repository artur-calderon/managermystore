import { and, count, eq, gt, inArray, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { authAttempts } from "@/lib/db/schema";

import { AppError } from "./errors";

/** Janela em que as falhas contam. */
const WINDOW_MS = 15 * 60 * 1000;
/** Falhas permitidas por conta (e-mail) dentro da janela. */
const MAX_PER_ACCOUNT = 5;
/** Falhas permitidas por IP dentro da janela (várias contas tentadas da mesma origem). */
const MAX_PER_IP = 30;

export type LoginScope = { account: string; ip: string | null };

/** Chaves de limite: e-mail da equipe ou e-mail do cliente dentro da loja, mais o IP. */
export function staffScope(email: string, ip: string | null): LoginScope {
  return { account: `staff:${email.trim().toLowerCase()}`, ip };
}

export function customerScope(establishmentId: string, email: string, ip: string | null): LoginScope {
  return { account: `customer:${establishmentId}:${email.trim().toLowerCase()}`, ip };
}

/** IP do cliente (na Vercel, `x-forwarded-for` é preenchido pela plataforma). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

/** Lança `rate_limited` se a conta ou o IP passaram do limite de falhas. Checar antes da senha. */
export async function assertLoginAllowed(scope: LoginScope) {
  const since = new Date(Date.now() - WINDOW_MS);
  const ipKey = scope.ip ? `ip:${scope.ip}` : null;
  const rows = await db
    .select({ key: authAttempts.key, total: count() })
    .from(authAttempts)
    .where(and(inArray(authAttempts.key, ipKey ? [scope.account, ipKey] : [scope.account]), gt(authAttempts.createdAt, since)))
    .groupBy(authAttempts.key);

  const totals = new Map(rows.map((row) => [row.key, row.total]));
  if ((totals.get(scope.account) ?? 0) >= MAX_PER_ACCOUNT || (ipKey && (totals.get(ipKey) ?? 0) >= MAX_PER_IP)) {
    throw new AppError("rate_limited", "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.");
  }
}

export async function recordLoginFailure(scope: LoginScope) {
  const keys = scope.ip ? [scope.account, `ip:${scope.ip}`] : [scope.account];
  await db.insert(authAttempts).values(keys.map((key) => ({ key })));

  // Limpeza ocasional do que já saiu da janela (evita a tabela crescer sem fim).
  if (Math.random() < 0.05) {
    await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  }
}

/** Login certo zera as falhas da conta (as do IP continuam contando). */
export async function clearLoginFailures(scope: LoginScope) {
  await db.delete(authAttempts).where(eq(authAttempts.key, scope.account));
}
