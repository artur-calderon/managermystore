import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth";
import { roleValues, type Role } from "@/lib/db/schema";
import { getMemberships } from "@/modules/tenancy/service";

import { canAccessPage, homePathFor } from "./authorization";

export const ESTABLISHMENT_COOKIE = "mms_establishment";

type SessionActorResolution =
  | { actor: SessionActor; redirectTo?: undefined }
  | { actor?: undefined; redirectTo: "/entrar" | "/cadastrar" | "/estabelecimentos" };

export type SessionActor = {
  userId: string;
  userName: string;
  establishmentId: string;
  role: Role;
  establishmentName: string;
  slug: string;
  timezone: string;
};

/** Resolve o usuário logado e o estabelecimento atual, sem redirecionar (útil em Route Handlers). */
export async function resolveActor(): Promise<SessionActorResolution> {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    return { redirectTo: "/entrar" };
  }

  const memberships = await getMemberships(session.user.id);
  if (memberships.length === 0) {
    return { redirectTo: "/cadastrar" };
  }

  const selected = (await cookies()).get(ESTABLISHMENT_COOKIE)?.value;
  const current =
    memberships.find((membership) => membership.establishmentId === selected) ??
    (memberships.length === 1 ? memberships[0] : null);

  if (!current) {
    return { redirectTo: "/estabelecimentos" };
  }

  return {
    actor: {
      userId: session.user.id,
      userName: session.user.name || session.user.email || "Usuário",
      establishmentId: current.establishmentId,
      role: asRole(current.role),
      establishmentName: current.establishmentName,
      slug: current.slug,
      timezone: current.timezone,
    },
  };
}

export async function requireActor(): Promise<SessionActor> {
  const resolved = await resolveActor();
  if (resolved.redirectTo) {
    redirect(resolved.redirectTo);
  }
  return resolved.actor;
}

export async function requireUserId() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/entrar");
  }
  return session.user.id;
}

function asRole(value: string): Role {
  if (!roleValues.includes(value as Role)) {
    throw new Error("Papel inválido.");
  }
  return value as Role;
}

/** Igual a `requireActor`, mas redireciona papéis sem acesso à tela para a tela inicial deles. */
export async function requirePageActor(path: string) {
  const actor = await requireActor();
  if (!canAccessPage(actor.role, path)) {
    redirect(homePathFor(actor.role));
  }
  return actor;
}
