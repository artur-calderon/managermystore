"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";

import type { NavGroup } from "./navigation";

export function Sidebar({
  establishmentName,
  open,
  groups,
  mobileOpen,
  onClose,
}: {
  establishmentName: string;
  open: boolean;
  groups: NavGroup[];
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        id="painel-menu"
        aria-label="Menu principal"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-xl transition-transform duration-200 ease-out lg:w-64 lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-space-sm border-b border-outline-variant/20 px-space-lg">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Icon name="storefront" />
          </span>
          <span className="flex-1 truncate text-headline-sm font-semibold tracking-tight text-on-surface">
            Manager My Store
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="-mr-2 flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface lg:hidden"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>
        <div className="border-b border-outline-variant/20 p-space-md">
          <Link
            href="/estabelecimentos"
            onClick={onClose}
            className="block rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-sm transition-colors hover:border-outline-variant/60"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-body-medium font-medium text-on-surface">{establishmentName}</span>
              <Icon name="unfold_more" className="text-outline" />
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-label-micro font-medium">
              <span className={`size-2 rounded-full ${open ? "bg-emerald-600" : "bg-outline"}`} />
              <span className={open ? "text-emerald-800" : "text-outline"}>
                {open ? "Aberto" : "Suspenso"}
              </span>
            </span>
          </Link>
        </div>
        <div className="flex-1 space-y-space-md overflow-y-auto px-space-sm py-space-md">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-space-sm text-label-micro font-medium tracking-wider text-outline uppercase">
                {group.label}
              </p>
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center justify-between rounded-lg px-space-sm py-1.5 text-body-compact lg:min-h-0 transition-colors ${
                        active
                          ? "bg-primary-container font-medium text-on-primary-container shadow-sm"
                          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon name={item.icon} />
                        <span>{item.label}</span>
                      </span>
                      {item.badge ? (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-label-micro font-semibold ${
                            active ? "bg-primary-fixed text-on-primary-fixed" : "text-outline"
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
