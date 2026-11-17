import { Suspense } from "react";
import { itemDetail, itemTitle } from "@/lib/order-item-options";
import { notFound } from "next/navigation";

import { LiveRefresh } from "@/components/shared/live-refresh";
import { StatusBadge, StatusTimeline } from "@/components/storefront/order-status";
import { StoreShell } from "@/components/storefront/store-shell";
import { Icon } from "@/components/ui/icon";
import { isPaymentMethod, paymentMethodLabels } from "@/lib/payment-methods";
import { listCustomerOrders } from "@/modules/orders/service";
import { requireCustomer } from "@/server/customer-session";
import { formatMoney } from "@/server/money";

export default function CustomerOrderPage(props: PageProps<"/loja/[slug]/pedidos/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <CustomerOrder {...props} />
    </Suspense>
  );
}

async function CustomerOrder({ params }: PageProps<"/loja/[slug]/pedidos/[id]">) {
  const { slug, id } = await params;
  const { store, customer } = await requireCustomer(slug, "pedidos");
  // Busca entre os pedidos do próprio cliente: um id de outro cliente simplesmente não é encontrado.
  const order = (await listCustomerOrders(customer, 50)).find((item) => item.id === id);
  if (!order) {
    notFound();
  }

  const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
  const createdAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: store.timezone,
  }).format(order.createdAt);

  return (
    <StoreShell
      slug={slug}
      storeName={store.name}
      title={`Pedido #${order.id.slice(0, 8)}`}
      backHref={`/loja/${slug}/pedidos`}
      customerName={customer.name}
    >
      <LiveRefresh endpoint={`/loja/${slug}/pedidos/versao`} intervalMs={5000} />
      <div className="flex flex-col gap-space-lg">
        <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-regular text-on-surface-variant">Feito em {createdAt}</span>
            <StatusBadge status={order.status} />
          </div>
          <StatusTimeline status={order.status} />
          {order.status !== "closed" && order.status !== "cancelled" ? (
            <p className="flex items-center gap-1.5 text-label-regular text-on-surface-variant">
              <span className="size-2 animate-pulse rounded-full bg-emerald-600" />
              Esta página se atualiza sozinha.
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <h2 className="flex items-center gap-1.5 text-headline-sm text-on-surface">
            <Icon name="shopping_bag" className="text-primary" />
            Itens
          </h2>
          <ul className="flex flex-col divide-y divide-surface-container">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2 py-2 text-body-compact">
                <span className="text-on-surface">
                  {item.quantity}× {itemTitle(item)}
                  {itemDetail(item) ? (
                    <span className="block text-label-regular text-on-surface-variant">{itemDetail(item)}</span>
                  ) : null}
                </span>
                <span className="text-on-surface-variant">{formatMoney(String(item.quantity * Number(item.unitPrice)))}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 border-t border-surface-container pt-2 text-body-compact">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatMoney(String(itemsTotal))}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Taxa de entrega</span>
              <span>{Number(order.deliveryFee) > 0 ? formatMoney(order.deliveryFee) : "Grátis"}</span>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-label-micro font-semibold tracking-wider text-on-surface-variant uppercase">Total</span>
              <span className="text-headline-sm font-bold text-primary">{formatMoney(order.totalAmount)}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1 flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">
              <Icon name="location_on" className="text-primary" />
              Entrega
            </h2>
            <p className="text-body-compact whitespace-pre-line text-on-surface-variant">{order.deliveryAddress}</p>
          </div>
          <div>
            <h2 className="mb-1 flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">
              <Icon name="payments" className="text-primary" />
              Pagamento na entrega
            </h2>
            <p className="text-body-compact text-on-surface-variant">
              {order.paymentMethod && isPaymentMethod(order.paymentMethod)
                ? paymentMethodLabels[order.paymentMethod]
                : order.paymentMethod}
              {order.changeFor ? ` · troco para ${formatMoney(order.changeFor)}` : ""}
            </p>
          </div>
          {order.notes ? (
            <div className="sm:col-span-2">
              <h2 className="mb-1 text-body-medium font-semibold text-on-surface">Observações</h2>
              <p className="text-body-compact whitespace-pre-line text-on-surface-variant">{order.notes}</p>
            </div>
          ) : null}
        </section>
      </div>
    </StoreShell>
  );
}
