import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { establishmentMembers, establishments, users } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { hashPassword } from "@/server/password";
import { slugify } from "@/server/slug";
import { transaction, type Tx } from "@/server/transaction";

import {
  findEstablishment,
  findEstablishmentBySlug,
  findMember,
  findMembership,
  findUserByEmail,
  insertEstablishment,
  insertMember,
  insertUser,
  listActiveMemberships,
  listMembers,
  lockEstablishment,
} from "./repository";

export type Actor = {
  userId: string;
  establishmentId: string;
  role: Role;
};

const assignableRoles: Role[] = ["admin", "waiter", "kitchen", "cashier"];

async function reserveSlug(tx: Tx, name: string) {
  const base = slugify(name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${randomBytes(2).toString("hex")}`;
    const slug = `${base.slice(0, 63 - suffix.length)}${suffix}`.replace(/-+$/g, "");

    try {
      return await insertEstablishment(tx, { name: name.trim(), slug });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("establishments_slug_unique") || attempt === 4) {
        throw error;
      }
    }
  }

  throw new AppError("slug_taken", "Este endereço público já está em uso.");
}

export async function registerEstablishment(input: {
  userName: string;
  email: string;
  password: string;
  establishmentName: string;
}) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return transaction(async (tx) => {
    if (await findUserByEmail(tx, email)) {
      throw new AppError("email_taken", "Este e-mail já está cadastrado.");
    }

    const user = await insertUser(tx, {
      name: input.userName.trim(),
      email,
      passwordHash,
    });
    const establishment = await reserveSlug(tx, input.establishmentName);
    const member = await insertMember(tx, {
      establishmentId: establishment.id,
      userId: user.id,
      role: "owner",
    });

    return { user, establishment, member };
  });
}

export async function addMember(
  actor: Actor,
  input: { name: string; email: string; password?: string; role: Role },
) {
  assertCan(actor.role, "members.manage");

  if (!assignableRoles.includes(input.role)) {
    throw new AppError("invalid_role", "Este papel não pode ser atribuído por aqui.");
  }

  const email = input.email.trim().toLowerCase();

  return transaction(async (tx) => {
    await lockEstablishment(tx, actor.establishmentId);
    let user = await findUserByEmail(tx, email);

    if (!user) {
      if (!input.password) {
        throw new AppError("password_required", "Informe uma senha para o novo funcionário.");
      }

      user = await insertUser(tx, {
        name: input.name.trim(),
        email,
        passwordHash: await hashPassword(input.password),
      });
    }

    const membership = await findMembership(tx, actor.establishmentId, user.id);

    if (membership && !membership.deletedAt) {
      throw new AppError("member_exists", "Este usuário já participa do estabelecimento.");
    }

    if (membership?.deletedAt) {
      const [updated] = await tx
        .update(establishmentMembers)
        .set({ role: input.role, deletedAt: null })
        .where(eq(establishmentMembers.id, membership.id))
        .returning();
      return updated;
    }

    return insertMember(tx, {
      establishmentId: actor.establishmentId,
      userId: user.id,
      role: input.role,
    });
  });
}

export async function removeMember(actor: Actor, memberId: string) {
  assertCan(actor.role, "members.manage");

  return transaction(async (tx) => {
    await lockEstablishment(tx, actor.establishmentId);
    const member = await findMember(tx, actor.establishmentId, memberId);

    if (!member || member.deletedAt) {
      throw new AppError("not_found", "Funcionário não encontrado.");
    }

    if (member.role === "owner") {
      throw new AppError("owner_required", "O proprietário ativo não pode ser removido.");
    }

    const [updated] = await tx
      .update(establishmentMembers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(establishmentMembers.id, member.id),
          eq(establishmentMembers.establishmentId, actor.establishmentId),
        ),
      )
      .returning();

    return updated;
  });
}

export async function transferOwnership(actor: Actor, memberId: string) {
  assertCan(actor.role, "ownership.transfer");

  return transaction(async (tx) => {
    await lockEstablishment(tx, actor.establishmentId);
    const current = await findMembership(tx, actor.establishmentId, actor.userId);

    if (!current || current.deletedAt || current.role !== "owner") {
      throw new AppError(
        "forbidden",
        "Somente o proprietário ativo pode transferir a propriedade.",
      );
    }

    const target = await findMember(tx, actor.establishmentId, memberId);

    if (!target || target.deletedAt) {
      throw new AppError("not_found", "Funcionário não encontrado.");
    }

    if (target.userId === actor.userId) {
      throw new AppError("invalid_target", "Escolha outro funcionário.");
    }

    await tx
      .update(establishmentMembers)
      .set({ role: "admin" })
      .where(eq(establishmentMembers.id, current.id));

    const [owner] = await tx
      .update(establishmentMembers)
      .set({ role: "owner" })
      .where(eq(establishmentMembers.id, target.id))
      .returning();

    return owner;
  });
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  try {
    const [user] = await db
      .update(users)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(eq(users.id, userId))
      .returning();
    return user;
  } catch (error) {
    const { rethrowDb } = await import("@/server/errors");
    rethrowDb(error);
  }
}

export async function updateEstablishment(
  actor: Actor,
  input: { name?: string; timezone?: string },
) {
  assertCan(actor.role, "establishment.update");

  const patch: { name?: string; timezone?: string } = {};
  if (input.name?.trim()) {
    patch.name = input.name.trim();
  }
  if (input.timezone?.trim()) {
    patch.timezone = input.timezone.trim();
  }

  const [establishment] = await db
    .update(establishments)
    .set(patch)
    .where(and(eq(establishments.id, actor.establishmentId), isNull(establishments.deletedAt)))
    .returning();

  if (!establishment) {
    throw new AppError("not_found", "Estabelecimento não encontrado.");
  }

  return establishment;
}

export async function getMemberships(userId: string) {
  return listActiveMemberships(db, userId);
}

export async function getMembers(actor: Actor) {
  assertCan(actor.role, "members.manage");
  return listMembers(db, actor.establishmentId);
}

export async function getEstablishmentForActor(actor: Actor) {
  const establishment = await findEstablishment(db, actor.establishmentId);
  if (!establishment || establishment.deletedAt) {
    throw new AppError("not_found", "Estabelecimento não encontrado.");
  }
  return establishment;
}

/**
 * Loja para o cardápio público: aparece mesmo fechada ou suspensa (com aviso de fechada).
 * Só lojas removidas não existem.
 */
export async function getStorefront(slug: string) {
  const establishment = await findEstablishmentBySlug(db, slug);
  if (!establishment || establishment.deletedAt) {
    return null;
  }
  return { ...establishment, acceptingOrders: isAcceptingOrders(establishment) };
}

export function isAcceptingOrders(establishment: { status: string; isOpen: boolean }) {
  return establishment.status === "active" && establishment.isOpen;
}

export async function setEstablishmentOpen(actor: Actor, isOpen: boolean) {
  assertCan(actor.role, "establishment.update");

  const [establishment] = await db
    .update(establishments)
    .set({ isOpen, updatedAt: new Date() })
    .where(and(eq(establishments.id, actor.establishmentId), isNull(establishments.deletedAt)))
    .returning();

  if (!establishment) {
    throw new AppError("not_found", "Estabelecimento não encontrado.");
  }

  return establishment;
}

export async function getPublicEstablishment(slug: string) {
  const establishment = await findEstablishmentBySlug(db, slug);
  if (!establishment || establishment.deletedAt || establishment.status !== "active") {
    throw new AppError("not_found", "Estabelecimento não encontrado.");
  }
  if (!establishment.isOpen) {
    throw new AppError("store_closed", "A loja está fechada no momento.");
  }
  return establishment;
}
