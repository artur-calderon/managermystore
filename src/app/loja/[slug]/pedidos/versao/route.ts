import { getCustomerOrdersVersion } from "@/modules/orders/service";
import { getStoreAndCustomer } from "@/server/customer-session";

/** Versão dos pedidos do cliente logado; "Meus pedidos" recarrega quando ela muda (sem WebSocket). */
export async function GET(_request: Request, { params }: RouteContext<"/loja/[slug]/pedidos/versao">) {
  const { slug } = await params;
  const { customer } = await getStoreAndCustomer(slug);
  if (!customer) {
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: noStore });
  }

  return Response.json({ version: await getCustomerOrdersVersion(customer) }, { headers: noStore });
}

const noStore = { "Cache-Control": "no-store" };
