import { Suspense } from "react";
import { connection } from "next/server";

import {
  ProductsRegistry,
  type RegistryCategory,
  type RegistryProduct,
} from "@/components/catalog/products-registry";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";
import { formatMoney } from "@/server/money";

export default function ProductsPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  await connection();
  const actor = await requirePageActor("/painel/produtos");
  const [categories, products] = await Promise.all([
    listCategories(actor.establishmentId),
    listProducts(actor.establishmentId),
  ]);

  const rows: RegistryProduct[] = products.map((product) => {
    const price = Number(product.price);
    const cost = product.costPrice === null ? null : Number(product.costPrice);
    const marginLabel =
      cost !== null && Number.isFinite(price) && price > 0
        ? `${Math.round(((price - cost) / price) * 100)}% margem`
        : null;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      priceLabel: formatMoney(product.price),
      costPrice: product.costPrice,
      costPriceLabel: product.costPrice === null ? null : formatMoney(product.costPrice),
      marginLabel,
      stockQuantity: product.stockQuantity,
      isAvailable: product.isAvailable,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
    };
  });

  const categoryRows: RegistryCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <ProductsRegistry
      products={rows}
      categories={categoryRows}
      canManage={can(actor.role, "catalog.manage")}
      catalogHref={`/loja/${actor.slug}`}
    />
  );
}
