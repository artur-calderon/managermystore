"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Carrinho do cardápio público: `productId -> quantidade`, salvo no navegador por loja. */
export type Cart = Record<string, number>;

const MAX_QUANTITY = 99;
const listeners = new Set<() => void>();
// Usado quando o localStorage não está disponível (janela anônima, bloqueio de cookies...).
const memory = new Map<string, string>();

function storageKey(slug: string) {
  return `mms:cart:${slug}`;
}

function read(slug: string): string {
  try {
    return window.localStorage.getItem(storageKey(slug)) ?? memory.get(slug) ?? "{}";
  } catch {
    return memory.get(slug) ?? "{}";
  }
}

function write(slug: string, cart: Cart) {
  const raw = JSON.stringify(cart);
  memory.set(slug, raw);
  try {
    window.localStorage.setItem(storageKey(slug), raw);
  } catch {
    // Sem localStorage: o carrinho vale só enquanto a página estiver aberta.
  }
  listeners.forEach((listener) => listener());
}

function parse(raw: string): Cart {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const cart: Cart = {};
    for (const [productId, quantity] of Object.entries(value)) {
      if (typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0) {
        cart[productId] = Math.min(quantity, MAX_QUANTITY);
      }
    }
    return cart;
  } catch {
    return {};
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Mantém abas da mesma loja sincronizadas.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useCart(slug: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => "{}",
  );
  const cart = useMemo(() => parse(raw), [raw]);

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const next = parse(read(slug));
      if (quantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = Math.min(Math.floor(quantity), MAX_QUANTITY);
      }
      write(slug, next);
    },
    [slug],
  );

  const clear = useCallback(() => write(slug, {}), [slug]);

  return { cart, setQuantity, clear };
}
