import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";

import type { Actor } from "@/modules/tenancy/service";

export async function listCategories(establishmentId: string, includeInactive = false) {
  return db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.establishmentId, establishmentId),
        includeInactive ? undefined : isNull(categories.deletedAt),
      ),
    )
    .orderBy(categories.name);
}

export async function createCategory(actor: Actor, name: string) {
  assertCan(actor.role, "catalog.manage");
  const [category] = await db
    .insert(categories)
    .values({ establishmentId: actor.establishmentId, name: name.trim() })
    .returning();
  return category;
}

export async function updateCategory(actor: Actor, categoryId: string, name: string) {
  assertCan(actor.role, "catalog.manage");
  const [category] = await db
    .update(categories)
    .set({ name: name.trim() })
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.establishmentId, actor.establishmentId),
        isNull(categories.deletedAt),
      ),
    )
    .returning();

  if (!category) {
    throw new AppError("not_found", "Categoria não encontrada.");
  }

  return category;
}

export async function deactivateCategory(actor: Actor, categoryId: string) {
  assertCan(actor.role, "catalog.manage");
  const [category] = await db
    .update(categories)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.establishmentId, actor.establishmentId),
        isNull(categories.deletedAt),
      ),
    )
    .returning();

  if (!category) {
    throw new AppError("not_found", "Categoria não encontrada.");
  }

  return category;
}

export async function listProducts(establishmentId: string, availableOnly = false) {
  return db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      categoryName: categories.name,
      name: products.name,
      description: products.description,
      price: products.price,
      costPrice: products.costPrice,
      isAvailable: products.isAvailable,
      deletedAt: products.deletedAt,
    })
    .from(products)
    .innerJoin(
      categories,
      and(
        eq(categories.id, products.categoryId),
        eq(categories.establishmentId, products.establishmentId),
      ),
    )
    .where(
      and(
        eq(products.establishmentId, establishmentId),
        isNull(products.deletedAt),
        isNull(categories.deletedAt),
        availableOnly ? eq(products.isAvailable, true) : undefined,
      ),
    )
    .orderBy(categories.name, products.name);
}

export async function createProduct(
  actor: Actor,
  input: {
    categoryId: string;
    name: string;
    description?: string;
    price: string;
    costPrice?: string;
  },
) {
  assertCan(actor.role, "catalog.manage");
  await assertCategory(actor.establishmentId, input.categoryId);
  const price = normalizePrice(input.price);

  const [product] = await db
    .insert(products)
    .values({
      establishmentId: actor.establishmentId,
      categoryId: input.categoryId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price,
      costPrice: normalizeOptionalPrice(input.costPrice),
    })
    .returning();

  return product;
}

export async function updateProduct(
  actor: Actor,
  productId: string,
  input: {
    categoryId?: string;
    name?: string;
    description?: string;
    price?: string;
    costPrice?: string | null;
    isAvailable?: boolean;
  },
) {
  assertCan(actor.role, "catalog.manage");

  if (input.categoryId) {
    await assertCategory(actor.establishmentId, input.categoryId);
  }

  const [product] = await db
    .update(products)
    .set({
      categoryId: input.categoryId,
      name: input.name?.trim(),
      description: input.description === undefined ? undefined : input.description.trim() || null,
      price: input.price === undefined ? undefined : normalizePrice(input.price),
      costPrice:
        input.costPrice === undefined ? undefined : normalizeOptionalPrice(input.costPrice ?? undefined),
      isAvailable: input.isAvailable,
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.establishmentId, actor.establishmentId),
        isNull(products.deletedAt),
      ),
    )
    .returning();

  if (!product) {
    throw new AppError("not_found", "Produto não encontrado.");
  }

  return product;
}

export async function deactivateProduct(actor: Actor, productId: string) {
  assertCan(actor.role, "catalog.manage");
  const [product] = await db
    .update(products)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(products.id, productId),
        eq(products.establishmentId, actor.establishmentId),
        isNull(products.deletedAt),
      ),
    )
    .returning();

  if (!product) {
    throw new AppError("not_found", "Produto não encontrado.");
  }

  return product;
}

async function assertCategory(establishmentId: string, categoryId: string) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        eq(categories.establishmentId, establishmentId),
        isNull(categories.deletedAt),
      ),
    )
    .limit(1);

  if (!category) {
    throw new AppError("not_found", "Categoria não encontrada neste estabelecimento.");
  }
}

function normalizePrice(value: string) {
  const cents = toCents(value.replace(",", "."));
  if (cents < 0) {
    throw new AppError("invalid_price", "O preço não pode ser negativo.");
  }
  return fromCents(cents);
}

function normalizeOptionalPrice(value?: string) {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return normalizePrice(value);
}
