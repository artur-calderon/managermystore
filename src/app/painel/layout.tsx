import { Suspense } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { activeOrderStatuses } from "@/lib/db/schema";
import { listOrders } from "@/modules/orders/service";
import { listTables } from "@/modules/tables/service";
import { getEstablishmentForActor } from "@/modules/tenancy/service";
import { can } from "@/server/authorization";
import { requireActor } from "@/server/context";


export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="bg-surface p-6 text-body-compact text-outline">Carregando…</p>}>
      <PainelFrame>{children}</PainelFrame>
    </Suspense>
  );
}

async function PainelFrame({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const establishment = await getEstablishmentForActor(actor);
  const [tables, orders] = await Promise.all([
    can(actor.role, "tables.view") ? listTables(actor.establishmentId) : Promise.resolve(null),
    can(actor.role, "orders.view")
      ? listOrders(actor.establishmentId, [...activeOrderStatuses])
      : Promise.resolve(null),
  ]);
  const visibleTables = tables?.filter((table) => !table.deletedAt) ?? null;

  return (
    <DashboardShell
      role={actor.role}
      establishmentName={actor.establishmentName}
      open={establishment.status === "active"}
      userName={actor.userName}
      activeOrders={orders?.length ?? null}
      occupiedTables={visibleTables?.filter((table) => table.occupied).length ?? null}
      totalTables={visibleTables?.length ?? null}
    >
      {children}
    </DashboardShell>
  );
}
