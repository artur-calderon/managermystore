import { Suspense } from "react";
import { connection } from "next/server";

import {
  ProductsRegistry,
  type RegistryCategory,
  type RegistryProduct,
} from "@/components/catalog/products-registry";
import { db } from "@/lib/db";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { loadProductConfigs } from "@/modules/catalog/variations";
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
  const configs = await loadProductConfigs(
    db,
    products.map((product) => product.id),
  );

  const canManage = can(actor.role, "catalog.manage");

  const rows: RegistryProduct[] = products.map((product) => {
    const price = Number(product.price);
    // Custo e margem são dados de gestão: nem chegam ao navegador de quem só consulta o cardápio.
    const costPrice = canManage ? product.costPrice : null;
    const cost = costPrice === null ? null : Number(costPrice);
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
      costPrice,
      costPriceLabel: costPrice === null ? null : formatMoney(costPrice),
      marginLabel,
      stockQuantity: product.stockQuantity,
      isAvailable: product.isAvailable,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      config: configs.get(product.id) ?? { variants: [], groups: [] },
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
      canManage={canManage}
      catalogHref={`/loja/${actor.slug}`}
    />
  );
}
