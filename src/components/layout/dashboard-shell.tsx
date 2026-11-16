import type { Role } from "@/lib/db/schema";
import { can } from "@/server/authorization";

import { navigationFor } from "./navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DashboardShell({
  role,
  establishmentName,
  open,
  userName,
  activeOrders,
  occupiedTables,
  totalTables,
  children,
}: {
  role: Role;
  establishmentName: string;
  open: boolean;
  userName: string;
  activeOrders: number | null;
  occupiedTables: number | null;
  totalTables: number | null;
  children: React.ReactNode;
}) {
  const groups = navigationFor(role, {
    orders: activeOrders === null ? undefined : String(activeOrders),
    tables:
      occupiedTables === null || totalTables === null ? undefined : `${occupiedTables}/${totalTables}`,
  });

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <Sidebar establishmentName={establishmentName} open={open} groups={groups} />
      <div className="md:pl-64">
        <Topbar userName={userName} role={role} canCreateOrder={can(role, "orders.create")} />
        <main className="min-h-[calc(100vh-4rem)] px-space-lg py-space-lg md:pt-20">{children}</main>
      </div>
    </div>
  );
}
