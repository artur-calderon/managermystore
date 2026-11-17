/**
 * Opção gravada no item do pedido (cópia do momento do pedido). Seguro para o cliente.
 * - "included": vinha incluída e foi mantida;
 * - "removed": vinha incluída e foi retirada ("sem farofa");
 * - "added": escolhida pelo cliente (sabor, adicional, ponto da carne...).
 */
export type OrderItemOption = {
  groupId: string;
  group: string;
  optionId: string;
  name: string;
  /** Valor cobrado por unidade (0.00 para opções incluídas). */
  price: string;
  kind: "included" | "removed" | "added";
};

/** "Espetinho Completo" — produto com a variação escolhida. */
export function itemTitle(item: { productName: string; variantName?: string | null }) {
  return item.variantName ? `${item.productName} ${item.variantName}` : item.productName;
}

/** Linha de detalhe do item: opções fora do padrão e observação. */
export function itemDetail(item: { options?: readonly OrderItemOption[] | null; notes?: string | null }) {
  return [describeItemOptions(item.options ?? []), item.notes ? `Obs.: ${item.notes}` : ""].filter(Boolean).join(" · ");
}

/** Resumo curto para cozinha/pedidos: só o que foge do padrão. */
export function describeItemOptions(options: readonly OrderItemOption[]) {
  const removed = options.filter((option) => option.kind === "removed").map((option) => `sem ${option.name}`);
  const added = options.filter((option) => option.kind === "added").map((option) => option.name);
  return [...removed, ...added].join(", ");
}
