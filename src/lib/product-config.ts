/**
 * Variações e opções de produto: tipos e cálculo de preço/validação usados nas telas
 * (garçom e cardápio). O servidor refaz a validação e o cálculo — este arquivo é só para a interface.
 */
export type ProductVariant = { id: string; name: string; price: string; isAvailable: boolean };
export type ProductOption = { id: string; name: string; price: string; isDefault: boolean; isAvailable: boolean };
export type ProductOptionGroup = {
  id: string;
  variantId: string | null;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ProductOption[];
};
export type ProductConfig = { variants: ProductVariant[]; groups: ProductOptionGroup[] };

export const emptyConfig: ProductConfig = { variants: [], groups: [] };

export function hasChoices(config: ProductConfig) {
  return config.variants.length > 0 || config.groups.some((group) => group.options.length > 0);
}

export function groupsFor(config: ProductConfig, variantId: string | null) {
  return config.groups.filter((group) => !group.variantId || group.variantId === variantId);
}

/** Opções incluídas e disponíveis (o que vem marcado ao abrir a escolha). */
export function defaultOptionIds(config: ProductConfig, variantId: string | null) {
  return groupsFor(config, variantId).flatMap((group) =>
    group.options.filter((option) => option.isDefault && option.isAvailable).map((option) => option.id),
  );
}

export type SelectionResult = {
  /** Preço unitário em centavos. */
  unitCents: number;
  variantName: string | null;
  /** "sem farofa, Queijo coalho" — só o que foge do padrão. */
  summary: string;
  /** Mensagem do primeiro problema (variação não escolhida, mínimo não atingido...). */
  problem: string | null;
};

export function evaluateSelection(
  basePrice: string | number,
  config: ProductConfig,
  variantId: string | null,
  optionIds: readonly string[],
): SelectionResult {
  const variant = config.variants.find((item) => item.id === variantId) ?? null;
  let unitCents = toCents(variant ? variant.price : basePrice);
  let problem: string | null = null;

  if (config.variants.length > 0 && !variant) {
    problem = "Escolha uma opção.";
  } else if (variant && !variant.isAvailable) {
    problem = `${variant.name} está em falta.`;
  }

  const selected = new Set(optionIds);
  const removed: string[] = [];
  const added: string[] = [];

  for (const group of groupsFor(config, variant?.id ?? null)) {
    let count = 0;
    for (const option of group.options) {
      const isSelected = selected.has(option.id);
      if (isSelected) count += 1;
      if (isSelected && !option.isDefault) {
        unitCents += toCents(option.price);
        added.push(option.name);
      }
      if (!isSelected && option.isDefault) removed.push(`sem ${option.name}`);
      if (isSelected && !option.isAvailable) problem ??= `${option.name} está em falta.`;
    }
    if (count < group.minSelect) {
      problem ??=
        group.minSelect === 1
          ? `Escolha uma opção em "${group.name}".`
          : `Escolha ${group.minSelect} opções em "${group.name}".`;
    }
    if (count > group.maxSelect) {
      problem ??= `Escolha no máximo ${group.maxSelect} em "${group.name}".`;
    }
  }

  return { unitCents, variantName: variant?.name ?? null, summary: [...removed, ...added].join(", "), problem };
}

/** Chave da linha no carrinho/comanda: itens com a mesma escolha somam na mesma linha. */
export function selectionKey(productId: string, variantId: string | null, optionIds: readonly string[] | undefined) {
  if (!variantId && optionIds === undefined) return productId;
  return [productId, variantId ?? "", ...[...(optionIds ?? [])].sort()].join("|");
}

function toCents(value: string | number) {
  return Math.round(Number(value) * 100);
}
