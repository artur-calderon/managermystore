import { and, eq, inArray, isNull } from "drizzle-orm";

import { productOptionGroups, productOptions, products, productVariants } from "@/lib/db/schema";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";
import { transaction } from "@/server/transaction";

import { loadProductConfig } from "./variations";

/**
 * Cadastro (painel): salva variações e grupos de um produto de uma vez, preservando os ids
 * existentes (carrinhos e pedidos antigos continuam apontando para as mesmas opções).
 * `key` identifica a variação dentro do formulário, inclusive as novas (ainda sem id).
 */
export type ConfigInput = {
  variants: { key: string; id?: string; name: string; price: string; isAvailable: boolean }[];
  groups: {
    id?: string;
    variantKey: string | null;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id?: string; name: string; price: string; isDefault: boolean; isAvailable: boolean }[];
  }[];
};

const MAX_VARIANTS = 20;
const MAX_GROUPS = 20;
const MAX_OPTIONS = 50;

/** Normaliza e valida o que veio do formulário (regras de negócio). */
export function normalizeConfigInput(input: ConfigInput) {
  if (input.variants.length > MAX_VARIANTS) {
    throw new AppError("invalid_config", `Cadastre no máximo ${MAX_VARIANTS} variações.`);
  }
  if (input.groups.length > MAX_GROUPS) {
    throw new AppError("invalid_config", `Cadastre no máximo ${MAX_GROUPS} grupos de opções.`);
  }

  const variantNames = new Set<string>();
  const variantKeys = new Set<string>();
  const variants = input.variants.map((variant, index) => {
    const name = variant.name.trim();
    if (!name) {
      throw new AppError("invalid_config", `Informe o nome da variação ${index + 1}.`);
    }
    if (variantNames.has(name.toLowerCase())) {
      throw new AppError("invalid_config", `A variação "${name}" está repetida.`);
    }
    if (variantKeys.has(variant.key)) {
      throw new AppError("invalid_config", "Variação duplicada.");
    }
    variantNames.add(name.toLowerCase());
    variantKeys.add(variant.key);
    return { ...variant, name, price: parsePrice(variant.price, `O preço da variação "${name}"`) };
  });

  const groups = input.groups.map((group, index) => {
    const name = group.name.trim();
    if (!name) {
      throw new AppError("invalid_config", `Informe o nome do grupo ${index + 1}.`);
    }
    if (group.variantKey !== null && !variantKeys.has(group.variantKey)) {
      throw new AppError("invalid_config", `O grupo "${name}" aponta para uma variação que não existe mais.`);
    }
    if (group.options.length === 0) {
      throw new AppError("invalid_config", `Adicione ao menos uma opção em "${name}".`);
    }
    if (group.options.length > MAX_OPTIONS) {
      throw new AppError("invalid_config", `"${name}" pode ter no máximo ${MAX_OPTIONS} opções.`);
    }
    const minSelect = Math.trunc(group.minSelect);
    const maxSelect = Math.trunc(group.maxSelect);
    if (!Number.isFinite(minSelect) || !Number.isFinite(maxSelect) || minSelect < 0 || maxSelect < 1) {
      throw new AppError("invalid_config", `Revise o mínimo e o máximo de "${name}".`);
    }
    if (minSelect > maxSelect) {
      throw new AppError("invalid_config", `Em "${name}" o mínimo não pode ser maior que o máximo.`);
    }
    if (maxSelect > group.options.length) {
      throw new AppError("invalid_config", `Em "${name}" o máximo é maior que o número de opções.`);
    }

    const optionNames = new Set<string>();
    const options = group.options.map((option, optionIndex) => {
      const optionName = option.name.trim();
      if (!optionName) {
        throw new AppError("invalid_config", `Informe o nome da opção ${optionIndex + 1} de "${name}".`);
      }
      if (optionNames.has(optionName.toLowerCase())) {
        throw new AppError("invalid_config", `A opção "${optionName}" está repetida em "${name}".`);
      }
      optionNames.add(optionName.toLowerCase());
      return {
        ...option,
        name: optionName,
        // Opção incluída já está no preço do produto: não cobra nem desconta.
        price: option.isDefault ? "0.00" : parsePrice(option.price.trim() || "0", `O preço de "${optionName}"`),
      };
    });

    const defaults = options.filter((option) => option.isDefault).length;
    if (defaults > maxSelect) {
      throw new AppError(
        "invalid_config",
        `Em "${name}" há ${defaults} opções incluídas, mas o máximo é ${maxSelect}.`,
      );
    }

    return { ...group, name, minSelect, maxSelect, options };
  });

  return { variants, groups };
}

