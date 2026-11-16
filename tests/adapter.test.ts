import { randomUUID } from "node:crypto";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

const userIds: string[] = [];

afterAll(async () => {
  if (userIds.length > 0) {
    await db.delete(users).where(eq(users.id, userIds[0]));
  }
  await pool.end();
});

describe("contrato do Drizzle Adapter", () => {
  it("cria usuário, conta, sessão e token de verificação", async () => {
    const email = `auth-${randomUUID()}@example.com`;
    const user = await adapter.createUser!({
      id: randomUUID(),
      email,
      emailVerified: null,
      name: "Auth",
    });
    userIds.push(user.id);
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const byEmail = await adapter.getUserByEmail!(email);
    expect(byEmail?.id).toBe(user.id);

    await adapter.linkAccount!({
      userId: user.id,
      type: "oauth",
      provider: "test",
      providerAccountId: randomUUID(),
    });
    const linked = await adapter.getUserByAccount!({
      provider: "test",
      providerAccountId: (await db.select().from(accounts).where(eq(accounts.userId, user.id)))[0]
        .providerAccountId,
    });
    expect(linked?.id).toBe(user.id);

    const session = await adapter.createSession!({
      sessionToken: randomUUID(),
      userId: user.id,
      expires: new Date(Date.now() + 60_000),
    });
    const loaded = await adapter.getSessionAndUser!(session.sessionToken);
    expect(loaded?.user.id).toBe(user.id);
    await adapter.deleteSession!(session.sessionToken);
    expect(await adapter.getSessionAndUser!(session.sessionToken)).toBeNull();

    const token = await adapter.createVerificationToken!({
      identifier: email,
      token: randomUUID(),
      expires: new Date(Date.now() + 60_000),
    });
    expect(token).toBeTruthy();
    const used = await adapter.useVerificationToken!({
      identifier: token!.identifier,
      token: token!.token,
    });
    expect(used?.token).toBe(token!.token);
    expect(
      await adapter.useVerificationToken!({ identifier: token!.identifier, token: token!.token }),
    ).toBeNull();
  });
});
