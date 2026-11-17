"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { LiveRefresh } from "@/components/shared/live-refresh";
import { Icon } from "@/components/ui/icon";
import { OptionsSheet, type SheetSelection } from "@/components/waiter/options-sheet";
import { itemTitle } from "@/lib/order-item-options";
import { evaluateSelection, hasChoices, selectionKey, type ProductConfig } from "@/lib/product-config";
import { sendWaiterOrderAction } from "@/modules/orders/actions";
import { logoutAction } from "@/modules/tenancy/actions";

export type WaiterOrderStatus = "pending" | "preparing" | "ready";

export type WaiterTable = {
  id: string;
  name: string;
  capacity: number;
  environmentId: string;
  environmentName: string;
  orders: {
    id: string;
    status: WaiterOrderStatus;
    totalAmount: number;
    createdAt: string;
    items: { id: string; productName: string; variantName: string | null; detail: string; quantity: number }[];
  }[];
};

export type WaiterProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  categoryName: string;
  stockQuantity: number;
  isAvailable: boolean;
  config: ProductConfig;
};

type Category = { id: string; name: string };
type View = "mesas" | "lancar" | "comanda";
/** Uma linha da comanda: produto + escolha (variação/opções). `optionIds` ausente = padrão do produto. */
type DraftItem = {
  productId: string;
  variantId: string | null;
  optionIds?: string[];
  quantity: number;
  note: string;
};
type Draft = { items: Record<string, DraftItem>; notes: string };
type DraftLine = DraftItem & {
  key: string;
  product: WaiterProduct;
  unitPrice: number;
  variantName: string | null;
  summary: string;
};

const emptyDraft: Draft = { items: {}, notes: "" };

function draftLinesOf(draft: Draft | undefined, productsById: Map<string, WaiterProduct>): DraftLine[] {
  return Object.entries(draft?.items ?? {}).flatMap(([key, item]) => {
    const product = productsById.get(item.productId);
    if (!product) return [];
    const evaluation = evaluateSelection(product.price, product.config, item.variantId, item.optionIds ?? []);
    return [
      {
        ...item,
        key,
        product,
        unitPrice: item.optionIds === undefined && !item.variantId ? product.price : evaluation.unitCents / 100,
        variantName: evaluation.variantName,
        summary: item.optionIds === undefined ? "" : evaluation.summary,
      },
    ];
  });
}

function unitsOf(lines: DraftLine[], productId?: string) {
  return lines.reduce((sum, line) => sum + (!productId || line.productId === productId ? line.quantity : 0), 0);
}

const quickTags = ["Sem gelo", "Talheres extras", "Entrada rápida", "Mesa c/ criança", "Copo descartável"];

const statusLabels: Record<WaiterOrderStatus, string> = {
  pending: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
};

