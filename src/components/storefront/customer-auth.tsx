"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "@/components/ui/icon";
import { loginCustomerAction, registerCustomerAction } from "@/modules/customers/actions";

const inputClass =
  "h-11 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 text-body-default text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary";

export function CustomerAuth({ slug, next, checkout }: { slug: string; next: string; checkout: boolean }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginState, loginAction] = useActionState(loginCustomerAction, null);
  const [registerState, registerAction] = useActionState(registerCustomerAction, null);
  const error = mode === "login" ? loginState?.error : registerState?.error;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-space-lg">
      {checkout ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-primary-fixed/60 p-3 text-on-primary-fixed">
          <Icon name="shopping_bag" className="mt-0.5 text-primary" />
          <p className="text-body-compact">
            Seu carrinho está salvo. Entre ou crie sua conta para informar o endereço e finalizar o pedido.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 rounded-xl bg-surface-container-low p-1" role="tablist">
        {(
          [
            ["login", "Já tenho conta"],
            ["register", "Criar conta"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`h-10 rounded-lg text-body-medium transition-colors ${
              mode === value ? "bg-surface-container-lowest font-semibold text-on-surface shadow-sm" : "text-on-surface-variant"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "login" ? (
        <form action={loginAction} className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="next" value={next} />
          <Field label="E-mail">
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </Field>
          <Field label="Senha">
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </Field>
          {error ? <ErrorMessage text={error} /> : null}
          <Submit label="Entrar" />
        </form>
      ) : (
        <form action={registerAction} className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="next" value={next} />
          <Field label="Nome">
            <input name="name" autoComplete="name" required maxLength={80} className={inputClass} />
          </Field>
          <Field label="Celular com DDD" hint="Usado pela loja para falar com você sobre a entrega.">
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 91234-5678"
              required
              className={inputClass}
            />
          </Field>
          <Field label="E-mail">
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres.">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputClass}
            />
          </Field>
          {error ? <ErrorMessage text={error} /> : null}
          <Submit label="Criar conta" />
          <p className="text-center text-label-regular text-on-surface-variant">
            Seus dados são usados só por esta loja para entregar seus pedidos.
          </p>
        </form>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-label-regular font-medium text-on-surface">
      {label}
      {children}
      {hint ? <span className="text-label-micro font-normal text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-error-container px-3 py-2 text-body-compact text-on-error-container">
      <Icon name="error" className="text-[18px]" />
      {text}
    </p>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 items-center justify-center rounded-xl bg-primary text-headline-sm text-on-primary shadow-sm transition-colors hover:bg-primary-container disabled:opacity-60"
    >
      {pending ? "Aguarde…" : label}
    </button>
  );
}
