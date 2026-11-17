import { createHash } from "node:crypto";

import { asc, inArray } from "drizzle-orm";

import type { Db } from "@/lib/db";
import { productOptionGroups, productOptions, productVariants } from "@/lib/db/schema";
import type { OrderItemOption } from "@/lib/order-item-options";
import type { ProductConfig, ProductOptionGroup, ProductVariant } from "@/lib/product-config";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";

export type { ProductConfig, ProductOption, ProductOptionGroup, ProductVariant } from "@/lib/product-config";

/** O que o garçom/cliente escolheu. `optionIds` ausente = opções incluídas por padrão. */
export type ItemSelection = {
  variantId?: string | null;
  optionIds?: string[];
  notes?: string | null;
};

export type ResolvedItem = {
  unitPrice: string;
  variantId: string | null;
  variantName: string | null;
  options: OrderItemOption[];
  notes: string | null;
  configKey: string;
};

/** Carrega variações e grupos de opções de vários produtos (3 consultas, ordenadas). */
export async function loadProductConfigs(executor: Db, productIds: string[]) {
  const configs = new Map<string, ProductConfig>();
  if (productIds.length === 0) {
    return configs;
  }

  for (const productId of productIds) {
    configs.set(productId, { variants: [], groups: [] });
  }

  const [variants, groups] = await Promise.all([
    executor
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt)),
    executor
      .select()
      .from(productOptionGroups)
      .where(inArray(productOptionGroups.productId, productIds))
      .orderBy(asc(productOptionGroups.sortOrder), asc(productOptionGroups.createdAt)),
  ]);

  const options =
    groups.length === 0
      ? []
      : await executor
          .select()
          .from(productOptions)
          .where(
            inArray(
              productOptions.groupId,
              groups.map((group) => group.id),
            ),
          )
          .orderBy(asc(productOptions.sortOrder), asc(productOptions.createdAt));

  for (const variant of variants) {
    configs.get(variant.productId)?.variants.push({
      id: variant.id,
      name: variant.name,
      price: variant.price,
      isAvailable: variant.isAvailable,
    });
  }

  const groupsById = new Map<string, ProductOptionGroup>();
  for (const group of groups) {
    const entry: ProductOptionGroup = {
      id: group.id,
      variantId: group.variantId,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: [],
    };
    groupsById.set(group.id, entry);
    configs.get(group.productId)?.groups.push(entry);
  }

  for (const option of options) {
    groupsById.get(option.groupId)?.options.push({
      id: option.id,
      name: option.name,
      price: option.price,
      isDefault: option.isDefault,
      isAvailable: option.isAvailable,
    });
  }

  return configs;
}

export async function loadProductConfig(executor: Db, productId: string) {
  return (await loadProductConfigs(executor, [productId])).get(productId) ?? { variants: [], groups: [] };
}

/**
 * Valida a escolha contra a configuração do produto e calcula o preço unitário no servidor.
 * Regras: variação obrigatória quando existir; opções precisam ser dos grupos que valem para a
 * variação; mínimo/máximo por grupo; opção indisponível não pode ser escolhida; opção incluída
 * não soma nem desconta do preço; as demais somam o seu preço.
 */
export function resolveItemSelection(
  product: { name: string; price: string },
  config: ProductConfig,
  selection: ItemSelection = {},
): ResolvedItem {
  let variant: ProductVariant | null = null;

  if (config.variants.length > 0) {
    if (!selection.variantId) {
      throw new AppError("variant_required", `Escolha uma opção de ${product.name}.`);
    }
    variant = config.variants.find((item) => item.id === selection.variantId) ?? null;
    if (!variant) {
      throw new AppError("invalid_variant", `Opção inválida para ${product.name}.`);
    }
    if (!variant.isAvailable) {
      throw new AppError("variant_unavailable", `${product.name} ${variant.name} está indisponível no momento.`);
    }
  } else if (selection.variantId) {
    throw new AppError("invalid_variant", `${product.name} não tem variações.`);
  }

  const groups = config.groups.filter((group) => !group.variantId || group.variantId === variant?.id);
  const allowed = new Map(groups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));

  let selected: Set<string>;
  if (selection.optionIds === undefined) {
    selected = new Set(
      groups.flatMap((group) =>
        group.options.filter((option) => option.isDefault && option.isAvailable).map((option) => option.id),
      ),
    );
  } else {
    selected = new Set(selection.optionIds);
    for (const optionId of selected) {
      if (!allowed.has(optionId)) {
        throw new AppError("invalid_option", `Opção inválida para ${product.name}.`);
      }
    }
  }

  let cents = toCents(variant ? variant.price : product.price);
  const snapshot: OrderItemOption[] = [];

  for (const group of groups) {
    const chosen = group.options.filter((option) => selected.has(option.id));

    for (const option of chosen) {
      if (!option.isAvailable) {
        throw new AppError("option_unavailable", `${option.name} acabou. Retire de ${product.name} para continuar.`);
      }
    }

    if (chosen.length < group.minSelect || chosen.length > group.maxSelect) {
      throw new AppError("invalid_options", `${product.name}: ${selectionRule(group)} em "${group.name}".`);
    }

    for (const option of group.options) {
      const isSelected = selected.has(option.id);
      if (!isSelected && !option.isDefault) {
        continue;
      }
      const charged = isSelected && !option.isDefault ? toCents(option.price) : 0;
      cents += charged;
      snapshot.push({
        groupId: group.id,
        group: group.name,
        optionId: option.id,
        name: option.name,
        price: fromCents(charged),
        kind: option.isDefault ? (isSelected ? "included" : "removed") : "added",
      });
    }
  }

  const notes = selection.notes?.trim() || null;
  const sortedOptions = [...selected].sort();
  const configKey =
    !variant && sortedOptions.length === 0 && !notes
      ? ""
      : createHash("sha256")
          .update(JSON.stringify([variant?.id ?? null, sortedOptions, notes]))
          .digest("hex")
          .slice(0, 32);

  return {
    unitPrice: fromCents(cents),
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    options: snapshot,
    notes,
    configKey,
  };
}

function selectionRule(group: { minSelect: number; maxSelect: number }) {
  if (group.minSelect === group.maxSelect) {
    return `escolha ${group.minSelect} ${group.minSelect === 1 ? "opção" : "opções"}`;
  }
  if (group.minSelect === 0) {
    return `escolha até ${group.maxSelect} ${group.maxSelect === 1 ? "opção" : "opções"}`;
  }
  return `escolha de ${group.minSelect} a ${group.maxSelect} opções`;
}

// Usado por quem precisa saber se um produto exige escolha antes de ir ao carrinho.
export function requiresSelection(config: ProductConfig) {
  return config.variants.length > 0 || config.groups.some((group) => group.options.length > 0);
}
