"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { OptionsSheet } from "@/components/waiter/options-sheet";
import { itemTitle } from "@/lib/order-item-options";
import { paymentMethodLabels, type PaymentMethod } from "@/lib/payment-methods";
import { hasChoices, type ProductConfig } from "@/lib/product-config";

import { resolveCart, unitsOf, useCart, type ResolvedLine } from "./use-cart";

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stockQuantity: number;
  config: ProductConfig;
};

export type StorefrontCategory = { id: string; name: string; products: StorefrontProduct[] };

type Store = { name: string; slug: string; acceptingOrders: boolean };
type Delivery = { enabled: boolean; fee: number; paymentMethods: PaymentMethod[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatMoney(value: number) {
  return money.format(value);
}

export function Storefront({
  store,
  delivery,
  categories,
  customer,
}: {
  store: Store;
  delivery: Delivery;
  categories: StorefrontCategory[];
  customer: { firstName: string } | null;
}) {
  const { cart, setQuantity, addLine, clear } = useCart(store.slug);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [choosing, setChoosing] = useState<StorefrontProduct | null>(null);

  // Pedido online só com a loja aberta e o delivery ativo; caso contrário o cardápio é só para consulta.
  const canOrder = store.acceptingOrders && delivery.enabled;
  const showCart = delivery.enabled;

  const products = useMemo(
    () => new Map(categories.flatMap((group) => group.products.map((product) => [product.id, product]))),
    [categories],
  );
  // Itens de produtos pausados ou removidos desde que foram ao carrinho são ignorados.
  const { lines } = resolveCart(cart, products);
  const units = unitsOf(lines);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  const term = query.trim().toLowerCase();
  const visible = categories
    .filter((group) => category === "all" || group.id === category)
    .map((group) => ({
      ...group,
      products: group.products.filter(
        (product) =>
          !term ||
          product.name.toLowerCase().includes(term) ||
          (product.description?.toLowerCase().includes(term) ?? false),
      ),
    }))
    .filter((group) => group.products.length > 0);

  useEffect(() => {
    if (!cartOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cartOpen]);

  const cartPanel = (onClose?: () => void) => (
    <CartPanel
      slug={store.slug}
      onClose={onClose}
      lines={lines}
      units={units}
      subtotal={subtotal}
      fee={delivery.fee}
      canOrder={canOrder}
      onQuantity={setQuantity}
      onClear={clear}
    />
  );

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-margin-mobile pt-[calc(1rem+env(safe-area-inset-top))] pb-4 md:px-margin">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-container text-headline-sm font-bold text-on-primary-container">
              {initials(store.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-headline-md text-on-surface">{store.name}</h1>
              <span
                className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-micro ${
                  store.acceptingOrders ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${store.acceptingOrders ? "animate-pulse bg-emerald-600" : "bg-outline"}`}
                />
                {store.acceptingOrders ? "Aberto agora" : "Fechado agora"}
              </span>
            </div>
            {showCart ? (
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {customer ? (
                  <Link
                    href={`/loja/${store.slug}/pedidos`}
                    aria-label="Meus pedidos"
                    className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
                  >
                    <Icon name="receipt_long" className="text-[22px]" />
                  </Link>
                ) : null}
                <Link
                  href={customer ? `/loja/${store.slug}/conta` : `/loja/${store.slug}/entrar`}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-surface-container-low px-3 text-body-compact font-medium text-on-surface hover:bg-surface-container"
                >
                  <Icon name="account_circle" className="text-[20px] text-primary" />
                  <span className="max-w-24 truncate">{customer ? customer.firstName : "Entrar"}</span>
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-label-regular text-on-surface-variant">
            {delivery.enabled ? (
              <>
                <span className="flex items-center gap-1">
                  <Icon name="two_wheeler" className="text-[16px] text-primary" />
                  {delivery.fee > 0 ? `Entrega ${formatMoney(delivery.fee)}` : "Entrega grátis"}
                </span>
                {delivery.paymentMethods.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <Icon name="payments" className="text-[16px] text-primary" />
                    {delivery.paymentMethods.map((method) => paymentMethodLabels[method]).join(" · ")}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="flex items-center gap-1">
                <Icon name="menu_book" className="text-[16px] text-primary" />
                Cardápio para consulta — faça seu pedido no local
              </span>
            )}
          </div>
        </div>
      </header>

      {!store.acceptingOrders ? (
        <div className="mx-auto max-w-6xl px-margin-mobile pt-3 md:px-margin">
          <div role="status" className="flex items-start gap-2.5 rounded-xl bg-inverse-surface px-3.5 py-3 text-inverse-on-surface">
            <Icon name="schedule" className="mt-0.5 text-[20px] text-inverse-primary" />
            <div>
              <p className="text-body-medium font-semibold">Fechado agora</p>
              <p className="text-body-compact text-inverse-on-surface/80">
                Você pode ver o cardápio, mas os pedidos estão pausados até a loja abrir.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="sticky top-0 z-30 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-margin-mobile py-3 md:px-margin">
          <div className="relative flex items-center lg:max-w-md">
            <Icon name="search" className="pointer-events-none absolute left-3 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar no cardápio..."
              aria-label="Buscar no cardápio"
              className="h-10 w-full rounded-xl bg-surface-container-lowest pr-3 pl-9 text-body-default text-on-surface shadow-sm outline-none placeholder:text-on-surface-variant/60 focus:ring-1 focus:ring-primary"
            />
          </div>
          {categories.length > 1 ? (
            <div className="no-scrollbar -mx-margin-mobile flex items-center gap-2 overflow-x-auto px-margin-mobile md:mx-0 md:px-0">
              <Pill active={category === "all"} onClick={() => setCategory("all")}>
                Todos
              </Pill>
              {categories.map((group) => (
                <Pill key={group.id} active={category === group.id} onClick={() => setCategory(group.id)}>
                  {group.name}
                </Pill>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <main
        className={`mx-auto grid max-w-6xl grid-cols-1 gap-space-lg px-margin-mobile pt-1 md:px-margin ${
          showCart ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-10" : "pb-10"
        }`}
      >
        <div className="flex flex-col gap-space-xl">
          {categories.length === 0 ? (
            <EmptyState icon="restaurant_menu" text="O cardápio ainda está sendo preparado." />
          ) : visible.length === 0 ? (
            <EmptyState icon="search_off" text="Nenhum item encontrado." />
          ) : (
            visible.map((group) => (
              <section key={group.id} aria-labelledby={`categoria-${group.id}`} className="flex flex-col gap-2.5">
                <h2 id={`categoria-${group.id}`} className="text-headline-sm text-on-surface">
                  {group.name}
                </h2>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {group.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      quantity={cart[product.id]?.quantity ?? 0}
                      units={unitsOf(lines, product.id)}
                      canOrder={canOrder}
                      closed={!store.acceptingOrders}
                      showActions={showCart}
                      onQuantity={(quantity) => setQuantity(product.id, quantity)}
                      onChoose={() => setChoosing(product)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {showCart ? (
          <aside className="hidden lg:block">
            <div className="sticky top-[7.5rem] max-h-[calc(100dvh-8.5rem)] overflow-y-auto rounded-xl bg-surface-container-lowest shadow-sm">
              {cartPanel()}
            </div>
          </aside>
        ) : null}
      </main>

      {showCart && units > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-margin-mobile pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-inverse-surface/95 p-2.5 text-inverse-on-surface shadow-xl backdrop-blur-xl active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2.5 pl-1">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                <Icon name="shopping_bag" />
                <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-inverse-primary px-1 text-center text-[11px] leading-5 font-bold text-on-primary-fixed">
                  {units}
                </span>
              </span>
              <span className="flex min-w-0 flex-col items-start">
                <span className="text-label-micro text-inverse-on-surface/80">Seu pedido</span>
                <span className="text-body-medium font-semibold">{formatMoney(subtotal)}</span>
              </span>
            </span>
            <span className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-label-regular font-semibold text-on-primary">
              Ver carrinho
              <Icon name="arrow_forward" className="text-[16px]" />
            </span>
          </button>
        </div>
      ) : null}

      {choosing ? (
        <OptionsSheet
          key={choosing.id}
          product={choosing}
          available={Math.max(0, Math.min(99, choosing.stockQuantity) - unitsOf(lines, choosing.id))}
          confirmLabel="Adicionar ao carrinho"
          onClose={() => setChoosing(null)}
          onAdd={(selection) => {
            addLine({
              productId: choosing.id,
              variantId: selection.variantId,
              optionIds: selection.optionIds,
              quantity: selection.quantity,
              note: selection.note,
            });
            setChoosing(null);
          }}
        />
      ) : null}

      {showCart ? (
        <div className={`fixed inset-0 z-50 lg:hidden ${cartOpen ? "" : "pointer-events-none"}`} aria-hidden={!cartOpen}>
          <div
            onClick={() => setCartOpen(false)}
            className={`absolute inset-0 bg-inverse-surface/40 transition-opacity duration-200 ${
              cartOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Carrinho"
            className={`absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-200 ease-out ${
              cartOpen ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-outline-variant" aria-hidden="true" />
            <div className="overflow-y-auto">{cartPanel(() => setCartOpen(false))}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  quantity,
  units,
  canOrder,
  closed,
  showActions,
  onQuantity,
  onChoose,
}: {
  product: StorefrontProduct;
  /** Quantidade da linha simples (produto sem escolhas). */
  quantity: number;
  /** Total do produto no carrinho (todas as escolhas). */
  units: number;
  canOrder: boolean;
  closed: boolean;
  showActions: boolean;
  onQuantity: (quantity: number) => void;
  onChoose: () => void;
}) {
  const soldOut = product.stockQuantity <= 0;
  const choices = hasChoices(product.config);
  const limit = Math.min(99, product.stockQuantity);
  return (
    <article
      className={`flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm transition-shadow ${
        closed || soldOut ? "opacity-60 grayscale" : units > 0 ? "ring-1 ring-primary/30" : ""
      }`}
    >
      <div
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-headline-sm font-semibold text-on-primary-fixed-variant"
      >
        {initials(product.name)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="text-body-medium font-semibold text-on-surface">{product.name}</h3>
        {product.description ? (
          <p className="line-clamp-2 text-label-regular text-on-surface-variant">{product.description}</p>
        ) : null}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={`text-metric-table font-semibold ${closed ? "text-on-surface-variant" : "text-on-surface"}`}>
            {product.config.variants.length > 0 ? (
              <span className="mr-1 text-label-micro font-normal text-on-surface-variant">a partir de</span>
            ) : null}
            {formatMoney(product.price)}
          </span>
          {!showActions ? null : soldOut ? (
            <span className="rounded bg-surface-container px-2 py-1 text-label-micro text-on-surface-variant">
              Esgotado
            </span>
          ) : !canOrder ? (
            <span className="rounded bg-surface-container px-2 py-1 text-label-micro text-on-surface-variant">
              Indisponível
            </span>
          ) : choices ? (
            <button
              type="button"
              onClick={onChoose}
              disabled={units >= limit}
              aria-label={`Escolher ${product.name}`}
              className="relative flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary-fixed px-3 text-label-regular font-semibold text-primary transition-all hover:bg-primary hover:text-on-primary active:scale-95 disabled:opacity-50"
            >
              <Icon name="add" className="text-[16px]" />
              Escolher
              {units > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-bold text-on-primary">
                  {units}
                </span>
              ) : null}
            </button>
          ) : quantity > 0 ? (
            <Stepper quantity={quantity} onChange={onQuantity} label={product.name} max={limit} />
          ) : (
            <button
              type="button"
              onClick={() => onQuantity(1)}
              aria-label={`Adicionar ${product.name}`}
              className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary-fixed px-3 text-label-regular font-semibold text-primary transition-all hover:bg-primary hover:text-on-primary active:scale-95"
            >
              <Icon name="add" className="text-[16px]" />
              Adicionar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CartPanel({
  slug,
  lines,
  units,
  subtotal,
  fee,
  canOrder,
  onQuantity,
  onClear,
  onClose,
}: {
  lines: ResolvedLine[];
  units: number;
  subtotal: number;
  fee: number;
  canOrder: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onClear: () => void;
  onClose?: () => void;
  slug: string;
}) {
  return (
    <div className="flex flex-col gap-space-md p-space-lg">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-headline-sm text-on-surface">
          <Icon name="shopping_bag" className="text-primary" />
          Seu pedido
        </h2>
        <div className="flex items-center gap-1">
          {lines.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="h-9 rounded-lg px-2 text-label-regular text-on-surface-variant hover:text-error"
            >
              Limpar
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar carrinho"
              className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
            >
              <Icon name="close" className="text-[22px]" />
            </button>
          ) : null}
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-container-low p-space-lg text-center">
          <Icon name="shopping_bag" className="text-[28px] text-outline" />
          <p className="text-body-compact text-on-surface-variant">Seu carrinho está vazio.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-container">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-body-medium text-on-surface">
                  {itemTitle({ productName: line.product.name, variantName: line.variantName })}
                </p>
                {line.summary ? <p className="text-label-regular text-primary">{line.summary}</p> : null}
                {line.note ? <p className="text-label-regular text-on-surface-variant">Obs.: {line.note}</p> : null}
                {line.problem ? <p className="text-label-regular text-error">{line.problem} Remova e escolha de novo.</p> : null}
                <p className="text-label-regular text-on-surface-variant">{formatMoney(line.unitPrice * line.quantity)}</p>
              </div>
              {canOrder ? (
                <Stepper
                  quantity={line.quantity}
                  onChange={(next) => onQuantity(line.key, next)}
                  label={line.product.name}
                  max={Math.min(99, line.product.stockQuantity) - (unitsOf(lines, line.productId) - line.quantity)}
                />
              ) : (
                <span className="text-body-compact text-on-surface-variant">{line.quantity}×</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5 border-t border-surface-container pt-space-md text-body-compact">
        <div className="flex justify-between text-on-surface-variant">
          <span>
            Subtotal ({units} {units === 1 ? "item" : "itens"})
          </span>
          <span className="text-on-surface">{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Taxa de entrega</span>
          <span className="text-on-surface">{fee > 0 ? formatMoney(fee) : "Grátis"}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-label-micro font-semibold tracking-wider text-on-surface-variant uppercase">Total</span>
          <span className="text-headline-md font-bold text-primary">
            {formatMoney(lines.length > 0 ? subtotal + fee : 0)}
          </span>
        </div>
      </div>

      {canOrder && lines.length > 0 ? (
        <Link
          href={`/loja/${slug}/checkout`}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container text-headline-sm text-on-primary-container shadow-md transition-opacity hover:opacity-95"
        >
          Finalizar pedido
          <Icon name="arrow_forward" className="text-[20px]" />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container text-headline-sm text-on-primary-container shadow-md disabled:opacity-50"
        >
          Finalizar pedido
        </button>
      )}
      {!canOrder ? (
        <p className="text-center text-label-regular text-on-surface-variant">
          A loja está fechada. Os itens ficam salvos no carrinho.
        </p>
      ) : null}
    </div>
  );
}

function Stepper({
  quantity,
  onChange,
  label,
  max = 99,
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  label: string;
  max?: number;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-surface-container-low p-0.5">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={quantity === 1 ? `Remover ${label}` : `Diminuir ${label}`}
        className="flex size-9 items-center justify-center rounded-md bg-surface-container-lowest text-on-surface shadow-xs active:scale-95"
      >
        <Icon name={quantity === 1 ? "delete" : "remove"} className="text-[16px]" />
      </button>
      <span className="w-7 text-center text-metric-table font-semibold text-on-surface" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
        aria-label={`Aumentar ${label}`}
        className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary shadow-xs active:scale-95 disabled:opacity-40"
      >
        <Icon name="add" className="text-[16px]" />
      </button>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full px-3.5 text-label-regular shadow-sm transition-colors ${
        active ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-low p-8 text-center">
      <Icon name={icon} className="text-[32px] text-outline" />
      <p className="text-body-compact text-on-surface-variant">{text}</p>
    </div>
  );
}

function initials(name: string) {
  const words = name.split(/\s+/).filter((word) => word.length > 2);
  return (words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || name.slice(0, 1)).toUpperCase();
}
