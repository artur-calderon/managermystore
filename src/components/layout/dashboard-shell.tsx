import type { Role } from "@/lib/db/schema";
import { can, homePathFor } from "@/server/authorization";

import { navigationFor } from "./navigation";
import { DashboardFrame } from "./dashboard-frame";

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
    <DashboardFrame
      establishmentName={establishmentName}
      open={open}
      groups={groups}
      userName={userName}
      role={role}
      canCreateOrder={can(role, "orders.create")}
      newOrderHref={role === "waiter" ? homePathFor(role) : "/painel/pedidos"}
    >
      {children}
    </DashboardFrame>
  );
}
