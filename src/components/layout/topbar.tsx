"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { logoutAction } from "@/modules/tenancy/actions";

import { pageTitles, roleLabels } from "./navigation";
import type { Role } from "@/lib/db/schema";

export function Topbar({
  userName,
  role,
  canCreateOrder,
  newOrderHref,
  menuOpen,
  onToggleMenu,
}: {
  userName: string;
  role: Role;
  canCreateOrder: boolean;
  newOrderHref: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Painel";

  return (
    <header className="fixed top-0 right-0 left-0 z-40 flex h-16 items-center justify-between gap-space-sm border-b border-outline-variant/30 bg-surface-container-lowest px-space-md sm:gap-space-md sm:px-space-lg lg:left-64">
      <div className="flex min-w-0 items-center gap-space-sm">
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
          aria-controls="painel-menu"
          className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface lg:hidden"
        >
          <Icon name="menu" className="text-[24px]" />
        </button>
        <span className="hidden text-body-compact text-outline sm:inline">Gestão comercial</span>
        <span className="hidden sm:inline-flex">
          <Icon name="chevron_right" className="text-[16px] text-outline" />
        </span>
        <span className="truncate text-body-medium font-semibold text-on-surface">{title}</span>
      </div>
      <div className="flex shrink-0 items-center gap-space-sm sm:gap-space-md">
        {canCreateOrder ? (
          <Link
            href={newOrderHref}
            aria-label="Novo pedido"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded bg-primary px-2.5 text-body-medium font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container sm:h-8 sm:px-3"
          >
            <Icon name="add" />
            <span className="hidden sm:inline">Novo pedido</span>
          </Link>
        ) : null}
        <div className="flex items-center gap-space-sm border-l border-outline-variant/30 pl-space-sm">
          <div className="hidden text-right sm:block">
            <p className="text-body-compact leading-tight font-medium text-on-surface">{userName}</p>
            <p className="text-label-micro leading-tight text-outline">{roleLabels[role]}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-body-compact text-outline hover:text-on-surface">
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
