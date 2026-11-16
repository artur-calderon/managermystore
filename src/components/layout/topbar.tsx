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
}: {
  userName: string;
  role: Role;
  canCreateOrder: boolean;
}) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Painel";

  return (
    <header className="z-40 flex h-16 items-center justify-between gap-space-md border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg md:fixed md:top-0 md:right-0 md:left-64">
      <div className="flex min-w-0 items-center gap-space-sm">
        <span className="hidden text-body-compact text-outline sm:inline">Gestão comercial</span>
        <Icon name="chevron_right" className="hidden text-[16px] text-outline sm:inline" />
        <span className="truncate text-body-medium font-semibold text-on-surface">{title}</span>
      </div>
      <div className="flex items-center gap-space-md">
        {canCreateOrder ? (
          <Link
            href="/painel/pedidos"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-body-medium font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <Icon name="add" />
            Novo pedido
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
