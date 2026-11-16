import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth";
import { roleValues, type Role } from "@/lib/db/schema";
import { getMemberships } from "@/modules/tenancy/service";

export const ESTABLISHMENT_COOKIE = "mms_establishment";

export async function requireActor() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/entrar");
  }

  const memberships = await getMemberships(session.user.id);
  if (memberships.length === 0) {
    redirect("/cadastrar");
  }

  const selected = (await cookies()).get(ESTABLISHMENT_COOKIE)?.value;
  const current =
    memberships.find((membership) => membership.establishmentId === selected) ??
    (memberships.length === 1 ? memberships[0] : null);

  if (!current) {
    redirect("/estabelecimentos");
  }

  return {
    userId: session.user.id,
    userName: session.user.name || session.user.email || "Usuário",
    establishmentId: current.establishmentId,
    role: asRole(current.role),
    establishmentName: current.establishmentName,
    slug: current.slug,
    timezone: current.timezone,
  };
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
