"use server";

import { revalidatePath } from "next/cache";

import { productSchema } from "@/lib/validations/forms";
import { requireActor } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import { createCategory, createProduct, deactivateCategory, deactivateProduct, updateCategory, updateProduct } from "./service";

function revalidateCatalog() {
  revalidatePath("/painel/produtos");
  revalidatePath("/painel/categorias");
  revalidatePath("/painel/mesas");
  revalidatePath("/painel/pedidos");
}

export async function createCategoryAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await createCategory(actor, String(formData.get("name") ?? ""));
    revalidateCatalog();
    return { success: "Categoria criada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateCategory(actor, String(formData.get("categoryId")), String(formData.get("name") ?? ""));
    revalidateCatalog();
    return { success: "Categoria atualizada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivateCategoryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await deactivateCategory(actor, String(formData.get("categoryId")));
    revalidateCatalog();
    return { success: "Categoria desativada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createProductAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    costPrice: formData.get("costPrice") || undefined,
    stockQuantity: formData.get("stockQuantity"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const actor = await requireActor();
    await createProduct(actor, parsed.data);
    revalidateCatalog();
    return { success: "Produto criado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProductAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateProduct(actor, String(formData.get("productId")), {
      categoryId: String(formData.get("categoryId") ?? ""),
      name: String(formData.get("name") ?? ""),
      price: String(formData.get("price") ?? ""),
      costPrice: String(formData.get("costPrice") ?? ""),
      stockQuantity: String(formData.get("stockQuantity") ?? ""),
      description: String(formData.get("description") ?? ""),
      isAvailable: formData.get("isAvailable") === "on",
    });
    revalidateCatalog();
    return { success: "Produto atualizado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function setProductAvailabilityAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const available = formData.get("isAvailable") === "true";
    await updateProduct(actor, String(formData.get("productId")), { isAvailable: available });
    revalidateCatalog();
    return { success: available ? "Produto reativado no cardápio." : "Produto pausado no cardápio." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivateProductAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await deactivateProduct(actor, String(formData.get("productId")));
    revalidateCatalog();
    return { success: "Produto removido do cadastro." };
  } catch (error) {
    return actionError(error);
  }
}
