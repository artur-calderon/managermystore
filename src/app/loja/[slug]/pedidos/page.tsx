import { Suspense } from "react";
import { itemTitle } from "@/lib/order-item-options";
import Link from "next/link";

import { LiveRefresh } from "@/components/shared/live-refresh";
import { StatusBadge } from "@/components/storefront/order-status";
import { StoreShell } from "@/components/storefront/store-shell";
import { Icon } from "@/components/ui/icon";
import { listCustomerOrders } from "@/modules/orders/service";
import { requireCustomer } from "@/server/customer-session";
import { formatMoney } from "@/server/money";

export default function CustomerOrdersPage(props: PageProps<"/loja/[slug]/pedidos">) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <CustomerOrders {...props} />
    </Suspense>
  );
}

async function CustomerOrders({ params }: PageProps<"/loja/[slug]/pedidos">) {
  const { slug } = await params;
  const { store, customer } = await requireCustomer(slug, "pedidos");
  const orders = await listCustomerOrders(customer);
  const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: store.timezone,
  });

  return (
    <StoreShell slug={slug} storeName={store.name} title="Meus pedidos" customerName={customer.name}>
      <LiveRefresh endpoint={`/loja/${slug}/pedidos/versao`} intervalMs={5000} />
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="receipt_long" className="text-[36px] text-outline" />
          <p className="text-body-medium text-on-surface">Você ainda não fez pedidos aqui.</p>
          <Link href={`/loja/${slug}`} className="h-11 rounded-lg bg-primary px-4 leading-[2.75rem] font-medium text-on-primary">
            Ver cardápio
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/loja/${slug}/pedidos/${order.id}`}
                className="flex flex-col gap-1.5 rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-medium font-semibold text-on-surface">
                    Pedido #{order.id.slice(0, 8)}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="line-clamp-1 text-body-compact text-on-surface-variant">
                  {order.items.map((item) => `${item.quantity}× ${itemTitle(item)}`).join(", ")}
                </p>
                <div className="flex items-center justify-between text-label-regular text-on-surface-variant">
                  <span>{dateFormat.format(order.createdAt)}</span>
                  <span className="text-metric-table font-semibold text-on-surface">{formatMoney(order.totalAmount)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StoreShell>
  );
}
