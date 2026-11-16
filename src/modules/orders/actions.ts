"use server";

import { revalidatePath } from "next/cache";

import { catalogOrderSchema } from "@/lib/validations/forms";
import { requireActor } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import {
  advanceOrder,
  cancelOrder,
  closeOrder,
  createCatalogOrder,
  createWaiterOrder,
  removeOrderItem,
  upsertOrderItem,
} from "./service";

export async function createWaiterOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const productId = String(formData.get("productId") ?? "");
    const quantity = Number(formData.get("quantity") ?? 1);
    const order = await createWaiterOrder(actor, {
      tableId: String(formData.get("tableId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items: productId ? [{ productId, quantity }] : [],
    });
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/mesas");
    return { success: `Pedido ${order.id.slice(0, 8)} criado.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function upsertItemAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await upsertOrderItem(actor, String(formData.get("orderId")), {
      productId: String(formData.get("productId") ?? ""),
      quantity: Number(formData.get("quantity") ?? 1),
    });
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/mesas");
    return { success: "Item atualizado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeItemAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await removeOrderItem(actor, String(formData.get("orderId")), String(formData.get("itemId")));
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/mesas");
    return { success: "Item removido." };
  } catch (error) {
    return actionError(error);
  }
}

export async function advanceOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await advanceOrder(actor, String(formData.get("orderId")));
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/cozinha");
    return { success: "Status atualizado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await cancelOrder(actor, String(formData.get("orderId")));
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/mesas");
    revalidatePath("/painel/caixa");
    return { success: "Pedido cancelado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function closeOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await closeOrder(actor, String(formData.get("orderId")));
    revalidatePath("/painel");
    revalidatePath("/painel/pedidos");
    revalidatePath("/painel/mesas");
    revalidatePath("/painel/caixa");
    return { success: "Pedido fechado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function placeCatalogOrderAction(input: {
  slug: string;
  customerName?: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
}) {
  const parsed = catalogOrderSchema.safeParse({
    customerName: input.customerName,
    notes: input.notes,
    items: input.items,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const order = await createCatalogOrder(input.slug, parsed.data);
    return { id: order.id, totalAmount: order.totalAmount };
  } catch (error) {
    return actionError(error);
  }
}