export async function saveProductConfig(actor: Actor, productId: string, input: ConfigInput) {
  assertCan(actor.role, "catalog.manage");
  const config = normalizeConfigInput(input);
  const establishmentId = actor.establishmentId;

  return transaction(async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.establishmentId, establishmentId), isNull(products.deletedAt)),
      )
      .for("update");
    if (!product) {
      throw new AppError("not_found", "Produto não encontrado.");
    }

    const [existingVariants, existingGroups] = await Promise.all([
      tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, product.id)),
      tx
        .select({ id: productOptionGroups.id })
        .from(productOptionGroups)
        .where(eq(productOptionGroups.productId, product.id)),
    ]);
    const variantIds = new Set(existingVariants.map((row) => row.id));
    const groupIds = new Set(existingGroups.map((row) => row.id));
    const existingOptions =
      groupIds.size === 0
        ? []
        : await tx
            .select({ id: productOptions.id, groupId: productOptions.groupId })
            .from(productOptions)
            .where(inArray(productOptions.groupId, [...groupIds]));
    const optionGroup = new Map(existingOptions.map((row) => [row.id, row.groupId]));

    // Ids enviados precisam ser deste produto (e cada opção, do mesmo grupo).
    for (const variant of config.variants) {
      if (variant.id && !variantIds.has(variant.id)) throw staleConfig();
    }
    for (const group of config.groups) {
      if (group.id && !groupIds.has(group.id)) throw staleConfig();
      for (const option of group.options) {
        if (option.id && (!group.id || optionGroup.get(option.id) !== group.id)) throw staleConfig();
      }
    }

    // 1) Variações: atualiza/insere. Remoção só no fim, para não apagar grupos em cascata antes da hora.
    const variantIdByKey = new Map<string, string>();
    for (const [index, variant] of config.variants.entries()) {
      const values = { name: variant.name, price: variant.price, isAvailable: variant.isAvailable, sortOrder: index };
      if (variant.id) {
        await tx.update(productVariants).set(values).where(eq(productVariants.id, variant.id));
        variantIdByKey.set(variant.key, variant.id);
      } else {
        const [created] = await tx
          .insert(productVariants)
          .values({ ...values, establishmentId, productId: product.id })
          .returning({ id: productVariants.id });
        variantIdByKey.set(variant.key, created.id);
      }
    }

    // 2) Grupos e opções.
    const keptGroups = new Set<string>();
    const keptOptions = new Set<string>();
    for (const [index, group] of config.groups.entries()) {
      const values = {
        name: group.name,
        variantId: group.variantKey === null ? null : (variantIdByKey.get(group.variantKey) ?? null),
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: index,
      };
      let groupId = group.id;
      if (groupId) {
        await tx.update(productOptionGroups).set(values).where(eq(productOptionGroups.id, groupId));
      } else {
        const [created] = await tx
          .insert(productOptionGroups)
          .values({ ...values, establishmentId, productId: product.id })
          .returning({ id: productOptionGroups.id });
        groupId = created.id;
      }
      keptGroups.add(groupId);

      for (const [optionIndex, option] of group.options.entries()) {
        const optionValues = {
          name: option.name,
          price: option.price,
          isDefault: option.isDefault,
          isAvailable: option.isAvailable,
          sortOrder: optionIndex,
        };
        if (option.id) {
          await tx.update(productOptions).set(optionValues).where(eq(productOptions.id, option.id));
          keptOptions.add(option.id);
        } else {
          await tx.insert(productOptions).values({ ...optionValues, establishmentId, groupId });
        }
      }
    }

    // 3) Remove o que saiu do formulário.
    const removedOptions = existingOptions
      .filter((row) => keptGroups.has(row.groupId) && !keptOptions.has(row.id))
      .map((row) => row.id);
    if (removedOptions.length > 0) {
      await tx.delete(productOptions).where(inArray(productOptions.id, removedOptions));
    }
    const removedGroups = [...groupIds].filter((id) => !keptGroups.has(id));
    if (removedGroups.length > 0) {
      await tx.delete(productOptionGroups).where(inArray(productOptionGroups.id, removedGroups));
    }
    const keptVariants = new Set(variantIdByKey.values());
    const removedVariants = [...variantIds].filter((id) => !keptVariants.has(id));
    if (removedVariants.length > 0) {
      await tx.delete(productVariants).where(inArray(productVariants.id, removedVariants));
    }

    // Com variações, o preço do produto vira o "a partir de" (menor preço entre elas).
    if (config.variants.length > 0) {
      const lowest = Math.min(...config.variants.map((variant) => toCents(variant.price)));
      await tx.update(products).set({ price: fromCents(lowest) }).where(eq(products.id, product.id));
    }

    return loadProductConfig(tx, product.id);
  });
}

function staleConfig() {
  return new AppError(
    "invalid_config",
    "As opções deste produto foram alteradas em outra tela. Recarregue a página e tente de novo.",
  );
}

function parsePrice(value: string, label: string) {
  let cents = Number.NaN;
  try {
    if (value.trim()) cents = toCents(value.trim().replace(",", "."));
  } catch {
    cents = Number.NaN;
  }
  if (!Number.isFinite(cents) || cents < 0) {
    throw new AppError("invalid_price", `${label} é inválido.`);
  }
  return fromCents(cents);
}
