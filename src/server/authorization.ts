import type { Role } from "@/lib/db/schema";

import { AppError } from "./errors";

export const actions = [
  "members.manage",
  "ownership.transfer",
  "catalog.manage",
  "catalog.view",
  "tables.manage",
  "tables.view",
  "orders.view",
  "orders.create",
  "orders.updateItems",
  "orders.kitchen",
  "orders.close",
  "orders.cancel",
  "cash.manage",
  "reports.view",
  "establishment.update",
  "delivery.manage",
] as const;

export type Action = (typeof actions)[number];

const staff: Action[] = [
  "catalog.manage",
  "catalog.view",
  "tables.manage",
  "tables.view",
  "orders.view",
  "orders.create",
  "orders.updateItems",
  "orders.kitchen",
  "orders.close",
  "orders.cancel",
  "cash.manage",
  "reports.view",
  "establishment.update",
  "delivery.manage",
  "members.manage",
];

const grants: Record<Role, readonly Action[]> = {
  owner: [...staff, "ownership.transfer"],
  admin: staff,
  waiter: ["catalog.view", "tables.view", "orders.view", "orders.create", "orders.updateItems"],
  kitchen: ["catalog.view", "orders.view", "orders.kitchen"],
  cashier: ["orders.view", "orders.close", "orders.cancel", "cash.manage", "reports.view"],
};

export function can(role: Role, action: Action): boolean {
  return grants[role].includes(action);
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new AppError("forbidden", "Você não tem permissão para esta operação.");
  }
}

/**
 * Papéis com acesso restrito a um conjunto fechado de telas do painel.
 * Papéis ausentes aqui acessam o painel normalmente (cada tela ainda checa suas próprias permissões).
 */
const restrictedPages: Partial<Record<Role, readonly string[]>> = {
  waiter: ["/garcom", "/painel/pedidos"],
};

export function canAccessPage(role: Role, path: string): boolean {
  const allowed = restrictedPages[role];
  return !allowed || allowed.includes(path);
}

/** Tela inicial de cada papel após o login. */
export function homePathFor(role: Role): string {
  return role === "waiter" ? "/garcom" : "/painel";
}
