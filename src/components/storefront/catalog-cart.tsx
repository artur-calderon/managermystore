"use client";

import { useState } from "react";

import { placeCatalogOrderAction } from "@/modules/orders/actions";

type Product = { id: string; name: string; description: string | null; price: string };
type Category = { id: string; name: string; products: Product[] };

export function CatalogCart({ slug, categories }: { slug: string; categories: Category[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; totalAmount: string } | null>(null);

  function changeQuantity(productId: string, quantity: number) {
    setQuantities((current) => ({ ...current, [productId]: Math.max(0, quantity) }));
  }

  async function submit() {
    setPending(true);
    setError(null);
    const items = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    const result = await placeCatalogOrderAction({ slug, customerName, notes, items });
    setPending(false);

    if (!result || ("error" in result && result.error)) {
      setError(result?.error ?? "Não foi possível enviar o pedido.");
      return;
    }

    if ("id" in result && result.id && result.totalAmount) {
      setConfirmation({ id: result.id, totalAmount: result.totalAmount });
      setQuantities({});
    }
  }

  if (confirmation) {
    return (
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Pedido enviado</h2>
        <p>Número: {confirmation.id}</p>
        <p>Total: {confirmation.totalAmount}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      {categories.map((category) => (
        <div key={category.id} className="grid gap-2">
          <h2 className="font-semibold">{category.name}</h2>
          {category.products.map((product) => (
            <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 border p-3">
              <div>
                <p>{product.name}</p>
                {product.description ? <p>{product.description}</p> : null}
                <p>{product.price}</p>
              </div>
              <input
                className="w-20 border px-2 py-1"
                type="number"
                min={0}
                value={quantities[product.id] ?? 0}
                onChange={(event) => changeQuantity(product.id, Number(event.target.value))}
              />
            </div>
          ))}
        </div>
      ))}
      <label>
        Nome
        <input className="border px-2 py-1" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
      </label>
      <label>
        Observações
        <input className="border px-2 py-1" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={pending} onClick={submit}>
        {pending ? "Enviando…" : "Enviar pedido"}
      </button>
    </section>
  );
}
