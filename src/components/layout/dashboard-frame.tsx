"use client";

import { useEffect, useState } from "react";

import type { Role } from "@/lib/db/schema";

import type { NavGroup } from "./navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Guarda o estado do menu lateral (gaveta no celular/tablet, fixo a partir de `lg`). */
export function DashboardFrame({
  establishmentName,
  open,
  groups,
  userName,
  role,
  canCreateOrder,
  newOrderHref,
  children,
}: {
  establishmentName: string;
  open: boolean;
  groups: NavGroup[];
  userName: string;
  role: Role;
  canCreateOrder: boolean;
  newOrderHref: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <Sidebar
        establishmentName={establishmentName}
        open={open}
        groups={groups}
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar
          userName={userName}
          role={role}
          canCreateOrder={canCreateOrder}
          newOrderHref={newOrderHref}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((current) => !current)}
        />
        <main className="min-h-[calc(100vh-4rem)] px-space-lg pt-20 pb-space-lg">{children}</main>
      </div>
    </div>
  );
}
