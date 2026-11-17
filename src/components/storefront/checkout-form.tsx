"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { itemTitle } from "@/lib/order-item-options";
import { paymentMethodIcons, paymentMethodLabels, type PaymentMethod } from "@/lib/payment-methods";
import { placeDeliveryOrderAction } from "@/modules/customers/actions";

import { AddressForm, storeInputClass } from "./address-form";
import { resolveCart, unitsOf, useCart, type CartProduct } from "./use-cart";

type Address = { id: string; label: string | null; text: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function CheckoutForm({
  slug,
  customerName,
  canOrder,
  closed,
  fee,
  paymentMethods,
  addresses,
  products,
}: {
  slug: string;
  customerName: string;
  canOrder: boolean;
  closed: boolean;
  fee: number;
  paymentMethods: PaymentMethod[];
  addresses: Address[];
  products: CartProduct[];
}) {
  const router = useRouter();
  const { cart, setQuantity, clear } = useCart(slug);
  const [addressId, setAddressId] = useState<string | null>(addresses[0]?.id ?? null);
  const [addingAddress, setAddingAddress] = useState(addresses.length === 0);
  const [payment, setPayment] = useState<PaymentMethod | null>(paymentMethods[0] ?? null);
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const { lines, missing: unavailable } = resolveCart(cart, productsById);
  const hasProblem = lines.some((line) => line.problem);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const total = subtotal + fee;

  function submit() {
    setError(null);
    if (!addressId) return setError("Escolha ou cadastre um endereço de entrega.");
    if (!payment) return setError("Escolha a forma de pagamento.");
    if (hasProblem) return setError("Revise os itens marcados no carrinho antes de enviar.");

    startSending(async () => {
      const result = await placeDeliveryOrderAction(slug, {
        addressId,
        paymentMethod: payment,
        changeFor: payment === "cash" ? changeFor : undefined,
        notes,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          variantId: line.variantId,
          optionIds: line.optionIds,
          note: line.note,
        })),
      });

      if (result.error || !result.orderId) {
        setError(result.error ?? "Não foi possível enviar o pedido.");
        return;
      }

      clear();
      router.push(`/loja/${slug}/pedidos/${result.orderId}`);
    });
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
        <Icon name="shopping_bag" className="text-[36px] text-outline" />
        <p className="text-body-medium text-on-surface">Seu carrinho está vazio.</p>
        <Link href={`/loja/${slug}`} className="h-11 rounded-lg bg-primary px-4 leading-[2.75rem] font-medium text-on-primary">
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-lg">
      <p className="text-body-default text-on-surface-variant">
        Olá, <strong className="text-on-surface">{customerName.split(" ")[0]}</strong>! Confira seu pedido.
      </p>

      {closed ? (
        <Notice icon="schedule" text="A loja está fechada agora. Seu carrinho fica salvo até ela abrir." />
      ) : !canOrder ? (
        <Notice icon="block" text="Esta loja não está aceitando pedidos de delivery no momento." />
      ) : null}

      <Section icon="shopping_bag" title="Itens">
        <ul className="flex flex-col divide-y divide-surface-container">
          {lines.map(({ key, product, quantity, variantName, summary, note, problem, unitPrice, productId }) => (
            <li key={key} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-body-medium text-on-surface">{itemTitle({ productName: product.name, variantName })}</p>
                {summary ? <p className="text-label-regular text-primary">{summary}</p> : null}
                {note ? <p className="text-label-regular text-on-surface-variant">Obs.: {note}</p> : null}
                {problem ? <p className="text-label-regular text-error">{problem} Remova e escolha de novo.</p> : null}
                <p className="text-label-regular text-on-surface-variant">{money.format(unitPrice * quantity)}</p>
              </div>
              <div className="flex shrink-0 items-center rounded-lg bg-surface-container-low p-0.5">
                <button
                  type="button"
                  onClick={() => setQuantity(key, quantity - 1)}
                  aria-label={quantity === 1 ? `Remover ${product.name}` : `Diminuir ${product.name}`}
                  className="flex size-9 items-center justify-center rounded-md bg-surface-container-lowest text-on-surface shadow-xs"
                >
                  <Icon name={quantity === 1 ? "delete" : "remove"} className="text-[16px]" />
                </button>
                <span className="w-7 text-center text-metric-table font-semibold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(key, quantity + 1)}
                  disabled={unitsOf(lines, productId) >= Math.min(99, product.stockQuantity)}
                  aria-label={`Aumentar ${product.name}`}
                  className="flex size-9 items-center justify-center rounded-md bg-primary text-on-primary shadow-xs disabled:opacity-40"
                >
                  <Icon name="add" className="text-[16px]" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {unavailable > 0 ? (
          <p className="text-label-regular text-on-surface-variant">
            {unavailable === 1 ? "1 item do carrinho não está mais disponível" : `${unavailable} itens do carrinho não estão mais disponíveis`} e
            foi removido do pedido.
          </p>
        ) : null}
        <Link href={`/loja/${slug}`} className="w-fit text-body-compact font-medium text-primary">
          + Adicionar mais itens
        </Link>
      </Section>

      <Section icon="location_on" title="Endereço de entrega">
        {addresses.length > 0 ? (
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Endereço de entrega">
            {addresses.map((address) => (
              <Choice
                key={address.id}
                checked={addressId === address.id}
                onSelect={() => setAddressId(address.id)}
                title={address.label ?? address.text.split("\n")[0]}
                detail={address.label ? address.text : address.text.split("\n").slice(1).join(" · ")}
              />
            ))}
          </div>
        ) : null}
        {addingAddress ? (
          <div className="rounded-lg bg-surface-container-low p-space-md">
            <AddressForm
              slug={slug}
              onSaved={(id) => {
                setAddressId(id);
                setAddingAddress(false);
                router.refresh();
              }}
              onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingAddress(true)}
            className="flex h-11 w-fit items-center gap-1.5 rounded-lg bg-surface-container px-3 text-body-compact font-medium text-on-surface hover:bg-surface-container-high"
          >
            <Icon name="add_location_alt" className="text-primary" />
            Novo endereço
          </button>
        )}
      </Section>

      <Section icon="payments" title="Pagamento na entrega">
        <p className="-mt-1 text-label-regular text-on-surface-variant">
          Você paga ao entregador. Escolha a forma para ele já levar o necessário.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma de pagamento">
          {paymentMethods.map((method) => (
            <Choice
              key={method}
              checked={payment === method}
              onSelect={() => setPayment(method)}
              icon={paymentMethodIcons[method]}
              title={paymentMethodLabels[method]}
            />
          ))}
        </div>
        {payment === "cash" ? (
          <label className="grid gap-1 text-label-regular font-medium text-on-surface">
            Troco para quanto? (opcional)
            <span className="relative max-w-56">
              <span className="absolute top-3 left-3 text-label-micro text-outline">R$</span>
              <input
                inputMode="decimal"
                value={changeFor}
                onChange={(event) => setChangeFor(event.target.value)}
                placeholder="Ex.: 100,00"
                className={`${storeInputClass} pl-9`}
              />
            </span>
            <span className="text-label-micro font-normal text-on-surface-variant">Deixe vazio se não precisar de troco.</span>
          </label>
        ) : null}
      </Section>

      <Section icon="edit_note" title="Observações (opcional)">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Ex.: sem cebola, interfone quebrado..."
          className="w-full resize-none rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-body-default outline-none placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </Section>

      <section className="flex flex-col gap-1.5 rounded-xl bg-surface-container-lowest p-space-lg text-body-compact shadow-sm">
        <div className="flex justify-between text-on-surface-variant">
          <span>Subtotal</span>
          <span className="text-on-surface">{money.format(subtotal)}</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Taxa de entrega</span>
          <span className="text-on-surface">{fee > 0 ? money.format(fee) : "Grátis"}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-surface-container pt-2">
          <span className="text-label-micro font-semibold tracking-wider text-on-surface-variant uppercase">Total</span>
          <span className="text-headline-md font-bold text-primary">{money.format(total)}</span>
        </div>
      </section>

      {error ? (
        <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-error-container px-3 py-2 text-body-compact text-on-error-container">
          <Icon name="error" className="text-[18px]" />
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!canOrder || sending || addingAddress || hasProblem}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-container text-headline-sm text-on-primary-container shadow-md transition-opacity disabled:opacity-50"
      >
        <Icon name={sending ? "progress_activity" : "send"} className={`text-[20px] ${sending ? "animate-spin" : ""}`} />
        {sending ? "Enviando pedido…" : `Enviar pedido · ${money.format(total)}`}
      </button>
      {addingAddress && canOrder ? (
        <p className="-mt-3 text-center text-label-regular text-on-surface-variant">Salve o endereço para enviar o pedido.</p>
      ) : null}
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <h2 className="flex items-center gap-1.5 text-headline-sm text-on-surface">
        <Icon name={icon} className="text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  detail,
  icon,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail?: string;
  icon?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex min-h-12 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        checked ? "border-primary bg-primary-fixed/50" : "border-outline-variant/50 hover:border-outline"
      }`}
    >
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-primary" : "border-outline"
        }`}
      >
        {checked ? <span className="size-2.5 rounded-full bg-primary" /> : null}
      </span>
      {icon ? <Icon name={icon} className={checked ? "text-primary" : "text-outline"} /> : null}
      <span className="min-w-0">
        <span className="block text-body-medium text-on-surface">{title}</span>
        {detail ? <span className="block text-label-regular whitespace-pre-line text-on-surface-variant">{detail}</span> : null}
      </span>
    </button>
  );
}

function Notice({ icon, text }: { icon: string; text: string }) {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl bg-inverse-surface px-3.5 py-3 text-inverse-on-surface">
      <Icon name={icon} className="mt-0.5 text-inverse-primary" />
      <p className="text-body-compact">{text}</p>
    </div>
  );
}
