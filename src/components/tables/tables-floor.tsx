"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { Icon } from "@/components/ui/icon";
import {
  cancelOrderAction,
  closeOrderAction,
  createWaiterOrderAction,
  removeItemAction,
  upsertItemAction,
} from "@/modules/orders/actions";
import { deactivateTableAction, updateTableAction } from "@/modules/tables/actions";
import { formatMoney } from "@/server/money";

export type FloorItem = {
  id: string;
  productName: string;
  detail: string;
  quantity: number;
  unitPrice: string;
};

export type FloorOrder = {
  id: string;
  status: "pending" | "preparing" | "ready";
  totalAmount: string;
  notes: string | null;
  items: FloorItem[];
};

export type FloorTable = {
  id: string;
  name: string;
  orders: FloorOrder[];
};

type ProductOption = { id: string; name: string };

const orderStatusLabels: Record<FloorOrder["status"], string> = {
  pending: "Nova",
  preparing: "Em preparo",
  ready: "Pronta para fechar",
};

export function TablesFloor({
  tables,
  products,
  open,
  canManage,
  canCreate,
  canUpdateItems,
  canClose,
  canCancel,
}: {
  tables: FloorTable[];
  products: ProductOption[];
  open: boolean;
  canManage: boolean;
  canCreate: boolean;
  canUpdateItems: boolean;
  canClose: boolean;
  canCancel: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "occupied" | "free">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tables.filter((table) => {
      const occupied = table.orders.length > 0;
      if (filter === "occupied" && !occupied) return false;
      if (filter === "free" && occupied) return false;
      return !term || table.name.toLowerCase().includes(term);
    });
  }, [filter, query, tables]);

  const occupiedCount = tables.filter((table) => table.orders.length > 0).length;
  const freeCount = tables.length - occupiedCount;
  const openAmount = tables.reduce(
    (sum, table) => sum + table.orders.reduce((orderSum, order) => orderSum + Number(order.totalAmount), 0),
    0,
  );
  const occupancy = tables.length === 0 ? 0 : Math.round((occupiedCount / tables.length) * 100);
  const selected = tables.find((table) => table.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-headline-md font-semibold tracking-tight text-on-surface">Mesas</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-label-micro font-medium ${
                open ? "bg-emerald-50 text-emerald-800" : "bg-surface-container text-outline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-emerald-600" : "bg-outline"}`} />
              {open ? "Salão aberto" : "Salão suspenso"}
            </span>
          </div>
          <p className="mt-0.5 text-body-compact text-outline">Ocupação das mesas e comandas abertas.</p>
        </div>
        {canManage ? (
          <Link
            href="/painel/mesas/cadastro?nova=1"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3.5 text-body-compact font-medium text-on-primary shadow-sm hover:bg-primary-container"
          >
            <Icon name="add" />
            Nova mesa
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Mesas ocupadas" value={`${occupiedCount}`} detail={`/ ${tables.length}`} aside={`${occupancy}%`} />
        <Metric label="Mesas livres" value={`${freeCount}`} />
        <Metric label="Em aberto" value={formatMoney(openAmount)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3 shadow-sm">
        <div className="flex items-center gap-1 rounded-lg bg-surface-container-low p-0.5">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            Todas ({tables.length})
          </FilterButton>
          <FilterButton active={filter === "occupied"} onClick={() => setFilter("occupied")}>
            Ocupadas ({occupiedCount})
          </FilterButton>
          <FilterButton active={filter === "free"} onClick={() => setFilter("free")}>
            Livres ({freeCount})
          </FilterButton>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 text-label-micro font-medium text-outline">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Livre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Ocupada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-tertiary" /> Pronta
            </span>
          </div>
          <div className="relative">
            <Icon name="search" className="absolute top-2 left-2.5 text-[16px] text-outline" />
            <input
              className="h-8 w-56 rounded border border-outline-variant/30 bg-surface-container-low pr-3 pl-8 text-body-compact outline-none placeholder:text-outline focus:border-primary"
              placeholder="Buscar mesa..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="xl:col-span-8">
          {visible.length === 0 ? (
            <p className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-4 py-8 text-body-compact text-outline">
              {tables.length === 0 ? "Nenhuma mesa cadastrada." : "Nenhuma mesa encontrada."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((table) => {
                const tone = tableTone(table);
                const selectedCard = table.id === selected?.id;
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedId(table.id)}
                    className={`flex h-24 flex-col justify-between rounded-lg bg-surface-container-lowest p-3.5 text-left transition-colors ${
                      selectedCard
                        ? "border-2 border-primary shadow-sm"
                        : "border border-outline-variant/30 hover:border-outline-variant/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-headline-sm font-semibold ${tone === "free" ? "text-outline" : "text-on-surface"}`}>
                        {table.name}
                      </span>
                      {tone === "ready" ? (
                        <span className="text-label-micro font-medium text-tertiary">Pronta</span>
                      ) : (
                        <span
                          className={`h-2 w-2 rounded-full ${tone === "free" ? "bg-emerald-500" : "bg-primary"}`}
                        />
                      )}
                    </span>
                    <span className="flex items-center justify-between text-body-compact">
                      <span className="text-label-micro text-outline">
                        {tone === "free" ? "Livre" : `${table.orders.length} comanda${table.orders.length > 1 ? "s" : ""}`}
                      </span>
                      <span className={`font-medium ${tone === "ready" ? "text-primary" : "text-on-surface"}`}>
                        {tone === "free" ? "" : formatMoney(tableTotal(table))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm xl:sticky xl:top-20 xl:col-span-4">
          {selected ? (
            <TableDetail
              table={selected}
              products={products}
              canManage={canManage}
              canCreate={canCreate}
              canUpdateItems={canUpdateItems}
              canClose={canClose}
              canCancel={canCancel}
            />
          ) : (
            <p className="text-body-compact text-outline">Selecione uma mesa para ver a comanda.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function TableDetail({
  table,
  products,
  canManage,
  canCreate,
  canUpdateItems,
  canClose,
  canCancel,
}: {
  table: FloorTable;
  products: ProductOption[];
  canManage: boolean;
  canCreate: boolean;
  canUpdateItems: boolean;
  canClose: boolean;
  canCancel: boolean;
}) {
  const tone = tableTone(table);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 border-b border-outline-variant/20 pb-3">
        <div>
          <h2 className="text-headline-md font-semibold text-on-surface">{table.name}</h2>
          <p className="text-body-compact text-outline">
            {tone === "free" ? "Sem comanda aberta" : tone === "ready" ? "Pronta para fechar" : "Ocupada"}
          </p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-label-micro font-semibold ${
            tone === "free"
              ? "bg-emerald-50 text-emerald-800"
              : tone === "ready"
                ? "bg-tertiary-fixed text-on-tertiary-fixed"
                : "bg-primary-fixed text-on-primary-fixed"
          }`}
        >
          {tone === "free" ? "Livre" : tone === "ready" ? "Pronta" : "Ocupada"}
        </span>
      </div>

      {table.orders.length === 0 && canCreate ? (
        <BoundForm action={createWaiterOrderAction}>
          <input type="hidden" name="tableId" value={table.id} />
          <SubmitButton>Abrir comanda</SubmitButton>
        </BoundForm>
      ) : null}

      {table.orders.map((order) => (
        <section key={order.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label-micro text-outline">#{order.id.slice(0, 8)}</span>
            <span className="text-label-micro text-outline">{orderStatusLabels[order.status]}</span>
          </div>
          {order.notes ? <p className="text-body-compact text-on-surface-variant">Obs.: {order.notes}</p> : null}
          <ul className="max-h-72 divide-y divide-outline-variant/20 overflow-y-auto">
            {order.items.length === 0 ? (
              <li className="py-2 text-body-compact text-outline">Nenhum item</li>
            ) : (
              order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="text-body-compact text-on-surface">
                    {item.quantity}x {item.productName}
                    {item.detail ? <span className="block text-label-regular text-primary">{item.detail}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-body-compact font-medium">
                      {formatMoney(Number(item.unitPrice) * item.quantity)}
                    </span>
                    {order.status === "pending" && canUpdateItems ? (
                      <BoundForm action={removeItemAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <button type="submit" className="text-label-micro text-error">
                          Remover
                        </button>
                      </BoundForm>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="flex items-baseline justify-between border-t border-outline-variant/20 pt-2">
            <span className="text-headline-sm font-semibold">Total</span>
            <span className="text-metric-headline font-semibold text-primary">{formatMoney(order.totalAmount)}</span>
          </div>
          {order.status === "pending" && canUpdateItems ? (
            <BoundForm action={upsertItemAction}>
              <input type="hidden" name="orderId" value={order.id} />
              {products.length === 0 ? (
                <p className="text-body-compact text-outline">Cadastre um produto para lançar itens.</p>
              ) : (
                <select className={fieldClassName} name="productId" required>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              )}
              <input className={fieldClassName} name="quantity" type="number" min={1} defaultValue={1} />
              <SubmitButton>Lançar item</SubmitButton>
            </BoundForm>
          ) : null}
          <div className="grid gap-2">
            {order.status === "ready" && canClose ? (
              <BoundForm action={closeOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="h-9 w-full rounded bg-primary text-body-compact font-semibold text-on-primary hover:bg-primary-container"
                >
                  Fechar conta
                </button>
              </BoundForm>
            ) : null}
            {canCancel ? (
              <BoundForm action={cancelOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="h-9 w-full rounded border border-outline-variant/40 bg-surface-container-lowest text-body-compact font-medium text-error"
                >
                  Cancelar comanda
                </button>
              </BoundForm>
            ) : null}
          </div>
        </section>
      ))}

      {canManage ? (
        <div className="grid gap-3 border-t border-outline-variant/20 pt-3">
          <BoundForm action={updateTableAction}>
            <input type="hidden" name="tableId" value={table.id} />
            <input className={fieldClassName} name="name" defaultValue={table.name} required />
            <SubmitButton>Renomear</SubmitButton>
          </BoundForm>
          {table.orders.length === 0 ? (
            <BoundForm action={deactivateTableAction}>
              <input type="hidden" name="tableId" value={table.id} />
              <button type="submit" className="text-left text-body-compact text-error">
                Desativar mesa
              </button>
            </BoundForm>
          ) : (
            <p className="text-label-micro text-outline">A mesa tem comanda aberta.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  aside,
}: {
  label: string;
  value: string;
  detail?: string;
  aside?: string;
}) {
  return (
    <article className="flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3.5">
      <div>
        <p className="text-label-regular text-outline">{label}</p>
        <p className="mt-0.5 text-metric-headline font-semibold text-on-surface">
          {value} {detail ? <span className="text-body-compact font-normal text-outline">{detail}</span> : null}
        </p>
      </div>
      {aside ? (
        <span className="rounded bg-primary-fixed px-2 py-0.5 text-label-micro font-semibold text-on-primary-fixed">
          {aside}
        </span>
      ) : null}
    </article>
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
      className={`rounded px-3 py-1 text-body-compact font-medium ${
        active ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-outline hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

function tableTone(table: FloorTable): "free" | "occupied" | "ready" {
  if (table.orders.length === 0) return "free";
  return table.orders.every((order) => order.status === "ready") ? "ready" : "occupied";
}

function tableTotal(table: FloorTable) {
  return table.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
}
