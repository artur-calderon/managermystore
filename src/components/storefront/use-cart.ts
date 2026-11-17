"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  defaultOptionIds,
  evaluateSelection,
  selectionKey,
  type ProductConfig,
} from "@/lib/product-config";

/**
 * Carrinho do cardápio público, salvo no navegador por loja.
 * Cada linha é um produto com uma escolha (variação/opções); a chave da linha junta tudo isso,
 * então a mesma escolha soma na mesma linha. Produto simples usa o próprio id como chave.
 */
export type CartLine = {
  productId: string;
  variantId: string | null;
  /** Ausente = opções padrão do produto (o servidor usa as incluídas). */
  optionIds?: string[];
  quantity: number;
  note?: string;
};
export type Cart = Record<string, CartLine>;

export type CartProduct = {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
  config: ProductConfig;
};

export type ResolvedLine = CartLine & {
  key: string;
  product: CartProduct;
  unitPrice: number;
  variantName: string | null;
  summary: string;
  /** Escolha que deixou de valer (opção removida/em falta, mínimo mudou...). */
  problem: string | null;
};

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

const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

function parse(raw: string): Cart {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const cart: Cart = {};
    for (const [key, entry] of Object.entries(value)) {
      // Formato antigo: { productId: quantidade }.
      if (isQuantity(entry)) {
        cart[key] = { productId: key, variantId: null, quantity: Math.min(entry, MAX_QUANTITY) };
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const line = entry as Partial<CartLine>;
      if (typeof line.productId !== "string" || !isQuantity(line.quantity)) continue;
      cart[key] = {
        productId: line.productId,
        variantId: typeof line.variantId === "string" ? line.variantId : null,
        optionIds: Array.isArray(line.optionIds)
          ? line.optionIds.filter((id): id is string => typeof id === "string").slice(0, 50)
          : undefined,
        quantity: Math.min(line.quantity, MAX_QUANTITY),
        note: typeof line.note === "string" ? line.note.slice(0, 200) : undefined,
      };
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

  /** Quantidade de uma linha; para produto simples a chave é o id do produto. */
  const setQuantity = useCallback(
    (key: string, quantity: number) => {
      const next = parse(read(slug));
      if (quantity <= 0) {
        delete next[key];
      } else {
        const amount = Math.min(Math.floor(quantity), MAX_QUANTITY);
        next[key] = next[key] ? { ...next[key], quantity: amount } : { productId: key, variantId: null, quantity: amount };
      }
      write(slug, next);
    },
    [slug],
  );

  /** Inclui uma escolha feita na folha de opções (soma se já houver a mesma escolha). */
  const addLine = useCallback(
    (line: CartLine) => {
      const next = parse(read(slug));
      const key = selectionKey(line.productId, line.variantId, line.optionIds);
      const existing = next[key];
      next[key] = {
        ...line,
        quantity: Math.min((existing?.quantity ?? 0) + line.quantity, MAX_QUANTITY),
        note: line.note?.trim() || existing?.note,
      };
      write(slug, next);
    },
    [slug],
  );

  const clear = useCallback(() => write(slug, {}), [slug]);

  return { cart, setQuantity, addLine, clear };
}

/** Junta o carrinho com os produtos atuais; produtos pausados/removidos ficam de fora. */
export function resolveCart(cart: Cart, productsById: Map<string, CartProduct>) {
  const lines: ResolvedLine[] = [];
  let missing = 0;

  for (const [key, line] of Object.entries(cart)) {
    const product = productsById.get(line.productId);
    if (!product) {
      missing += 1;
      continue;
    }
    const optionIds = line.optionIds ?? defaultOptionIds(product.config, line.variantId);
    const evaluation = evaluateSelection(product.price, product.config, line.variantId, optionIds);
    lines.push({
      ...line,
      key,
      product,
      unitPrice: evaluation.unitCents / 100,
      variantName: evaluation.variantName,
      summary: line.optionIds === undefined ? "" : evaluation.summary,
      problem: evaluation.problem,
    });
  }

  return { lines, missing };
}

export function unitsOf(lines: readonly ResolvedLine[], productId?: string) {
  return lines.reduce((sum, line) => sum + (!productId || line.productId === productId ? line.quantity : 0), 0);
}
