"use client";

import { useMemo, useState } from "react";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { Icon } from "@/components/ui/icon";
import {
  advanceOrderAction,
  cancelOrderAction,
  closeOrderAction,
  createWaiterOrderAction,
  dispatchOrderAction,
  removeItemAction,
  upsertItemAction,
} from "@/modules/orders/actions";
import { formatMoney } from "@/server/money";

export type BoardItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
};

export type BoardOrder = {
  id: string;
  status: "pending" | "preparing" | "ready" | "out_for_delivery" | "closed" | "cancelled";
  channel: "waiter" | "catalog" | "delivery";
  tableName: string | null;
  customerName: string | null;
  notes: string | null;
  totalAmount: string;
  createdAt: string;
  items: BoardItem[];
};

type Option = { id: string; name: string };

const baseColumns = [
  { status: "pending", title: "Novos" },
  { status: "preparing", title: "Em preparo" },
  { status: "ready", title: "Pronto" },
  { status: "closed", title: "Fechados" },
] as const;

const deliveryColumn = { status: "out_for_delivery", title: "Saiu para entrega" } as const;

const statusLabels: Record<BoardOrder["status"], string> = {
  pending: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  closed: "Fechado",
  cancelled: "Cancelado",
};

export function OrdersBoard({
  orders,
  tables,
  products,
  now,
  timeZone,
  canCreate,
  canUpdateItems,
  canKitchen,
  canClose,
  canCancel,
  deliveryEnabled = false,
}: {
  orders: BoardOrder[];
  tables: Option[];
  products: Option[];
  now: string;
  timeZone: string;
  canCreate: boolean;
  canUpdateItems: boolean;
  canKitchen: boolean;
  canClose: boolean;
  canCancel: boolean;
  deliveryEnabled?: boolean;
}) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  // A coluna de entrega só aparece para lojas com delivery (ou se ainda houver pedido nela).
  const showDelivery = deliveryEnabled || orders.some((order) => order.status === "out_for_delivery");
  const columns = showDelivery
    ? [baseColumns[0], baseColumns[1], baseColumns[2], deliveryColumn, baseColumns[3]]
    : [...baseColumns];
  const [channel, setChannel] = useState<"all" | BoardOrder["channel"]>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (channel !== "all" && order.channel !== channel) return false;
      if (!term) return true;
      const haystack = [
        order.id,
        order.tableName,
        order.customerName,
        order.notes,
        ...order.items.map((item) => item.productName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [channel, orders, query]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const activeCount = orders.filter((order) => order.status !== "closed" && order.status !== "cancelled").length;
  const counts = {
    all: orders.length,
    waiter: orders.filter((order) => order.channel === "waiter").length,
    catalog: orders.filter((order) => order.channel === "catalog").length,
    delivery: orders.filter((order) => order.channel === "delivery").length,
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-4 border-b border-outline-variant/20 pb-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-headline-md font-semibold tracking-tight text-on-surface">Pedidos</h1>
          <span className="text-body-compact font-medium text-outline">{activeCount} ativos</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-outline-variant/20 bg-surface-container-low p-1 text-body-compact font-medium">
            <button
              type="button"
              className={viewButton(view === "kanban")}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
            <button type="button" className={viewButton(view === "list")} onClick={() => setView("list")}>
              Lista
            </button>
          </div>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-body-compact font-medium text-on-primary shadow-sm hover:bg-primary-container"
              onClick={() => {
                setSelectedId(null);
                setCreating(true);
              }}
            >
              <Icon name="add" />
              Novo pedido
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1 overflow-x-auto text-body-compact">
          <FilterButton active={channel === "all"} onClick={() => setChannel("all")}>
            Todos ({counts.all})
          </FilterButton>
          <FilterButton active={channel === "waiter"} onClick={() => setChannel("waiter")}>
            Salão ({counts.waiter})
          </FilterButton>
          <FilterButton active={channel === "catalog"} onClick={() => setChannel("catalog")}>
            Catálogo ({counts.catalog})
          </FilterButton>
          {showDelivery || counts.delivery > 0 ? (
            <FilterButton active={channel === "delivery"} onClick={() => setChannel("delivery")}>
              Delivery ({counts.delivery})
            </FilterButton>
          ) : null}
        </div>
        <div className="relative w-full sm:w-64">
          <Icon name="search" className="absolute top-2 left-2.5 text-[16px] text-outline" />
          <input
            className="h-8 w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest pr-3 pl-8 text-body-compact text-on-surface outline-none placeholder:text-outline focus:border-primary"
            placeholder="Buscar pedidos..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {view === "kanban" ? (
        <div
          className={`grid grid-cols-1 items-start gap-5 md:grid-cols-2 ${
            showDelivery ? "xl:grid-cols-3 2xl:grid-cols-5" : "xl:grid-cols-4"
          }`}
        >
          {columns.map((column) => {
            const columnOrders = filtered.filter((order) => order.status === column.status);
            return (
              <section key={column.status} className="flex flex-col gap-3 rounded-xl bg-surface-container-low/50 p-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-body-medium font-semibold text-on-surface">{column.title}</span>
                  <span className="text-label-micro font-medium text-outline">{columnOrders.length}</span>
                </div>
                {columnOrders.length === 0 ? (
                  <p className="px-1 py-4 text-body-compact text-outline">Nenhum pedido</p>
                ) : (
                  columnOrders.map((order) => (
                    <article
                      key={order.id}
                      className="flex cursor-pointer flex-col gap-2.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3.5 shadow-sm"
                      onClick={() => {
                        setCreating(false);
                        setSelectedId(order.id);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body-medium font-semibold text-on-surface">
                          #{order.id.slice(0, 8)} · {placeLabel(order)}
                        </span>
                        <span className="font-mono text-label-micro text-outline">
                          {ageLabel(order, now, timeZone)}
                        </span>
                      </div>
                      <p className="text-body-compact leading-relaxed text-on-surface-variant">
                        {summary(order) || "Sem itens"}
                      </p>
                      <div
                        className="flex items-center justify-between border-t border-outline-variant/20 pt-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="text-body-compact font-semibold text-on-surface">
                          {formatMoney(order.totalAmount)}
                        </span>
                        <CardAction
                          order={order}
                          canKitchen={canKitchen}
                          canClose={canClose}
                        />
                      </div>
                    </article>
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-compact">
              <thead className="bg-surface-container-low text-label-micro tracking-wider text-outline uppercase">
                <tr>
                  <th className="px-3 py-2.5">Pedido</th>
                  <th className="px-3 py-2.5">Canal</th>
                  <th className="px-3 py-2.5">Mesa / cliente</th>
                  <th className="px-3 py-2.5">Itens</th>
                  <th className="px-3 py-2.5">Tempo</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low text-on-surface">
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-outline" colSpan={7}>
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer hover:bg-surface-container-low/50"
                      onClick={() => {
                        setCreating(false);
                        setSelectedId(order.id);
                      }}
                    >
                      <td className="px-3 py-3 font-mono font-semibold text-primary">#{order.id.slice(0, 8)}</td>
                      <td className="px-3 py-3">{order.channel === "waiter" ? "Salão" : "Catálogo"}</td>
                      <td className="px-3 py-3 font-medium">{placeLabel(order)}</td>
                      <td className="max-w-xs truncate px-3 py-3 text-on-surface-variant">{summary(order)}</td>
                      <td className="px-3 py-3 font-mono">{ageLabel(order, now, timeZone)}</td>
                      <td className="px-3 py-3">{statusLabels[order.status]}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatMoney(order.totalAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {creating ? (
        <Drawer title="Novo pedido" subtitle="Pedido de salão" onClose={() => setCreating(false)}>
          <BoundForm action={createWaiterOrderAction}>
            <label className="grid gap-1 text-label-regular text-outline">
              Mesa
              <select className={fieldClassName} name="tableId" required>
                <option value="">Escolha a mesa</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-label-regular text-outline">
              Produto
              <select className={fieldClassName} name="productId" required>
                <option value="">Escolha o produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-label-regular text-outline">
              Quantidade
              <input className={fieldClassName} name="quantity" type="number" min={1} defaultValue={1} />
            </label>
            <label className="grid gap-1 text-label-regular text-outline">
              Observações
              <input className={fieldClassName} name="notes" placeholder="Opcional" />
            </label>
            <SubmitButton>Criar pedido</SubmitButton>
          </BoundForm>
        </Drawer>
      ) : null}

      {selected ? (
        <Drawer
          title={`Pedido #${selected.id.slice(0, 8)}`}
          subtitle={`${placeLabel(selected)} · ${statusLabels[selected.status]}`}
          onClose={() => setSelectedId(null)}
        >
          <div className="flex flex-col gap-3">
            {selected.notes ? <p className="text-body-compact text-on-surface-variant">Obs.: {selected.notes}</p> : null}
            <ul className="divide-y divide-surface-container-low rounded-lg border border-surface-container-low">
              {selected.items.length === 0 ? (
                <li className="px-3 py-3 text-body-compact text-outline">Sem itens</li>
              ) : (
                selected.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div>
                      <p className="text-body-compact font-semibold text-on-surface">
                        {item.quantity}× {item.productName}
                      </p>
                      <p className="text-label-micro text-outline">{formatMoney(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-body-compact font-semibold">
                        {formatMoney(Number(item.unitPrice) * item.quantity)}
                      </span>
                      {selected.status === "pending" && canUpdateItems ? (
                        <BoundForm action={removeItemAction}>
                          <input type="hidden" name="orderId" value={selected.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="text-label-micro text-error">
                            Remover
                          </button>
                        </BoundForm>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <div className="flex items-center justify-between text-headline-sm font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatMoney(selected.totalAmount)}</span>
            </div>
            {selected.status === "pending" && canUpdateItems ? (
              <BoundForm action={upsertItemAction}>
                <input type="hidden" name="orderId" value={selected.id} />
                <select className={fieldClassName} name="productId" required>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <input className={fieldClassName} name="quantity" type="number" min={1} defaultValue={1} />
                <SubmitButton>Incluir ou alterar item</SubmitButton>
              </BoundForm>
            ) : null}
          </div>
          <div className="mt-4 grid gap-2">
            <CardAction order={selected} canKitchen={canKitchen} canClose={canClose} wide />
            {canCancel && selected.status !== "closed" && selected.status !== "cancelled" ? (
              <BoundForm action={cancelOrderAction}>
                <input type="hidden" name="orderId" value={selected.id} />
                <button
                  type="submit"
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-surface-container-lowest text-body-compact font-semibold text-error"
                >
                  <Icon name="cancel" />
                  Cancelar pedido
                </button>
              </BoundForm>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}

function CardAction({
  order,
  canKitchen,
  canClose,
  wide = false,
}: {
  order: BoardOrder;
  canKitchen: boolean;
  canClose: boolean;
  wide?: boolean;
}) {
  const delivery = order.channel === "delivery";
  const label =
    order.status === "pending" && canKitchen
      ? "Aceitar"
      : order.status === "preparing" && canKitchen
        ? "Pronto"
        : order.status === "ready" && canClose
          ? delivery
            ? "Saiu para entrega"
            : "Fechar"
          : order.status === "out_for_delivery" && canClose
            ? "Fechar"
            : null;

  if (!label) return null;

  const action =
    label === "Fechar" ? closeOrderAction : label === "Saiu para entrega" ? dispatchOrderAction : advanceOrderAction;
  const primary = label !== "Pronto";

  return (
    <BoundForm action={action}>
      <input type="hidden" name="orderId" value={order.id} />
      <button
        type="submit"
        className={`rounded-lg px-3 font-medium ${
          wide ? "h-10 w-full text-body-medium" : "h-7 text-label-micro"
        } ${primary ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-surface-container-high text-on-surface"}`}
      >
        {label}
      </button>
    </BoundForm>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-inverse-surface/40" aria-label="Fechar" onClick={onClose} />
      <aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-surface-container-lowest shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-container-low bg-surface-container-low p-space-md">
          <div>
            <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>
            <p className="text-label-micro text-outline">{subtitle}</p>
          </div>
          <button type="button" className="text-outline" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-space-md">{children}</div>
      </aside>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-medium ${
        active
          ? "border border-outline-variant/30 bg-surface-container-lowest font-semibold text-on-surface shadow-sm"
          : "text-outline hover:bg-surface-container-low hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

function viewButton(active: boolean) {
  return active
    ? "rounded bg-surface-container-lowest px-3 py-1 font-medium text-on-surface shadow-sm"
    : "rounded px-3 py-1 text-outline hover:text-on-surface";
}

function placeLabel(order: BoardOrder) {
  if (order.tableName) return order.tableName;
  if (order.customerName) return order.customerName;
  return order.channel === "catalog" ? "Catálogo" : order.channel === "delivery" ? "Delivery" : "Salão";
}

function summary(order: BoardOrder) {
  return order.items.map((item) => `${item.quantity}x ${item.productName}`).join(", ");
}

function ageLabel(order: BoardOrder, now: string, timeZone: string) {
  if (order.status === "closed" || order.status === "cancelled") {
    return new Date(order.createdAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    });
  }

  const minutes = Math.max(0, Math.floor((new Date(now).getTime() - new Date(order.createdAt).getTime()) / 60000));
  return minutes < 1 ? "agora" : `${minutes} min`;
}
