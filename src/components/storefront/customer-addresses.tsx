"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { deleteAddressAction } from "@/modules/customers/actions";

import { AddressForm } from "./address-form";

type Address = { id: string; label: string | null; text: string };

export function CustomerAddresses({ slug, addresses }: { slug: string; addresses: Address[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [state, deleteAction, deleting] = useActionState(deleteAddressAction, null);

  return (
    <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-headline-sm text-on-surface">
          <Icon name="location_on" className="text-primary" />
          Endereços
        </h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-10 items-center gap-1 rounded-lg bg-surface-container px-3 text-body-compact font-medium text-on-surface hover:bg-surface-container-high"
          >
            <Icon name="add" className="text-primary" />
            Novo
          </button>
        ) : null}
      </div>

      {addresses.length === 0 && !adding ? (
        <p className="text-body-compact text-on-surface-variant">Nenhum endereço salvo ainda.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {addresses.map((address) => (
          <li key={address.id} className="flex items-start gap-2 rounded-lg border border-outline-variant/40 p-3">
            <div className="min-w-0 flex-1">
              {address.label ? <p className="text-body-medium font-semibold text-on-surface">{address.label}</p> : null}
              <p className="text-body-compact whitespace-pre-line text-on-surface-variant">{address.text}</p>
            </div>
            <form action={deleteAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="addressId" value={address.id} />
              <button
                type="submit"
                disabled={deleting}
                aria-label="Remover endereço"
                className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-error disabled:opacity-50"
              >
                <Icon name="delete" />
              </button>
            </form>
          </li>
        ))}
      </ul>

      {state?.error ? (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-body-compact text-on-error-container">
          {state.error}
        </p>
      ) : null}

      {adding ? (
        <div className="rounded-lg bg-surface-container-low p-space-md">
          <AddressForm
            slug={slug}
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
