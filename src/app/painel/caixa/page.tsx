import { Suspense } from "react";
import { connection } from "next/server";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { Icon } from "@/components/ui/icon";
import { addCashMovementAction } from "@/modules/cash/actions";
import { listCashMovements } from "@/modules/cash/service";
import { cancelOrderAction, closeOrderAction } from "@/modules/orders/actions";
import { isPaymentMethod, paymentMethodLabels } from "@/lib/payment-methods";
import { listClosableOrders } from "@/modules/orders/service";
import { getEstablishmentForActor } from "@/modules/tenancy/service";
import { formatMoney, fromCents, toCents } from "@/server/money";
import { requirePageActor } from "@/server/context";

export default function CashPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Cash />
    </Suspense>
  );
}

async function Cash() {
  await connection();
  const actor = await requirePageActor("/painel/caixa");
  const [establishment, ready, movements] = await Promise.all([
    getEstablishmentForActor(actor),
    listClosableOrders(actor.establishmentId),
    listCashMovements(actor),
  ]);

  let inflow = 0;
  let outflow = 0;
  let sales = 0;
  let salesCount = 0;
  let outflowCount = 0;

  for (const movement of movements) {
    const cents = toCents(movement.amount);
    if (movement.type === "in") {
      inflow += cents;
      if (movement.orderId) {
        sales += cents;
        salesCount += 1;
      }
    } else {
      outflow += cents;
      outflowCount += 1;
    }
  }

  const open = establishment.status === "active";

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md border-b border-outline-variant/20 pb-space-lg lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-headline-md font-semibold tracking-tight text-on-surface">Caixa</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-micro font-medium ${
                open
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-outline-variant/40 bg-surface-container text-outline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-emerald-600" : "bg-outline"}`} />
              {open ? "Aberto" : "Suspenso"}
            </span>
          </div>
          <p className="text-body-compact text-outline">
            Operador: <span className="font-medium text-on-surface">{actor.userName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#entrada"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3.5 text-body-compact font-medium text-on-surface hover:bg-surface-container-low"
          >
            <Icon name="add" />
            Entrada
          </a>
          <a
            href="#saida"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3.5 text-body-compact font-medium text-on-surface hover:bg-surface-container-low"
          >
            <Icon name="remove" />
            Saída
          </a>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Saldo" value={formatMoney(fromCents(inflow - outflow))} detail="Entradas menos saídas" />
        <Metric
          label="Vendas lançadas"
          value={formatMoney(fromCents(sales))}
          detail={`${salesCount} ${salesCount === 1 ? "pedido fechado" : "pedidos fechados"}`}
          tone="positive"
        />
        <Metric
          label="Saídas"
          value={outflow === 0 ? formatMoney(0) : formatMoney(fromCents(-outflow))}
          detail={`${outflowCount} ${outflowCount === 1 ? "retirada registrada" : "retiradas registradas"}`}
          tone="negative"
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm lg:col-span-8">
          <div className="mb-1 flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <h2 className="text-headline-sm font-semibold text-on-surface">Extrato</h2>
            <span className="text-label-micro text-outline">{movements.length} lançamentos</span>
          </div>
          {movements.length === 0 ? (
            <p className="py-6 text-body-compact text-outline">Nenhuma movimentação.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-compact">
                <thead>
                  <tr className="border-b border-outline-variant/20 text-label-micro tracking-wider text-outline uppercase">
                    <th className="w-28 py-2 font-medium">Quando</th>
                    <th className="py-2 font-medium">Descrição</th>
                    <th className="py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {movements.map((movement) => {
                    const incoming = movement.type === "in";
                    return (
                      <tr key={movement.id}>
                        <td className="py-3 font-mono text-label-regular text-outline">
                          {movement.occurredAt.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: actor.timezone,
                          })}
                        </td>
                        <td className="py-3">
                          <div className="font-medium text-on-surface">{movementTitle(movement)}</div>
                          <div className="text-label-micro text-outline">{movementKind(movement)}</div>
                        </td>
                        <td
                          className={`py-3 text-right font-semibold ${incoming ? "text-emerald-800" : "text-error"}`}
                        >
                          {incoming ? "+" : "−"}
                          {formatMoney(movement.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-space-lg lg:col-span-4">
          <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm">
            <h2 className="text-headline-sm font-semibold text-on-surface">Prontos para fechar</h2>
            <p className="mb-3 text-body-compact text-outline">O fechamento lança o total como entrada no caixa.</p>
            {ready.length === 0 ? (
              <p className="text-body-compact text-outline">Nenhum pedido pronto.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {ready.map((order) => (
                  <li key={order.id} className="rounded-lg border border-outline-variant/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-label-micro text-outline">#{order.id.slice(0, 8)}</p>
                        <p className="text-body-compact font-medium text-on-surface">{placeLabel(order)}</p>
                        {order.channel === "delivery" ? (
                          <p className="text-label-regular text-on-surface-variant">
                            Delivery · {order.paymentMethod && isPaymentMethod(order.paymentMethod)
                              ? paymentMethodLabels[order.paymentMethod]
                              : "pagamento não informado"}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-body-compact font-semibold">{formatMoney(order.totalAmount)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <BoundForm action={closeOrderAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <button
                          type="submit"
                          className="h-9 w-full rounded bg-primary text-body-compact font-semibold text-on-primary hover:bg-primary-container"
                        >
                          Fechar
                        </button>
                      </BoundForm>
                      <BoundForm action={cancelOrderAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <button
                          type="submit"
                          className="h-9 w-full rounded border border-outline-variant/40 text-body-compact font-medium text-error"
                        >
                          Cancelar
                        </button>
                      </BoundForm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="entrada" className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm">
            <h2 className="mb-3 text-headline-sm font-semibold text-on-surface">Entrada</h2>
            <BoundForm action={addCashMovementAction}>
              <input type="hidden" name="type" value="in" />
              <input className={fieldClassName} name="amount" placeholder="Valor" required />
              <input className={fieldClassName} name="description" placeholder="Descrição, se houver" />
              <SubmitButton>Registrar entrada</SubmitButton>
            </BoundForm>
          </section>

          <section id="saida" className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm">
            <h2 className="mb-3 text-headline-sm font-semibold text-on-surface">Saída</h2>
            <BoundForm action={addCashMovementAction}>
              <input type="hidden" name="type" value="out" />
              <input className={fieldClassName} name="amount" placeholder="Valor" required />
              <input className={fieldClassName} name="description" placeholder="Motivo" required />
              <SubmitButton>Registrar saída</SubmitButton>
            </BoundForm>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor = tone === "positive" ? "text-emerald-800" : tone === "negative" ? "text-error" : "text-on-surface";

  return (
    <article className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <span className="block text-label-regular font-medium text-outline">{label}</span>
      <span className={`mt-2 block text-metric-headline font-semibold tracking-tight ${valueColor}`}>{value}</span>
      <span className="mt-1 block text-label-micro text-outline">{detail}</span>
    </article>
  );
}

function movementTitle(movement: {
  orderId: string | null;
  type: string;
  description: string | null;
  tableName: string | null;
  customerName: string | null;
  channel: string | null;
}) {
  if (movement.orderId) {
    return `Venda — ${placeLabel(movement)}`;
  }
  return movement.description?.trim() || (movement.type === "in" ? "Entrada" : "Saída");
}

function movementKind(movement: { orderId: string | null; type: string }) {
  if (movement.orderId) return `Pedido #${movement.orderId.slice(0, 8)}`;
  return movement.type === "in" ? "Entrada" : "Saída";
}

function placeLabel(order: { tableName: string | null; customerName: string | null; channel: string | null }) {
  if (order.tableName) return order.tableName;
  if (order.customerName) return order.customerName;
  return order.channel === "catalog" ? "Catálogo" : order.channel === "delivery" ? "Delivery" : "Salão";
}
