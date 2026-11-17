import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";

import {
  TablesRegistry,
  type RegistryEnvironment,
  type RegistryTable,
} from "@/components/tables/tables-registry";
import { listEnvironments, listTables } from "@/modules/tables/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function TableRegistryPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Registry />
    </Suspense>
  );
}

async function Registry() {
  await connection();
  const actor = await requirePageActor("/painel/mesas/cadastro");
  if (!can(actor.role, "tables.manage")) {
    redirect("/painel/mesas");
  }

  const [tables, environments] = await Promise.all([
    listTables(actor.establishmentId),
    listEnvironments(actor.establishmentId),
  ]);

  const rows: RegistryTable[] = tables.map((table) => ({
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    notes: table.notes,
    digitalMenuEnabled: table.digitalMenuEnabled,
    environmentId: table.environmentId,
    environmentName: table.environmentName,
    occupied: table.occupied,
    active: table.deletedAt === null,
  }));

  const environmentRows: RegistryEnvironment[] = environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
  }));

  return (
    <TablesRegistry
      tables={rows}
      environments={environmentRows}
      catalogHref={`/loja/${actor.slug}`}
    />
  );
}
