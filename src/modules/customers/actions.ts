"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addressSchema,
  customerLoginSchema,
  customerRegisterSchema,
  deliveryOrderSchema,
} from "@/lib/validations/forms";
import { createDeliveryOrder } from "@/modules/orders/service";
import { getStorefront } from "@/modules/tenancy/service";
import { actionError, type ActionState } from "@/server/action";
import {
  endCustomerSession,
  getStoreAndCustomer,
  startCustomerSession,
} from "@/server/customer-session";
import { AppError } from "@/server/errors";

import { authenticateCustomer, createAddress, deleteAddress, registerCustomer } from "./service";

const nextPaths = { checkout: "checkout", pedidos: "pedidos", conta: "conta" } as const;

/** Só aceita destinos conhecidos, nunca uma URL vinda do formulário (evita open redirect). */
function destination(slug: string, next: FormDataEntryValue | null) {
  const key = String(next ?? "") as keyof typeof nextPaths;
  return `/loja/${slug}${key in nextPaths ? `/${nextPaths[key]}` : ""}`;
}

async function storeFromForm(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const store = await getStorefront(slug);
  if (!store) {
    throw new AppError("not_found", "Loja não encontrada.");
  }
  return store;
}

export async function registerCustomerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  let target: string;
  try {
    const store = await storeFromForm(formData);
    const parsed = customerRegisterSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const customer = await registerCustomer(store.id, parsed.data);
    await startCustomerSession(store.slug, customer.id);
    target = destination(store.slug, formData.get("next"));
  } catch (error) {
    return actionError(error);
  }
  redirect(target);
}

export async function loginCustomerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  let target: string;
  try {
    const store = await storeFromForm(formData);
    const parsed = customerLoginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const customer = await authenticateCustomer(store.id, parsed.data.email, parsed.data.password);
    if (!customer) {
      return { error: "E-mail ou senha incorretos." };
    }
    await startCustomerSession(store.slug, customer.id);
    target = destination(store.slug, formData.get("next"));
  } catch (error) {
    return actionError(error);
  }
  redirect(target);
}

export async function logoutCustomerAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  await endCustomerSession(slug);
  redirect(`/loja/${slug}`);
}

export async function createAddressAction(
  slug: string,
  input: Record<string, string>,
): Promise<{ error?: string; addressId?: string }> {
  try {
    const { customer } = await getStoreAndCustomer(slug);
    if (!customer) {
      return { error: "Sua sessão expirou. Entre novamente." };
    }
    const parsed = addressSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Endereço inválido." };
    }
    const address = await createAddress(customer, parsed.data);
    revalidatePath(`/loja/${slug}/checkout`);
    revalidatePath(`/loja/${slug}/conta`);
    return { addressId: address.id };
  } catch (error) {
    return actionError(error) ?? { error: "Não foi possível salvar o endereço." };
  }
}

export async function deleteAddressAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const slug = String(formData.get("slug") ?? "");
    const { customer } = await getStoreAndCustomer(slug);
    if (!customer) {
      return { error: "Sua sessão expirou. Entre novamente." };
    }
    await deleteAddress(customer, String(formData.get("addressId") ?? ""));
    revalidatePath(`/loja/${slug}/conta`);
    revalidatePath(`/loja/${slug}/checkout`);
    return { success: "Endereço removido." };
  } catch (error) {
    return actionError(error);
  }
}

export async function placeDeliveryOrderAction(
  slug: string,
  input: {
    addressId: string;
    paymentMethod: string;
    changeFor?: string;
    notes?: string;
    items: { productId: string; quantity: number }[];
  },
): Promise<{ error?: string; orderId?: string }> {
  try {
    const { customer } = await getStoreAndCustomer(slug);
    if (!customer) {
      return { error: "Sua sessão expirou. Entre novamente para finalizar o pedido." };
    }
    const parsed = deliveryOrderSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Dados do pedido inválidos." };
    }

    const order = await createDeliveryOrder(customer, parsed.data);
    revalidatePath("/painel/pedidos");
    revalidatePath(`/loja/${slug}/pedidos`);
    return { orderId: order.id };
  } catch (error) {
    return actionError(error) ?? { error: "Não foi possível enviar o pedido." };
  }
}
