import { getOrdersVersion } from "@/modules/orders/service";
import { can } from "@/server/authorization";
import { resolveActor } from "@/server/context";

/**
 * Versão atual dos pedidos do estabelecimento do usuário logado.
 * As telas operacionais consultam esta rota a cada poucos segundos e só recarregam quando a versão muda.
 * Resposta mínima (uma consulta indexada) para manter o custo baixo na Vercel e no Neon.
 */
export async function GET() {
  const { actor } = await resolveActor();
  if (!actor) {
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: noStore });
  }
  if (!can(actor.role, "orders.view")) {
    return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }

  const version = await getOrdersVersion(actor.establishmentId);
  return Response.json({ version }, { headers: noStore });
}

const noStore = { "Cache-Control": "no-store" };
