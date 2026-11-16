"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/server/context";
import { actionError, type ActionState } from "@/server/action";

import {
  createEnvironment,
  createTable,
  deactivateTable,
  reactivateTable,
  updateTable,
} from "./service";

function revalidateTables() {
  revalidatePath("/painel");
  revalidatePath("/painel/mesas");
  revalidatePath("/painel/mesas/cadastro");
}

function readTableInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    environmentId: String(formData.get("environmentId") ?? ""),
    capacity: Number(formData.get("capacity") ?? 4),
    notes: String(formData.get("notes") ?? ""),
    digitalMenuEnabled: formData.get("digitalMenuEnabled") === "on",
  };
}

export async function createEnvironmentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await createEnvironment(actor, String(formData.get("name") ?? ""));
    revalidateTables();
    return { success: "Ambiente criado." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createTableAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await createTable(actor, readTableInput(formData));
    revalidateTables();
    return { success: "Mesa criada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTableAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateTable(actor, String(formData.get("tableId")), readTableInput(formData));
    revalidateTables();
    return { success: "Mesa atualizada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivateTableAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await deactivateTable(actor, String(formData.get("tableId")));
    revalidateTables();
    return { success: "Mesa desativada. Ela fica em Desativadas e pode ser reativada." };
  } catch (error) {
    return actionError(error);
  }
}

export async function reactivateTableAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await reactivateTable(actor, String(formData.get("tableId")));
    revalidateTables();
    return { success: "Mesa reativada." };
  } catch (error) {
    return actionError(error);
  }
}
