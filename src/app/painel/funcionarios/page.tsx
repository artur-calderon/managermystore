import { Suspense } from "react";
import { connection } from "next/server";

import { MembersRegistry, type RegistryMember } from "@/components/members/members-registry";
import type { Role } from "@/lib/db/schema";
import { getMembers } from "@/modules/tenancy/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function MembersPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Members />
    </Suspense>
  );
}

async function Members() {
  await connection();
  const actor = await requirePageActor("/painel/funcionarios");
  const members = await getMembers(actor);

  const rows: RegistryMember[] = members.map((member) => ({
    id: member.id,
    name: member.name?.trim() || member.email || "Sem nome",
    email: member.email ?? "",
    role: member.role as Role,
    status: member.deletedAt ? "removed" : member.disabledAt ? "disabled" : "active",
    isSelf: member.userId === actor.userId,
  }));

  return <MembersRegistry members={rows} canTransferOwnership={can(actor.role, "ownership.transfer")} />;
}
