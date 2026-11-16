import { Suspense } from "react";
import { connection } from "next/server";

import { CatalogCart } from "@/components/storefront/catalog-cart";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { getPublicEstablishment } from "@/modules/tenancy/service";

export default function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-6">Carregando…</p>}>
      <Store params={params} />
    </Suspense>
  );
}

async function Store({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const establishment = await getPublicEstablishment(slug);
  const [categories, products] = await Promise.all([
    listCategories(establishment.id),
    listProducts(establishment.id, true),
  ]);

  const groups = categories.map((category) => ({
    id: category.id,
    name: category.name,
    products: products
      .filter((product) => product.categoryId === category.id)
      .map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
      })),
  }));

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{establishment.name}</h1>
      <CatalogCart slug={establishment.slug} categories={groups} />
    </main>
  );
}
