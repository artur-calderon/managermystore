import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import {
  createCustomerSession,
  deleteCustomerSession,
  findCustomerBySession,
  type Customer,
} from "@/modules/customers/service";
import { getStorefront } from "@/modules/tenancy/service";

/**
 * Sessão do cliente do cardápio digital.
 * Cookie httpOnly com escopo no caminho da loja (`/loja/<slug>`): cada loja tem sua própria sessão
 * e a sessão do cliente nunca é enviada para o painel da equipe.
 */
const COOKIE = "mms_customer";

function cookieOptions(slug: string, expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/loja/${slug}`,
    expires,
  };
}

export async function getStoreAndCustomer(slug: string) {
  await connection();
  const store = await getStorefront(slug);
  if (!store) {
    return { store: null, customer: null };
  }

  const token = (await cookies()).get(COOKIE)?.value;
  const customer = token ? await findCustomerBySession(store.id, token) : null;
  return { store, customer };
}

/** Exige cliente logado; senão manda para o login da loja e volta para `next` depois. */
export async function requireCustomer(slug: string, next: "checkout" | "pedidos" | "conta") {
  const { store, customer } = await getStoreAndCustomer(slug);
  if (!store) {
    redirect("/");
  }
  if (!customer) {
    redirect(`/loja/${slug}/entrar?next=${next}`);
  }
  return { store, customer: customer as Customer };
}

export async function startCustomerSession(slug: string, customerId: string) {
  const { token, expiresAt } = await createCustomerSession(customerId);
  (await cookies()).set(COOKIE, token, cookieOptions(slug, expiresAt));
}

export async function endCustomerSession(slug: string) {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await deleteCustomerSession(token);
  }
  store.set(COOKIE, "", cookieOptions(slug, new Date(0)));
}
