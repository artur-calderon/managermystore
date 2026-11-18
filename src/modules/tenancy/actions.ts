"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { loginSchema, memberSchema, registerSchema } from "@/lib/validations/forms";
import { ESTABLISHMENT_COOKIE, requireActor, requireUserId } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import {
  addMember,
  getMemberships,
  registerEstablishment,
  removeMember,
  setEstablishmentOpen,
  transferOwnership,
  updateEstablishment,
} from "./service";

export async function registerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    userName: formData.get("userName"),
    email: formData.get("email"),
    password: formData.get("password"),
    establishmentName: formData.get("establishmentName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const result = await registerEstablishment(parsed.data);
    (await cookies()).set(ESTABLISHMENT_COOKIE, result.establishment.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/painel",
    });
  } catch (error) {
    return actionError(error);
  }

  return null;
}

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const userId = await resolveUserAfterLogin(parsed.data.email, parsed.data.password);
    const memberships = await getMemberships(userId);
    const destination = memberships.length === 1 ? "/painel" : "/estabelecimentos";

    if (memberships.length === 1) {
      (await cookies()).set(ESTABLISHMENT_COOKIE, memberships[0].establishmentId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }

    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: destination,
    });
  } catch (error) {
    return actionError(error);
  }

  return null;
}

async function resolveUserAfterLogin(email: string, password: string) {
  const { authorizeCredentials } = await import("@/lib/credentials");
  const user = await authorizeCredentials(email, password);
  if (!user) {
    throw new (await import("@/server/errors")).AppError("invalid_login", "E-mail ou senha inválidos.");
  }
  return user.id;
}

export async function logoutAction() {
  await signOut({ redirectTo: "/entrar" });
}

export async function selectEstablishmentAction(formData: FormData) {
  const userId = await requireUserId();
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const memberships = await getMemberships(userId);
  const selected = memberships.find((membership) => membership.establishmentId === establishmentId);

  if (!selected) {
    redirect("/estabelecimentos");
  }

  (await cookies()).set(ESTABLISHMENT_COOKIE, selected.establishmentId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect(selected.role === "waiter" ? "/garcom" : "/painel");
}

export async function addMemberAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const actor = await requireActor();
    await addMember(actor, {
      ...parsed.data,
      password: parsed.data.password || undefined,
    });
    revalidatePath("/painel/funcionarios");
    return { success: "Funcionário salvo." };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeMemberAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await removeMember(actor, String(formData.get("memberId")));
    revalidatePath("/painel/funcionarios");
    return { success: "Funcionário desligado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function transferOwnershipAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await transferOwnership(actor, String(formData.get("memberId")));
    revalidatePath("/painel", "layout");
    return { success: "Propriedade transferida." };
  } catch (error) {
    return actionError(error);
  }
}

export async function setStoreOpenAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const open = formData.get("isOpen") === "true";
    await setEstablishmentOpen(actor, open);
    revalidatePath("/painel", "layout");
    revalidatePath(`/loja/${actor.slug}`);
    return { success: open ? "Loja aberta: o cardápio digital está recebendo pedidos." : "Loja fechada: o cardápio mostra o aviso de fechado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEstablishmentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateEstablishment(actor, {
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
    return { success: "Estabelecimento atualizado." };
  } catch (error) {
    return actionError(error);
  }
}
