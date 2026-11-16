import { and, eq, isNull, sql } from "drizzle-orm";

import type { Db } from "@/lib/db";
import { establishmentMembers, establishments, users } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  return user ?? null;
}

export async function insertUser(
  db: Db,
  input: { name: string; email: string; passwordHash: string },
) {
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
    })
    .returning();

  return user;
}

export async function findEstablishmentBySlug(db: Db, slug: string) {
  const [establishment] = await db
    .select()
    .from(establishments)
    .where(eq(establishments.slug, slug))
    .limit(1);

  return establishment ?? null;
}

export async function insertEstablishment(
  db: Db,
  input: { name: string; slug: string; timezone?: string },
) {
  const [establishment] = await db
    .insert(establishments)
    .values({
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
    })
    .returning();

  return establishment;
}

export async function insertMember(
  db: Db,
  input: { establishmentId: string; userId: string; role: Role },
) {
  const [member] = await db
    .insert(establishmentMembers)
    .values(input)
    .returning();

  return member;
}

export async function lockEstablishment(db: Db, establishmentId: string) {
  await db.execute(
    sql`select id from establishments where id = ${establishmentId} for update`,
  );
}

export async function listMembers(db: Db, establishmentId: string) {
  return db
    .select({
      id: establishmentMembers.id,
      userId: establishmentMembers.userId,
      role: establishmentMembers.role,
      deletedAt: establishmentMembers.deletedAt,
      name: users.name,
      email: users.email,
      disabledAt: users.disabledAt,
    })
    .from(establishmentMembers)
    .innerJoin(users, eq(users.id, establishmentMembers.userId))
    .where(eq(establishmentMembers.establishmentId, establishmentId));
}

export async function findMember(db: Db, establishmentId: string, memberId: string) {
  const [member] = await db
    .select()
    .from(establishmentMembers)
    .where(
      and(
        eq(establishmentMembers.establishmentId, establishmentId),
        eq(establishmentMembers.id, memberId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function findMembership(db: Db, establishmentId: string, userId: string) {
  const [member] = await db
    .select()
    .from(establishmentMembers)
    .where(
      and(
        eq(establishmentMembers.establishmentId, establishmentId),
        eq(establishmentMembers.userId, userId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function listActiveMemberships(db: Db, userId: string) {
  return db
    .select({
      establishmentId: establishments.id,
      establishmentName: establishments.name,
      slug: establishments.slug,
      role: establishmentMembers.role,
      timezone: establishments.timezone,
    })
    .from(establishmentMembers)
    .innerJoin(establishments, eq(establishments.id, establishmentMembers.establishmentId))
    .where(
      and(
        eq(establishmentMembers.userId, userId),
        isNull(establishmentMembers.deletedAt),
        isNull(establishments.deletedAt),
      ),
    );
}

export async function findEstablishment(db: Db, establishmentId: string) {
  const [establishment] = await db
    .select()
    .from(establishments)
    .where(eq(establishments.id, establishmentId))
    .limit(1);

  return establishment ?? null;
}
