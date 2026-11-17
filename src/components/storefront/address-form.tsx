"use client";

import { useState, useTransition } from "react";

import { createAddressAction } from "@/modules/customers/actions";

export const storeInputClass =
  "h-11 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 text-body-default text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary";

const fields = [
  { name: "postalCode", label: "CEP", placeholder: "00000-000", span: 1, inputMode: "numeric" as const },
  { name: "label", label: "Apelido (opcional)", placeholder: "Casa, Trabalho...", span: 1 },
  { name: "street", label: "Rua", placeholder: "Rua das Flores", span: 2, required: true },
  { name: "number", label: "Número", placeholder: "123", span: 1, required: true },
  { name: "complement", label: "Complemento", placeholder: "Apto 12", span: 1 },
  { name: "neighborhood", label: "Bairro", placeholder: "Centro", span: 1, required: true },
  { name: "city", label: "Cidade", placeholder: "São Paulo", span: 1, required: true },
  { name: "reference", label: "Ponto de referência", placeholder: "Perto da padaria", span: 2 },
];

export function AddressForm({
  slug,
  onSaved,
  onCancel,
}: {
  slug: string;
  onSaved: (addressId: string) => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const values = Object.fromEntries(fields.map((field) => [field.name, String(data.get(field.name) ?? "")]));
    setError(null);
    startTransition(async () => {
      const result = await createAddressAction(slug, values);
      if (result.error || !result.addressId) {
        setError(result.error ?? "Não foi possível salvar o endereço.");
        return;
      }
      form.reset();
      onSaved(result.addressId);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className="grid grid-cols-2 gap-x-3 gap-y-space-md"
    >
      {fields.map((field) => (
        <label
          key={field.name}
          className={`grid gap-1 text-label-regular font-medium text-on-surface ${field.span === 2 ? "col-span-2" : "col-span-2 sm:col-span-1"}`}
        >
          {field.label}
          <input
            name={field.name}
            placeholder={field.placeholder}
            required={field.required}
            inputMode={field.inputMode}
            className={storeInputClass}
          />
        </label>
      ))}
      {error ? (
        <p role="alert" className="col-span-2 rounded-lg bg-error-container px-3 py-2 text-body-compact text-on-error-container">
          {error}
        </p>
      ) : null}
      <div className="col-span-2 flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-lg bg-surface-container px-4 text-body-medium text-on-surface hover:bg-surface-container-high"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-primary px-4 text-body-medium font-medium text-on-primary hover:bg-primary-container disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar endereço"}
        </button>
      </div>
    </form>
  );
}