const statusClasses: Record<WaiterOrderStatus, string> = {
  pending: "bg-secondary-fixed text-on-secondary-fixed",
  preparing: "bg-tertiary-fixed text-on-tertiary-fixed",
  ready: "bg-emerald-100 text-emerald-900",
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatMoney(value: number) {
  return money.format(value);
}

export function WaiterApp({
  tables,
  products,
  categories,
  userName,
  roleLabel,
  establishmentName,
  open,
  now,
  timeZone,
  canViewOrders,
  panelHref,
}: {
  tables: WaiterTable[];
  products: WaiterProduct[];
  categories: Category[];
  userName: string;
  roleLabel: string;
  establishmentName: string;
  open: boolean;
  now: string;
  timeZone: string;
  canViewOrders: boolean;
  panelHref: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("mesas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sending, startSending] = useTransition();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selected = tables.find((table) => table.id === selectedId) ?? null;
  const draft = (selectedId && drafts[selectedId]) || emptyDraft;
  const draftLines = draftLinesOf(draft, productsById);
  const draftUnits = unitsOf(draftLines);
  const draftTotal = draftLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const [choosing, setChoosing] = useState<WaiterProduct | null>(null);

  function showFlash(tone: "success" | "error", text: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ tone, text });
    flashTimer.current = setTimeout(() => setFlash(null), 4000);
  }

  function updateDraft(tableId: string, update: (current: Draft) => Draft) {
    setDrafts((current) => ({ ...current, [tableId]: update(current[tableId] ?? emptyDraft) }));
  }

  /** Quantidade de uma linha; para produto simples a chave é o próprio id do produto. */
  function setQuantity(key: string, quantity: number) {
    if (!selectedId) return;
    updateDraft(selectedId, (current) => {
      const items = { ...current.items };
      if (quantity <= 0) {
        delete items[key];
      } else {
        items[key] = items[key]
          ? { ...items[key], quantity }
          : { productId: key, variantId: null, quantity, note: "" };
      }
      return { ...current, items };
    });
  }

  /** Inclui uma escolha feita na folha de opções (soma se já houver a mesma escolha). */
  function addSelection(product: WaiterProduct, selection: SheetSelection) {
    if (!selectedId) return;
    const key = selectionKey(product.id, selection.variantId, selection.optionIds);
    updateDraft(selectedId, (current) => {
      const existing = current.items[key];
      const note = selection.note.trim() || existing?.note || "";
      return {
        ...current,
        items: {
          ...current.items,
          [key]: {
            productId: product.id,
            variantId: selection.variantId,
            optionIds: selection.optionIds,
            quantity: (existing?.quantity ?? 0) + selection.quantity,
            note,
          },
        },
      };
    });
    setChoosing(null);
  }

  function setItemNote(key: string, note: string) {
    if (!selectedId) return;
    updateDraft(selectedId, (current) => {
      const item = current.items[key];
      if (!item) return current;
      return { ...current, items: { ...current.items, [key]: { ...item, note } } };
    });
  }

  function setNotes(notes: string) {
    if (!selectedId) return;
    updateDraft(selectedId, (current) => ({ ...current, notes }));
  }

  function clearDraft() {
    if (!selectedId) return;
    setDrafts((current) => {
      const next = { ...current };
      delete next[selectedId];
      return next;
    });
  }

  function openTable(tableId: string) {
    setSelectedId(tableId);
    setView("lancar");
    window.scrollTo({ top: 0 });
  }

  function goTo(next: View) {
    if (next !== "mesas" && !selectedId) {
      showFlash("error", "Selecione uma mesa primeiro.");
      setView("mesas");
      return;
    }
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function submit() {
    if (!selected || draftLines.length === 0) return;
    const tableId = selected.id;
    const tableName = selected.name;
    startSending(async () => {
      const result = await sendWaiterOrderAction({
        tableId,
        notes: draft.notes,
        items: draftLines.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          quantity: line.quantity,
          note: line.note.trim() || undefined,
          variantId: line.variantId,
          optionIds: line.optionIds,
        })),
      });

      if (result?.error) {
        showFlash("error", result.error);
        return;
      }

      setDrafts((current) => {
        const next = { ...current };
        delete next[tableId];
        return next;
      });
      showFlash("success", `${tableName}: pedido enviado para a cozinha.`);
      setView("mesas");
      window.scrollTo({ top: 0 });
      router.refresh();
    });
  }

  const title = view === "mesas" ? "Mesas" : view === "lancar" ? "Lançar itens" : "Comanda";

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <LiveRefresh />

      <header className="fixed inset-x-0 top-0 z-50 bg-surface/85 pt-[env(safe-area-inset-top)] shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-space-sm px-margin-mobile md:px-margin">
          <div className="flex min-w-0 items-center gap-space-sm">
            <Link
              href={panelHref}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container"
              aria-label="Abrir painel"
            >
              <Icon name="outdoor_grill" />
            </Link>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-label-micro tracking-wider text-on-surface-variant uppercase">
                {establishmentName} · Garçom
              </span>
              <span className="truncate text-headline-sm text-on-surface">{title}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-space-sm">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-label-micro font-medium text-on-surface-variant">{userName}</span>
              <span className="text-label-micro font-semibold text-primary">{roleLabel}</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Sair"
                aria-label="Sair"
                className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95"
              >
                <Icon name="logout" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {!open ? (
          <div className="mx-margin-mobile mt-3 flex items-center gap-2 rounded-xl bg-error-container px-3 py-2 text-body-compact text-on-error-container md:mx-margin">
            <Icon name="warning" />
            O estabelecimento está fechado no momento.
          </div>
        ) : null}

        {view === "mesas" ? (
          <TablesView
            tables={tables}
            drafts={drafts}
            productsById={productsById}
            selectedId={selectedId}
            now={now}
            userName={userName}
            onOpen={openTable}
          />
        ) : selected ? (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-space-lg md:px-margin md:pt-3 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className={view === "lancar" ? "block" : "hidden md:block"}>
              <LaunchView
                table={selected}
                products={products}
                categories={categories}
                draft={draft}
                lines={draftLines}
                onQuantity={setQuantity}
                onChoose={setChoosing}
                onChangeTable={() => goTo("mesas")}
              />
            </div>
            <div className={`${view === "comanda" ? "block" : "hidden md:block"} md:no-scrollbar md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] md:max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-0.75rem-5rem-env(safe-area-inset-bottom))] md:overflow-y-auto md:rounded-xl`}>
              <ComandaView
                table={selected}
                lines={draftLines}
                notes={draft.notes}
                units={draftUnits}
                total={draftTotal}
                now={now}
                timeZone={timeZone}
                userName={userName}
                sending={sending}
                onQuantity={setQuantity}
                onItemNote={setItemNote}
                onNotes={setNotes}
                onClear={clearDraft}
                onMore={() => goTo("lancar")}
                onSubmit={submit}
              />
            </div>
          </div>
        ) : null}
      </main>

      {choosing ? (
        <OptionsSheet
          key={choosing.id}
          product={choosing}
          available={Math.max(0, choosing.stockQuantity - unitsOf(draftLines, choosing.id))}
          onClose={() => setChoosing(null)}
          onAdd={(selection) => addSelection(choosing, selection)}
        />
      ) : null}

      {flash ? (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-[70] flex justify-center px-margin-mobile">
          <div
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-3 py-2 text-body-compact shadow-lg ${
              flash.tone === "success" ? "bg-inverse-surface text-inverse-on-surface" : "bg-error text-on-error"
            }`}
          >
            <Icon name={flash.tone === "success" ? "task_alt" : "error"} />
            <span>{flash.text}</span>
            {flash.tone === "success" && canViewOrders ? (
              <Link href="/painel/pedidos" className="ml-1 font-semibold text-inverse-primary underline">
                Ver pedidos
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "mesas" && selected ? (
        <FloatingBar
          tone="light"
          badge={selected.name.replace(/\D/g, "").slice(-2) || selected.name.slice(0, 2)}
          title={selected.name}
          detail={draftLines.length > 0 ? `${draftUnits} itens no rascunho · ${formatMoney(draftTotal)}` : "Nenhum item no rascunho"}
          actionLabel="Lançar pedidos"
          onAction={() => goTo("lancar")}
        />
      ) : null}

      {view === "lancar" && selected ? (
        <div className="md:hidden">
          <FloatingBar
            tone="dark"
            icon="receipt_long"
            title={`Total: ${formatMoney(draftTotal)}`}
            detail={
              draftLines.length > 0
                ? `${draftLines.length} ${draftLines.length === 1 ? "item selecionado" : "itens selecionados"} (${draftUnits} un)`
                : "Nenhum item selecionado"
            }
            actionLabel="Comanda"
            onAction={() => goTo("comanda")}
          />
        </div>
      ) : null}

      <BottomNav view={view} units={draftUnits} onNavigate={goTo} canViewOrders={canViewOrders} />
    </div>
  );
}

function TablesView({
  tables,
  drafts,
  productsById,
  selectedId,
  now,
  userName,
  onOpen,
}: {
  tables: WaiterTable[];
  drafts: Record<string, Draft>;
  productsById: Map<string, WaiterProduct>;
  selectedId: string | null;
  now: string;
  userName: string;
  onOpen: (tableId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState<string>("all");

  const environments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const table of tables) {
      const current = map.get(table.environmentId) ?? { id: table.environmentId, name: table.environmentName, count: 0 };
      current.count += 1;
      map.set(table.environmentId, current);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [tables]);

  const occupied = tables.filter((table) => table.orders.length > 0).length;
  const free = tables.length - occupied;
  const term = query.trim().toLowerCase();
  const visible = tables.filter(
    (table) =>
      (environment === "all" || table.environmentId === environment) &&
      (!term || table.name.toLowerCase().includes(term)),
  );

  return (
    <div className="flex flex-col">
      <section className="px-margin-mobile pt-3 pb-2 md:px-margin">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low p-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest text-primary">
              <Icon name="table_bar" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-label-micro tracking-wider text-on-surface-variant uppercase">Ocupação salão</span>
              <span className="truncate text-body-medium font-semibold text-on-surface">
                {occupied}/{tables.length}{" "}
                <span className="text-label-regular font-normal text-on-surface-variant">ocupadas</span>
              </span>
            </div>
          </div>
          <div className="h-6 w-px shrink-0 bg-surface-container-highest" />
          <div className="flex shrink-0 flex-col items-center">
            <span className="text-label-micro tracking-wider text-on-surface-variant uppercase">Disponíveis</span>
            <span className="text-body-medium font-semibold text-secondary">
              {free} {free === 1 ? "livre" : "livres"}
            </span>
          </div>
          <div className="hidden h-6 w-px shrink-0 bg-surface-container-highest min-[400px]:block" />
          <div className="hidden shrink-0 items-center gap-1.5 min-[400px]:flex">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            <div className="flex flex-col items-end">
              <span className="text-label-micro tracking-wider text-on-surface-variant uppercase">Garçom</span>
              <span className="max-w-[96px] truncate text-metric-table font-semibold text-on-surface">
                {userName.split(" ")[0]}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2.5 px-margin-mobile pt-1 pb-2 md:flex-row md:items-center md:px-margin">
        <div className="relative flex w-full items-center md:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3 text-on-surface-variant" />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mesa por número..."
            className="h-10 w-full rounded-lg bg-surface-container-lowest pr-3 pl-9 text-body-default text-on-surface shadow-sm outline-none placeholder:text-on-surface-variant/60 focus:bg-surface-container-low"
          />
        </div>
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5">
          <Pill active={environment === "all"} onClick={() => setEnvironment("all")} label="Todas" count={tables.length} />
          {environments.map((item) => (
            <Pill
              key={item.id}
              active={environment === item.id}
              onClick={() => setEnvironment(item.id)}
              label={item.name}
              count={item.count}
            />
          ))}
        </div>
      </section>

      <section className="px-margin-mobile py-2 md:px-margin">
        {visible.length === 0 ? (
          <p className="rounded-xl bg-surface-container-low p-4 text-center text-body-compact text-on-surface-variant">
            {tables.length === 0 ? "Nenhuma mesa cadastrada." : "Nenhuma mesa encontrada."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                draft={drafts[table.id]}
                productsById={productsById}
                selected={table.id === selectedId}
                now={now}
                onOpen={() => onOpen(table.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TableCard({
  table,
  draft,
  productsById,
  selected,
  now,
  onOpen,
}: {
  table: WaiterTable;
  draft: Draft | undefined;
  productsById: Map<string, WaiterProduct>;
  selected: boolean;
  now: string;
  onOpen: () => void;
}) {
  const lines = draftLinesOf(draft, productsById);
  const draftUnits = unitsOf(lines);
  const draftTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const tableTotal = table.orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const occupied = table.orders.length > 0;
  const minutes = occupied
    ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(table.orders[0].createdAt)) / 60000))
    : 0;
  const hasReady = table.orders.some((order) => order.status === "ready");

  if (selected || draftUnits > 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="relative flex min-h-[142px] flex-col justify-between rounded-xl bg-primary-fixed p-3 text-left shadow-md transition-all active:scale-[0.98]"
      >
        <span className="absolute -top-2 right-2.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-label-micro font-bold text-on-primary shadow-sm">
          <Icon name="edit_note" className="text-[12px]" /> Sua mesa
        </span>
        <span>
          <span className="mb-2 flex items-center justify-between gap-1">
            <span className="truncate text-headline-sm font-bold text-on-primary-fixed">{table.name}</span>
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface-container-lowest/80 px-2 py-0.5 text-label-micro text-on-primary-fixed-variant">
              <Icon name="person" className="text-[13px]" /> {table.capacity}
            </span>
          </span>
          <span className="mb-1 flex items-center gap-1 text-label-micro text-on-primary-fixed-variant">
            <Icon name="receipt_long" className="text-[14px]" />
            <span className="font-medium text-primary">
              {draftUnits > 0 ? `${draftUnits} ${draftUnits === 1 ? "item" : "itens"} no rascunho` : "Rascunho vazio"}
            </span>
          </span>
        </span>
        <span className="mt-2 flex items-baseline justify-between rounded-lg bg-surface-container-lowest p-2 shadow-sm">
          <span className="text-label-micro text-on-primary-fixed-variant uppercase">Total atual</span>
          <span className="text-metric-table font-bold text-primary">{formatMoney(tableTotal + draftTotal)}</span>
        </span>
      </button>
    );
  }

  if (occupied) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`relative flex min-h-[142px] flex-col justify-between rounded-xl p-3 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98] ${
          hasReady ? "bg-secondary-fixed" : "bg-surface-container-lowest"
        }`}
      >
        <span>
          <span className="mb-2 flex items-center justify-between gap-1">
            <span className="truncate text-headline-sm font-semibold text-on-surface">{table.name}</span>
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface-container-highest px-2 py-0.5 text-label-micro text-on-surface-variant">
              <Icon name="person" className="text-[13px]" /> {table.capacity}
            </span>
          </span>
          <span className="mb-1 flex items-center gap-1 text-label-micro text-on-surface-variant">
            <Icon name="schedule" className="text-[14px]" />
            {minutes} min
          </span>
          {hasReady ? (
            <span className="flex items-center gap-1 text-label-micro font-medium text-on-secondary-fixed-variant">
              <Icon name="room_service" className="text-[14px]" /> Pedido pronto
            </span>
          ) : null}
        </span>
        <span className="mt-2 flex items-baseline justify-between rounded-lg bg-surface-container-low/60 p-2">
          <span className="text-label-micro text-on-surface-variant uppercase">Subtotal</span>
          <span className="text-metric-table font-semibold text-on-surface">{formatMoney(tableTotal)}</span>
        </span>
      </button>
    );
  }

  return (
    <article className="relative flex min-h-[142px] flex-col justify-between rounded-xl bg-surface-container-low/60 p-3 shadow-sm">
      <div>
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="truncate text-headline-sm font-semibold text-on-surface">{table.name}</span>
          <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-label-micro text-on-surface-variant">
            {table.capacity} lug
          </span>
        </div>
        <div className="inline-flex items-center gap-1 text-label-micro font-medium text-secondary">
          <span className="size-1.5 rounded-full bg-secondary" /> Disponível
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-lg bg-surface-container-lowest px-2.5 py-2 text-label-regular font-semibold text-primary shadow-sm transition-all hover:bg-primary hover:text-on-primary active:scale-[0.97]"
      >
        <Icon name="add" className="text-[16px]" />
        Abrir mesa
      </button>
    </article>
  );
}

function LaunchView({
  table,
  products,
  categories,
  draft,
  lines,
  onQuantity,
  onChoose,
  onChangeTable,
}: {
  table: WaiterTable;
  products: WaiterProduct[];
  categories: Category[];
  draft: Draft;
  lines: DraftLine[];
  onQuantity: (key: string, quantity: number) => void;
  onChoose: (product: WaiterProduct) => void;
  onChangeTable: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const term = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) map.set(product.categoryId, (map.get(product.categoryId) ?? 0) + 1);
    return map;
  }, [products]);

  const visible = products
    .filter(
      (product) =>
        (category === "all" || product.categoryId === category) &&
        (!term ||
          product.name.toLowerCase().includes(term) ||
          product.categoryName.toLowerCase().includes(term) ||
          (product.description?.toLowerCase().includes(term) ?? false)),
    )
    .sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable));

  return (
    <div className="flex flex-col">
      <section className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-40 bg-surface/95 px-margin-mobile py-2.5 shadow-sm backdrop-blur-md md:static md:px-0 md:pt-0 md:shadow-none">
        <div className="flex items-center justify-between gap-space-sm rounded-xl bg-surface-container-low px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="table_bar" className="text-[19px]" />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-headline-sm text-on-surface">{table.name}</span>
                <span className="size-1 rounded-full bg-on-surface-variant/40" />
                <span className="flex items-center gap-0.5 text-label-regular text-on-surface-variant">
                  <Icon name="group" className="text-[14px]" />
                  {table.capacity}
                </span>
              </div>
              <span className="truncate text-label-micro text-on-surface-variant">
                {table.environmentName}
                {table.orders.length > 0 ? ` · ${table.orders.length} pedido(s) em andamento` : " · Mesa livre"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onChangeTable}
            aria-label="Alterar mesa"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-on-surface-variant transition-transform hover:text-on-surface active:scale-95"
          >
            <Icon name="sync_alt" />
          </button>
        </div>
      </section>

      <section className="px-margin-mobile pt-3 pb-1 md:px-0">
        <div className="relative flex w-full items-center">
          <Icon name="search" className="pointer-events-none absolute left-3 text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar espeto, chopp, porção..."
            className="h-10 w-full rounded-xl bg-surface-container-lowest pr-9 pl-9 text-body-default text-on-surface shadow-sm outline-none placeholder:text-on-surface-variant/60 focus:bg-surface-container-low"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 rounded-md p-1 text-on-surface-variant hover:text-on-surface"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          ) : null}
        </div>
      </section>

      <section className="py-2.5">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-margin-mobile md:px-0">
          <CategoryPill active={category === "all"} onClick={() => setCategory("all")} label="Todos" />
          {categories.map((item) => (
            <CategoryPill
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(item.id)}
              label={item.name}
              count={counts.get(item.id) ?? 0}
            />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-2.5 px-margin-mobile pt-1 md:px-0 xl:grid-cols-2">
        {visible.length === 0 ? (
          <p className="rounded-xl bg-surface-container-low p-4 text-center text-body-compact text-on-surface-variant">
            Nenhum produto encontrado.
          </p>
        ) : (
          visible.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              quantity={draft.items[product.id]?.quantity ?? 0}
              units={unitsOf(lines, product.id)}
              onQuantity={(quantity) => onQuantity(product.id, quantity)}
              onChoose={() => onChoose(product)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ProductRow({
  product,
  quantity,
  units,
  onQuantity,
  onChoose,
}: {
  product: WaiterProduct;
  /** Quantidade da linha simples (produto sem escolhas). */
  quantity: number;
  /** Total de unidades do produto na comanda (todas as escolhas). */
  units: number;
  onQuantity: (quantity: number) => void;
  onChoose: () => void;
}) {
  const choices = hasChoices(product.config);
  const soldOut = product.stockQuantity <= 0;
  const atLimit = units >= product.stockQuantity;
  if (!product.isAvailable) {
    return (
      <article className="flex items-center justify-between rounded-xl bg-surface-container-lowest/60 p-3 opacity-60">
        <div className="flex min-w-0 items-center gap-3 pr-2">
          <ProductThumb name={product.name} muted />
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-label-micro">
              <span className="truncate text-on-surface-variant">{product.categoryName}</span>
              <span className="size-1 rounded-full bg-on-surface-variant/40" />
              <span className="font-medium text-error">Pausado</span>
            </span>
            <h2 className="truncate text-body-medium text-on-surface">{product.name}</h2>
            <span className="pt-0.5 text-metric-table text-on-surface-variant line-through">
              {formatMoney(product.price)}
            </span>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center rounded bg-surface-container px-2 py-1 text-label-micro text-on-surface-variant">
          Indisponível
        </span>
      </article>
    );
  }

  const overStock = units > product.stockQuantity;

  return (
    <article
      className={`flex items-center justify-between rounded-xl bg-surface-container-lowest p-3 shadow-sm transition-shadow ${
        units > 0 ? "ring-1 ring-primary/30" : ""
      } ${soldOut ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3 pr-2">
        <ProductThumb name={product.name} />
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-label-micro">
            <span className="truncate text-on-surface-variant">{product.categoryName}</span>
            <span className="size-1 shrink-0 rounded-full bg-on-surface-variant/40" />
            <span
              className={`shrink-0 ${
                soldOut || overStock ? "text-error" : units > 0 ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              {soldOut ? "Esgotado" : `${product.stockQuantity} un`}
            </span>
          </span>
          <h2 className="truncate text-body-medium text-on-surface">{product.name}</h2>
          <span className="pt-0.5 text-metric-table font-semibold text-on-surface">
            {product.config.variants.length > 0 ? (
              <span className="mr-1 text-label-micro font-normal text-on-surface-variant">a partir de</span>
            ) : null}
            {formatMoney(product.price)}
          </span>
        </div>
      </div>
      {soldOut ? (
        <span className="inline-flex shrink-0 items-center rounded bg-error-container px-2 py-1 text-label-micro text-on-error-container">
          Esgotado
        </span>
      ) : choices ? (
        <button
          type="button"
          onClick={onChoose}
          disabled={atLimit}
          className="relative flex h-10 shrink-0 items-center gap-1 rounded-lg bg-surface-container-low px-3 text-label-micro text-primary transition-all hover:bg-primary-fixed active:scale-95 disabled:opacity-50"
        >
          <Icon name="tune" className="text-[15px]" />
          Escolher
          {units > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-on-primary">
              {units}
            </span>
          ) : null}
        </button>
      ) : quantity > 0 ? (
        <Stepper quantity={quantity} onChange={onQuantity} accent max={product.stockQuantity - (units - quantity)} />
      ) : (
        <button
          type="button"
          onClick={() => onQuantity(1)}
          disabled={atLimit}
          className="flex h-10 shrink-0 items-center gap-1 rounded-lg bg-surface-container-low px-3 text-label-micro text-primary transition-all hover:bg-primary-fixed active:scale-95 disabled:opacity-50"
        >
          <Icon name="add" className="text-[15px]" />
          Adicionar
        </button>
      )}
    </article>
  );
}

function ComandaView({
  table,
  lines,
  notes,
  units,
  total,
  now,
  timeZone,
  userName,
  sending,
  onQuantity,
  onItemNote,
  onNotes,
  onClear,
  onMore,
  onSubmit,
}: {
  table: WaiterTable;
  lines: DraftLine[];
  notes: string;
  units: number;
  total: number;
  now: string;
  timeZone: string;
  userName: string;
  sending: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onItemNote: (key: string, note: string) => void;
  onNotes: (notes: string) => void;
  onClear: () => void;
  onMore: () => void;
  onSubmit: () => void;
}) {
  const occupied = table.orders.length > 0;
  const sentTotal = table.orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const startedAt = occupied
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(
        new Date(table.orders[0].createdAt),
      )
    : null;
  const minutes = occupied
    ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(table.orders[0].createdAt)) / 60000))
    : 0;

  function appendTag(tag: string) {
    const text = `+ ${tag}`;
    if (notes.includes(text)) return;
    onNotes(notes.trim() ? `${notes.trim()} • ${text}` : text);
  }

  return (
    <div className="flex flex-col gap-space-lg px-margin-mobile pt-3 pb-6 md:px-0 md:pt-0">
      <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-space-xs">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-micro tracking-wider uppercase ${
                occupied ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {occupied ? "Mesa aberta" : "Nova mesa"}
            </span>
            {lines.length > 0 ? (
              <span className="flex items-center gap-0.5 text-label-micro text-on-surface-variant">
                <span className="size-1.5 rounded-full bg-secondary-container" />
                Em edição
              </span>
            ) : null}
          </div>
          {startedAt ? (
            <span className="flex items-center gap-1 text-label-micro text-on-surface-variant">
              <Icon name="schedule" className="text-[15px]" />
              Início: {startedAt} ({minutes} min)
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h1 className="min-w-0 truncate text-headline-md text-on-surface">
            {table.name}{" "}
            <span className="text-body-default font-normal text-on-surface-variant">• {table.environmentName}</span>
          </h1>
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-container px-2 py-0.5 text-label-micro text-on-surface-variant">
            <Icon name="group" className="text-[13px]" />
            {table.capacity} lug.
          </span>
        </div>
        <div className="pt-1 text-label-regular text-on-surface-variant">
          Atendente: <strong className="font-medium text-on-surface">{userName}</strong>
        </div>
      </div>

      {occupied ? (
        <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-low p-space-md">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">
              <Icon name="soup_kitchen" className="text-primary" />
              Já enviados
            </span>
            <span className="text-metric-table font-semibold text-on-surface">{formatMoney(sentTotal)}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {table.orders.map((order) => (
              <li key={order.id} className="rounded-lg bg-surface-container-lowest px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <ul className="min-w-0 text-label-regular text-on-surface-variant">
                    {order.items.length === 0 ? <li>Sem itens</li> : null}
                    {order.items.map((item) => (
                      <li key={item.id} className="min-w-0">
                        <span className="text-on-surface">
                          {item.quantity}× {itemTitle(item)}
                        </span>
                        {item.detail ? <span className="block truncate text-label-micro">{item.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-label-micro ${statusClasses[order.status]}`}>
                    {statusLabels[order.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Icon name="checklist" className="text-primary" />
            <h2 className="text-headline-sm text-on-surface">Itens a lançar</h2>
          </div>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-micro font-medium text-on-surface-variant">
            {lines.length} {lines.length === 1 ? "item distinto" : "itens distintos"}
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-space-lg text-center shadow-sm">
            <Icon name="shopping_basket" className="text-[28px] text-outline" />
            <p className="text-body-compact text-on-surface-variant">Nenhum item na comanda ainda.</p>
            <button
              type="button"
              onClick={onMore}
              className="h-10 rounded-lg bg-primary px-4 text-label-regular font-semibold text-on-primary md:hidden"
            >
              Adicionar itens
            </button>
            <p className="hidden text-label-micro text-outline md:block">Adicione produtos pela lista ao lado.</p>
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.key}
              className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
            >
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex min-w-0 gap-space-sm">
                  <ProductThumb name={line.product.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="line-clamp-2 text-body-medium text-on-surface">
                      {itemTitle({ productName: line.product.name, variantName: line.variantName })}
                    </span>
                    {line.summary ? (
                      <span className="text-label-regular text-primary">{line.summary}</span>
                    ) : null}
                    <span className="text-label-regular text-on-surface-variant">
                      {formatMoney(line.unitPrice)} un.
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-headline-sm text-on-surface">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantity(line.key, 0)}
                    title="Remover item"
                    aria-label={`Remover ${line.product.name}`}
                    className="mt-0.5 flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Stepper
                  quantity={line.quantity}
                  onChange={(quantity) => onQuantity(line.key, Math.max(1, quantity))}
                  min={1}
                  max={line.product.stockQuantity - (unitsOf(lines, line.productId) - line.quantity)}
                />
                <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1.5">
                  <Icon name="edit_note" className="shrink-0 text-[14px] text-primary" />
                  <input
                    value={line.note}
                    onChange={(event) => onItemNote(line.key, event.target.value)}
                    maxLength={200}
                    placeholder="Observação do preparo..."
                    className="w-full border-0 bg-transparent p-0 text-body-compact text-on-surface outline-none placeholder:text-on-surface-variant/60"
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
        <label htmlFor="order-notes" className="flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">
          <Icon name="assignment_late" className="text-secondary" />
          Observações gerais (cozinha / bar)
        </label>
        <div className="rounded-lg bg-surface-container-low p-2.5 transition-colors focus-within:bg-surface-container">
          <textarea
            id="order-notes"
            rows={2}
            value={notes}
            maxLength={1000}
            onChange={(event) => onNotes(event.target.value)}
            placeholder="Alergias, pedidos especiais, ordem de saída..."
            className="w-full resize-none bg-transparent text-body-default leading-tight text-on-surface outline-none placeholder:text-on-surface-variant/60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label-micro text-on-surface-variant">Atalhos rápidos:</span>
          <div className="flex flex-wrap gap-1.5">
            {quickTags.map((tag) => {
              const active = notes.includes(`+ ${tag}`);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => appendTag(tag)}
                  className={`min-h-8 rounded-full px-2.5 py-1 text-label-micro transition active:scale-95 ${
                    active
                      ? "bg-secondary-fixed text-on-secondary-fixed"
                      : "bg-surface-container text-on-surface hover:bg-secondary-fixed hover:text-on-secondary-fixed"
                  }`}
                >
                  + {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
        <div className="flex items-center justify-between text-body-compact text-on-surface-variant">
          <span>
            Este pedido ({units} {units === 1 ? "item" : "itens"})
          </span>
          <span className="text-metric-table text-on-surface">{formatMoney(total)}</span>
        </div>
        {occupied ? (
          <div className="flex items-center justify-between text-body-compact text-on-surface-variant">
            <span>Já lançado na mesa</span>
            <span className="text-metric-table text-on-surface">{formatMoney(sentTotal)}</span>
          </div>
        ) : null}
        <div className="my-1 h-px bg-surface-container" />
        <div className="flex items-baseline justify-between pt-0.5">
          <div className="flex flex-col">
            <span className="text-label-micro font-semibold tracking-wider text-on-surface-variant uppercase">
              Total da mesa
            </span>
            <span className="text-label-micro text-on-surface-variant">Prévia da comanda</span>
          </div>
          <span className="text-display-lg-mobile font-bold text-primary">{formatMoney(sentTotal + total)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-sm pt-1">
        <div className="grid grid-cols-2 gap-space-sm md:grid-cols-1">
          <button
            type="button"
            onClick={onClear}
            disabled={lines.length === 0 && !notes}
            className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-surface-container px-3 text-body-medium text-on-surface transition hover:bg-surface-container-high active:scale-[0.98] disabled:opacity-50"
          >
            <Icon name="clear_all" />
            Limpar
          </button>
          <button
            type="button"
            onClick={onMore}
            className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-surface-container px-3 text-body-medium text-on-surface transition hover:bg-surface-container-high active:scale-[0.98] md:hidden"
          >
            <Icon name="add_circle" className="text-primary" />
            Mais itens
          </button>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={sending || lines.length === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container text-headline-sm text-on-primary-container shadow-md transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
        >
          <Icon
            name={sending ? "progress_activity" : "send"}
            className={`text-[20px] ${sending ? "animate-spin" : ""}`}
          />
          {sending ? "Enviando pedido..." : "Enviar para cozinha"}
        </button>
        <p className="text-center text-label-micro text-on-surface-variant">
          O pedido aparece em Pedidos, na coluna Novos.
        </p>
      </div>
    </div>
  );
}

function Stepper({
  quantity,
  onChange,
  accent = false,
  min = 0,
  max = Number.POSITIVE_INFINITY,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  accent?: boolean;
  min?: number;
  /** Limite superior (estoque disponível). */
  max?: number;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-surface-container-low p-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= min}
        aria-label="Diminuir quantidade"
        className="flex size-9 items-center justify-center rounded-md bg-surface-container-lowest text-on-surface shadow-xs transition-transform active:scale-95 disabled:opacity-40"
      >
        <Icon name="remove" className="text-[16px]" />
      </button>
      <span className="w-8 text-center text-metric-table font-semibold text-on-surface" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label="Aumentar quantidade"
        title={quantity >= max ? "Sem estoque para mais unidades" : undefined}
        className={`flex size-9 items-center justify-center rounded-md shadow-xs transition-transform active:scale-95 disabled:opacity-40 ${
          accent ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface"
        }`}
      >
        <Icon name="add" className="text-[16px]" />
      </button>
    </div>
  );
}

function ProductThumb({ name, muted = false }: { name: string; muted?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-lg text-headline-sm font-semibold ${
        muted ? "bg-surface-container text-outline" : "bg-primary-fixed text-on-primary-fixed-variant"
      }`}
      aria-hidden="true"
    >
      {initials || name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-label-regular shadow-sm transition-all ${
        active ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 text-label-micro ${
          active ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-label-micro shadow-sm transition-all ${
        active ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface"
      }`}
    >
      {label}
      {count !== undefined ? <span className="opacity-60">({count})</span> : null}
    </button>
  );
}

function FloatingBar({
  tone,
  badge,
  icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  tone: "light" | "dark";
  badge?: string;
  icon?: string;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const dark = tone === "dark";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-margin-mobile">
      <div
        className={`pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl p-2.5 shadow-xl backdrop-blur-md ${
          dark ? "bg-inverse-surface/95 text-inverse-on-surface" : "bg-surface-container-lowest/95 text-on-surface"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5 pl-1">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg font-bold ${
              dark ? "rounded-full bg-primary text-on-primary" : "bg-primary-fixed text-primary"
            }`}
          >
            {icon ? <Icon name={icon} /> : badge}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className={`truncate text-body-medium font-semibold ${dark ? "text-inverse-on-surface" : "text-on-surface"}`}>
              {title}
            </span>
            <span className={`truncate text-label-micro ${dark ? "text-inverse-on-surface/80" : "text-on-surface-variant"}`}>
              {detail}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-label-regular font-semibold text-on-primary shadow-md transition-all hover:bg-primary-container active:scale-95"
        >
          {actionLabel}
          <Icon name="arrow_forward" className="text-[16px]" />
        </button>
      </div>
    </div>
  );
}

function BottomNav({
  view,
  units,
  onNavigate,
  canViewOrders,
}: {
  view: View;
  units: number;
  onNavigate: (view: View) => void;
  canViewOrders: boolean;
}) {
  const items: { view: View; label: string; icon: string; mobileOnly?: boolean }[] = [
    { view: "mesas", label: "Mesas", icon: "table_restaurant" },
    { view: "lancar", label: "Lançar", icon: "receipt_long" },
    { view: "comanda", label: "Comanda", icon: "shopping_basket", mobileOnly: true },
  ];
  const itemClass = "relative flex min-h-[44px] min-w-[64px] flex-col items-center justify-center transition-colors";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-around px-space-xs">
        {items.map((item) => {
          const active = view === item.view;
          // No tablet/desktop "Lançar" e "Comanda" ficam lado a lado, então "Lançar" representa os dois.
          const splitActive = item.view === "lancar" && view === "comanda";
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={active ? "page" : undefined}
              className={`${itemClass} ${item.mobileOnly ? "md:hidden" : ""} ${
                active
                  ? "text-primary"
                  : splitActive
                    ? "text-on-surface-variant md:text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={item.icon} className="text-[22px]" />
              <span className="mt-0.5 text-label-micro">{item.label}</span>
              {item.view === "comanda" && units > 0 ? (
                <span className="absolute top-0 right-3 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-on-primary">
                  {units}
                </span>
              ) : null}
            </button>
          );
        })}
        {canViewOrders ? (
          <Link href="/painel/pedidos" className={`${itemClass} text-on-surface-variant hover:text-on-surface`}>
            <Icon name="view_kanban" className="text-[22px]" />
            <span className="mt-0.5 text-label-micro">Pedidos</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
