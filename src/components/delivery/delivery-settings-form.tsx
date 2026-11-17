"use client";

import Link from "next/link";
import { useState } from "react";

import { BoundForm, SubmitButton } from "@/components/shared/form";
import { Icon } from "@/components/ui/icon";
import {
  paymentMethodIcons,
  paymentMethodLabels,
  paymentMethods,
  type PaymentMethod,
} from "@/lib/payment-methods";
import { updateDeliverySettingsAction } from "@/modules/delivery/actions";

type Settings = { enabled: boolean; fee: string; paymentMethods: PaymentMethod[] };

const flow = [
  { icon: "fiber_new", label: "Novo" },
  { icon: "skillet", label: "Em preparo" },
  { icon: "check_circle", label: "Pronto" },
  { icon: "two_wheeler", label: "Saiu para entrega" },
  { icon: "task_alt", label: "Fechado" },
];

export function DeliverySettingsForm({ settings, storeHref }: { settings: Settings; storeHref: string }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [fee, setFee] = useState(settings.fee.replace(".", ","));
  const [methods, setMethods] = useState<PaymentMethod[]>(settings.paymentMethods);

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((item) => item !== method) : [...current, method],
    );
  }

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="text-headline-md tracking-tight text-on-surface">Delivery</h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-micro ${
                settings.enabled ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-high text-outline"
              }`}
            >
              <span className={`size-1.5 rounded-full ${settings.enabled ? "bg-emerald-600" : "bg-outline"}`} />
              {settings.enabled ? "Ativo" : "Desligado"}
            </span>
          </div>
          <p className="mt-1 text-body-compact text-outline">
            Configure a entrega dos pedidos feitos pelo cardápio digital.
          </p>
        </div>
        <Link
          href={storeHref}
          target="_blank"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3 py-1.5 text-body-compact text-on-surface shadow-sm hover:bg-surface-container"
        >
          <Icon name="open_in_new" className="text-outline" />
          Ver cardápio digital
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <BoundForm action={updateDeliverySettingsAction} className="flex flex-col gap-space-md lg:col-span-7">
          <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-body-medium font-semibold text-on-surface">Aceitar pedidos de delivery</span>
                <span className="mt-0.5 block text-label-regular text-on-surface-variant">
                  Desligado, a loja continua funcionando só com salão e balcão, sem nenhuma mudança no fluxo.
                </span>
              </span>
              <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-6 w-10 rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
                <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </span>
            </label>
          </section>

          <fieldset
            disabled={!enabled}
            className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm transition-opacity disabled:opacity-60"
          >
            <label className="grid gap-1 text-label-regular font-medium text-on-surface">
              <span className="flex items-center gap-1.5">
                <Icon name="local_shipping" className="text-primary" />
                Taxa de entrega
              </span>
              <span className="text-label-micro font-normal text-on-surface-variant">
                Valor fixo somado a cada pedido de delivery. Use 0 para entrega grátis.
              </span>
              <span className="relative mt-1 max-w-48">
                <span className="absolute top-2 left-2.5 text-label-micro text-outline">R$</span>
                <input
                  name="fee"
                  inputMode="decimal"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                  placeholder="0,00"
                  className="h-9 w-full rounded border border-outline-variant/40 bg-surface-container-low pr-2 pl-8 text-body-medium font-medium text-on-surface outline-none focus:border-primary"
                />
              </span>
            </label>

            <div className="grid gap-2">
              <span className="flex items-center gap-1.5 text-label-regular font-medium text-on-surface">
                <Icon name="payments" className="text-primary" />
                Formas de pagamento aceitas
              </span>
              <span className="text-label-micro text-on-surface-variant">
                O cliente escolhe uma delas no pedido, para o entregador já saber como vai receber. Nenhum pagamento é
                processado pelo sistema.
              </span>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {paymentMethods.map((method) => {
                  const checked = methods.includes(method);
                  return (
                    <label
                      key={method}
                      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                        checked
                          ? "border-primary/40 bg-primary-fixed/60 text-on-primary-fixed"
                          : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-outline-variant"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="paymentMethods"
                        value={method}
                        checked={checked}
                        onChange={() => toggleMethod(method)}
                        className="size-4 accent-primary"
                      />
                      <Icon name={paymentMethodIcons[method]} className={checked ? "text-primary" : "text-outline"} />
                      <span className="text-body-compact font-medium">{paymentMethodLabels[method]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {/* Campos desabilitados não são enviados: mantém taxa e formas salvas ao desligar o delivery. */}
          {!enabled ? (
            <>
              <input type="hidden" name="fee" value={fee} />
              {methods.map((method) => (
                <input key={method} type="hidden" name="paymentMethods" value={method} />
              ))}
            </>
          ) : null}

          <div className="flex justify-end">
            <SubmitButton>Salvar configuração</SubmitButton>
          </div>
        </BoundForm>

        <aside className="flex flex-col gap-space-md lg:col-span-5">
          <section className="flex flex-col gap-space-sm rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <h2 className="flex items-center gap-1.5 text-body-medium font-semibold text-on-surface">
              <Icon name="route" className="text-primary" />
              Fluxo de um pedido de delivery
            </h2>
            <ol className="flex flex-col gap-1.5">
              {flow.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2.5">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      step.label === "Saiu para entrega"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    <Icon name={step.icon} className="text-[16px]" />
                  </span>
                  <span className="text-body-compact text-on-surface">
                    {index + 1}. {step.label}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-label-regular text-on-surface-variant">
              &quot;Saiu para entrega&quot; existe só nos pedidos de delivery. Pedidos de salão e balcão continuam
              indo de Pronto direto para Fechado.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
