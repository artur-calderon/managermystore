import { activeOrderStatuses } from "@/lib/db/schema";
import { LiveRefresh } from "@/components/shared/live-refresh";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { updateEstablishmentAction } from "@/modules/tenancy/actions";
import { listOrders } from "@/modules/orders/service";
import { getReport, getSalesByChannel } from "@/modules/reports/service";
import { listTables } from "@/modules/tables/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";
import { formatMoney } from "@/server/money";


const statusLabels = {
  pending: "Pendente",
  preparing: "Preparando",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  closed: "Fechado",
  cancelled: "Cancelado",
} as const;

const statusTones = {
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  preparing: "border-sky-200 bg-sky-50 text-sky-800",
  ready: "border-purple-200 bg-purple-50 text-purple-900",
  out_for_delivery: "border-orange-200 bg-orange-50 text-orange-900",
  closed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-transparent bg-error-container text-on-error-container",
} as const;

const channelLabels = {
  waiter: "Salão",
  catalog: "Catálogo",
  delivery: "Delivery",
} as const;

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  const actor = await requirePageActor("/painel");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: actor.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [report, channels, orders, tables] = await Promise.all([
    can(actor.role, "reports.view") ? getReport(actor, today, today) : Promise.resolve(null),
    can(actor.role, "reports.view") ? getSalesByChannel(actor, today, today) : Promise.resolve(null),
    can(actor.role, "orders.view")
      ? listOrders(actor.establishmentId, [...activeOrderStatuses])
      : Promise.resolve(null),
    can(actor.role, "tables.view") ? listTables(actor.establishmentId) : Promise.resolve(null),
  ]);

  const visibleTables = tables?.filter((table) => !table.deletedAt) ?? [];
  const occupied = visibleTables.filter((table) => table.occupied).length;
  const free = visibleTables.length - occupied;
  const occupancy = visibleTables.length === 0 ? 0 : Math.round((occupied / visibleTables.length) * 100);
  const ticket =
    report && report.orderCount > 0
      ? formatMoney(Number(report.revenue) / report.orderCount)
      : null;
  const channelTotal = (channels ?? []).reduce((sum, channel) => sum + Number(channel.total), 0);

  return (
    <div className="flex flex-col gap-space-lg">
      {can(actor.role, "orders.view") ? <LiveRefresh /> : null}
      <section className="flex flex-col justify-between gap-space-md xl:flex-row xl:items-center">
        <div>
          <h1 className="text-headline-md font-semibold tracking-tight text-on-surface">Visão geral</h1>
          <p className="mt-0.5 text-body-compact text-outline">
            Acompanhamento de {actor.establishmentName} no dia de hoje
          </p>
        </div>
        {can(actor.role, "orders.create") ? (
          <Link
            href="/painel/pedidos"
            className="inline-flex h-8 w-fit items-center rounded-lg bg-primary px-3 text-body-medium font-medium text-on-primary"
          >
            Novo pedido
          </Link>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
        {report ? (
          <MetricCard
            label="Faturamento hoje"
            value={formatMoney(report.revenue)}
            detail={`${report.orderCount} pedidos fechados`}
          />
        ) : null}
        {report ? (
          <MetricCard
            label="Pedidos fechados"
            value={String(report.orderCount)}
            detail={ticket ? `Ticket médio: ${ticket}` : "Nenhum pedido fechado hoje"}
          />
        ) : null}
        {tables ? (
          <MetricCard
            label="Ocupação do salão"
            value={`${occupancy}%`}
            detail={`${occupied} ocupadas · ${free} livres`}
            aside={<span className="text-[11px] text-outline">{occupied}/{visibleTables.length}</span>}
          />
        ) : null}
        {report ? (
          <MetricCard
            label="Saldo do caixa hoje"
            value={formatMoney(report.balance)}
            detail={`Entradas ${formatMoney(report.inflow)} · saídas ${formatMoney(report.outflow)}`}
          />
        ) : null}
      </section>

      <section className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        {orders ? (
          <Panel
            className="xl:col-span-8"
            title="Pedidos em andamento"
            description="Pendentes, em preparo e prontos"
            action={
              <Link href="/painel/pedidos" className="text-label-micro font-medium text-primary hover:underline">
                Ver pedidos
              </Link>
            }
          >
            {orders.length === 0 ? (
              <p className="px-space-md py-6 text-body-compact text-outline">Nenhum pedido ativo agora.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-outline-variant/10 text-body-compact">
                    {orders.slice(0, 8).map((order) => (
                      <tr key={order.id} className="hover:bg-surface-container-low/50">
                        <td className="px-space-md py-3.5 font-mono font-medium text-on-surface">
                          {order.id.slice(0, 8)}
                        </td>
                        <td className="px-space-md py-3.5 text-on-surface">
                          {order.tableName ?? order.customerName ?? channelLabel(order.channel)}
                        </td>
                        <td className="px-space-md py-3.5 text-outline">
                          {order.createdAt.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: actor.timezone,
                          })}
                        </td>
                        <td className="px-space-md py-3.5 text-right font-mono font-medium text-on-surface">
                          {formatMoney(order.totalAmount)}
                        </td>
                        <td className="px-space-md py-3.5 text-right">
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${statusTone(order.status)}`}>
                            {statusLabel(order.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        ) : null}

        <div className="flex flex-col gap-space-md xl:col-span-4">
          {tables ? (
            <Panel title="Status das mesas" description={`${occupied}/${visibleTables.length} ocupadas`}>
              <div className="grid grid-cols-2 gap-2 p-space-md text-body-compact">
                <div className="rounded-lg bg-surface-container-low p-2.5">
                  <p className="text-label-micro text-outline">Ocupadas</p>
                  <p className="text-metric-headline font-semibold text-on-surface">{occupied}</p>
                </div>
                <div className="rounded-lg bg-surface-container-low p-2.5">
                  <p className="text-label-micro text-outline">Livres</p>
                  <p className="text-metric-headline font-semibold text-emerald-700">{free}</p>
                </div>
              </div>
              <div className="flex justify-end border-t border-outline-variant/20 px-space-md py-2">
                <Link href="/painel/mesas" className="text-label-micro font-medium text-primary hover:underline">
                  Gerenciar salão
                </Link>
              </div>
            </Panel>
          ) : null}

          {report ? (
            <Panel title="Mais pedidos hoje">
              {report.topProducts.length === 0 ? (
                <p className="px-space-md py-4 text-body-compact text-outline">Nenhum item vendido hoje.</p>
              ) : (
                <ul className="space-y-3 px-space-md py-space-md text-body-compact">
                  {report.topProducts.slice(0, 5).map((product, index) => (
                    <li key={`${product.productId}-${product.productName}`} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-[11px] font-semibold text-outline">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-medium text-on-surface">{product.productName}</span>
                      </span>
                      <span className="text-label-micro text-outline">{product.quantity} un</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {channels ? (
            <Panel title="Vendas por canal" description="Pedidos fechados hoje">
              <div className="space-y-3 px-space-md py-space-md">
                {channelTotal === 0 ? (
                  <p className="text-body-compact text-outline">Nenhuma venda hoje.</p>
                ) : (
                  channels.map((channel) => {
                    const share = Math.round((Number(channel.total) / channelTotal) * 100);
                    return (
                      <div key={channel.channel} className="space-y-1">
                        <div className="flex justify-between text-label-micro font-medium text-on-surface">
                          <span>{channelLabel(channel.channel)}</span>
                          <span>{share}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-low">
                          <div
                            className={`h-full rounded-full ${channel.channel === "waiter" ? "bg-primary" : "bg-tertiary-container"}`}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
          ) : null}
        </div>
      </section>

      {can(actor.role, "establishment.update") ? (
        <Panel title="Estabelecimento" description={`Catálogo público em /loja/${actor.slug}`}>
          <div className="max-w-lg p-space-md">
            <BoundForm action={updateEstablishmentAction}>
              <label className="grid gap-1 text-label-regular text-outline">
                Nome
                <input className={fieldClassName} name="name" defaultValue={actor.establishmentName} />
              </label>
              <label className="grid gap-1 text-label-regular text-outline">
                Fuso horário
                <input className={fieldClassName} name="timezone" defaultValue={actor.timezone} />
              </label>
              <SubmitButton>Salvar</SubmitButton>
            </BoundForm>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function statusLabel(status: string) {
  return status in statusLabels ? statusLabels[status as keyof typeof statusLabels] : status;
}

function statusTone(status: string) {
  return status in statusTones ? statusTones[status as keyof typeof statusTones] : statusTones.pending;
}

function channelLabel(channel: string) {
  return channel in channelLabels ? channelLabels[channel as keyof typeof channelLabels] : channel;
}
