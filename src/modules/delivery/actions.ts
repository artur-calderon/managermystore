"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import { updateDeliverySettings } from "./service";

export async function updateDeliverySettingsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const settings = await updateDeliverySettings(actor, {
      enabled: formData.get("enabled") === "on",
      fee: String(formData.get("fee") ?? "0"),
      paymentMethods: formData.getAll("paymentMethods").map(String),
    });
    revalidatePath("/painel/delivery");
    revalidatePath("/painel/pedidos");
    return { success: settings.enabled ? "Delivery ativado e configurado." : "Configuração salva. Delivery desligado." };
  } catch (error) {
    return actionError(error);
  }
}
