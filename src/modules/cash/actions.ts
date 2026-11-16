"use server";

import { revalidatePath } from "next/cache";

import { cashSchema } from "@/lib/validations/forms";
import { requireActor } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import { addCashMovement } from "./service";

export async function addCashMovementAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cashSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const actor = await requireActor();
    await addCashMovement(actor, parsed.data);
    revalidatePath("/painel");
    revalidatePath("/painel/caixa");
    return { success: "Movimentação registrada." };
  } catch (error) {
    return actionError(error);
  }
}
