import type { Role } from "@/lib/db/schema";
import { can, type Action } from "@/server/authorization";

export const roleLabels: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  waiter: "Garçom",
  kitchen: "Cozinha",
  cashier: "Caixa",
};

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  badge?: string;
  action?: Action;
  anyOf?: Action[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    label: "Operacional",
    items: [
      { href: "/painel", label: "Visão geral", icon: "grid_view", exact: true },
      { href: "/painel/pedidos", label: "Pedidos", icon: "receipt_long", action: "orders.view" },
      { href: "/painel/cozinha", label: "Cozinha", icon: "soup_kitchen", action: "orders.kitchen" },
      {
        href: "/painel/mesas",
        label: "Mesas",
        icon: "table_restaurant",
        anyOf: ["tables.view", "tables.manage"],
      },
    ],
  },
  {
    label: "Catálogo",
    items: [
      {
        href: "/painel/produtos",
        label: "Produtos",
        icon: "inventory_2",
        anyOf: ["catalog.view", "catalog.manage"],
      },
      { href: "/painel/categorias", label: "Categorias", icon: "category", action: "catalog.manage" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/painel/caixa", label: "Caixa", icon: "point_of_sale", action: "cash.manage" },
      { href: "/painel/relatorios", label: "Relatórios", icon: "bar_chart", action: "reports.view" },
      { href: "/painel/funcionarios", label: "Funcionários", icon: "badge", action: "members.manage" },
    ],
  },
];

export function navigationFor(role: Role, badges: { orders?: string; tables?: string } = {}) {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => {
          if (item.anyOf) {
            return item.anyOf.some((action) => can(role, action));
          }
          return !item.action || can(role, item.action);
        })
        .map((item) => ({
          ...item,
          badge: item.href === "/painel/pedidos" ? badges.orders : item.href === "/painel/mesas" ? badges.tables : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);
}

export const pageTitles: Record<string, string> = {
  "/painel": "Visão geral",
  "/painel/pedidos": "Pedidos",
  "/painel/cozinha": "Cozinha",
  "/painel/mesas": "Mesas",
  "/painel/mesas/cadastro": "Mesas e ambientes",
  "/painel/produtos": "Produtos e cardápio",
  "/painel/categorias": "Categorias",
  "/painel/caixa": "Caixa",
  "/painel/relatorios": "Relatórios",
  "/painel/funcionarios": "Funcionários",
};
