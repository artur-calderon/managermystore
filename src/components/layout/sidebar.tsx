"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";

import type { NavGroup } from "./navigation";

export function Sidebar({
  establishmentName,
  open,
  groups,
}: {
  establishmentName: string;
  open: boolean;
  groups: NavGroup[];
}) {
  const pathname = usePathname();

  return (
    <aside className="z-50 flex w-full shrink-0 flex-col border-b border-outline-variant/30 bg-surface-container-lowest md:fixed md:inset-y-0 md:left-0 md:h-screen md:w-64 md:border-r md:border-b-0">
      <div className="flex h-16 items-center gap-space-sm border-b border-outline-variant/20 px-space-lg">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Icon name="storefront" />
        </span>
        <span className="text-headline-sm font-semibold tracking-tight text-on-surface">Manager My Store</span>
      </div>
      <div className="border-b border-outline-variant/20 p-space-md">
        <Link
          href="/estabelecimentos"
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
                    className={`flex items-center justify-between rounded-lg px-space-sm py-1.5 text-body-compact transition-colors ${
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
  );
}
