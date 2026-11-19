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
  // Garçom lança pedidos novos pelo modo garçom; não altera itens de pedidos já enviados.
  waiter: ["catalog.view", "tables.view", "orders.view", "orders.create"],
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

/**
 * Permissão necessária para abrir cada tela (basta uma da lista). Vale também para quem digita o
 * endereço direto na barra do navegador — o menu só esconde o link. "/painel" (visão geral) é de todos.
 */
const pageRequirements: Record<string, readonly Action[]> = {
  "/garcom": ["orders.create"],
  "/painel/pedidos": ["orders.view"],
  "/painel/cozinha": ["orders.kitchen"],
  "/painel/mesas": ["tables.view", "tables.manage"],
  "/painel/mesas/cadastro": ["tables.manage"],
  "/painel/produtos": ["catalog.view", "catalog.manage"],
  "/painel/categorias": ["catalog.manage"],
  "/painel/caixa": ["cash.manage"],
  "/painel/delivery": ["delivery.manage"],
  "/painel/relatorios": ["reports.view"],
  "/painel/funcionarios": ["members.manage"],
};

export function canAccessPage(role: Role, path: string): boolean {
  const allowed = restrictedPages[role];
  if (allowed && !allowed.includes(path)) {
    return false;
  }
  const required = pageRequirements[path];
  return !required || required.some((action) => can(role, action));
}

/** Tela inicial de cada papel após o login. */
export function homePathFor(role: Role): string {
  return role === "waiter" ? "/garcom" : "/painel";
}
