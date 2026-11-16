import { Suspense } from "react";

import { selectEstablishmentAction } from "@/modules/tenancy/actions";
import { getMemberships } from "@/modules/tenancy/service";
import { requireUserId } from "@/server/context";

export default function EstablishmentsPage() {
  return (
    <Suspense fallback={<p className="p-6">Carregando…</p>}>
      <Establishments />
    </Suspense>
  );
}

async function Establishments() {
  const userId = await requireUserId();
  const memberships = await getMemberships(userId);

  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Escolha o estabelecimento</h1>
      {memberships.length === 0 ? <p>Nenhum estabelecimento encontrado.</p> : null}
      {memberships.map((membership) => (
        <form key={membership.establishmentId} action={selectEstablishmentAction}>
          <input type="hidden" name="establishmentId" value={membership.establishmentId} />
          <button type="submit">
            {membership.establishmentName} ({membership.role})
          </button>
        </form>
      ))}
    </main>
  );
}
