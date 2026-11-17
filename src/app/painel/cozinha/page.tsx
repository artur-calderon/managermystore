import { Suspense } from "react";
import { connection } from "next/server";

import { LiveRefresh } from "@/components/shared/live-refresh";
import { itemDetail, itemTitle } from "@/lib/order-item-options";
import { BoundForm, SubmitButton } from "@/components/shared/form";
import { advanceOrderAction } from "@/modules/orders/actions";
import { listActiveOrders } from "@/modules/orders/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function KitchenPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Kitchen />
    </Suspense>
  );
}

async function Kitchen() {
  await connection();
  const actor = await requirePageActor("/painel/cozinha");
  const orders = (await listActiveOrders(actor.establishmentId)).filter(
    (order) => order.status !== "out_for_delivery",
  );

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Cozinha</h1>
      <LiveRefresh />
      {orders.length === 0 ? <p>Nenhum pedido ativo.</p> : null}
      {orders.map((order) => (
        <article key={order.id} className="grid gap-2 border p-3">
          <h2>
            {order.id.slice(0, 8)} ·{" "}
            {order.tableName ?? (order.channel === "delivery" ? "Delivery" : "Catálogo")} · {order.status}
          </h2>
          <p>{order.createdAt.toLocaleString("pt-BR")}</p>
          {order.customerName ? <p>Cliente: {order.customerName}</p> : null}
          {order.notes ? <p className="whitespace-pre-line">Obs.: {order.notes}</p> : null}
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.quantity} × {itemTitle(item)}
                </strong>
                {itemDetail(item) ? <p className="pl-4 text-primary">{itemDetail(item)}</p> : null}
              </li>
            ))}
          </ul>
          {can(actor.role, "orders.kitchen") &&
          (order.status === "pending" || order.status === "preparing") ? (
            <BoundForm action={advanceOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton>{order.status === "pending" ? "Preparar" : "Marcar pronto"}</SubmitButton>
            </BoundForm>
          ) : (
            <p>Pronto para o caixa</p>
          )}
        </article>
      ))}
    </section>
  );
}
