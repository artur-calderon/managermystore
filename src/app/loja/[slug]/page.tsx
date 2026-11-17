import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { Storefront, type StorefrontCategory } from "@/components/storefront/storefront";
import { db } from "@/lib/db";
import { emptyConfig } from "@/lib/product-config";
import { listCategories, listProducts } from "@/modules/catalog/service";
import { loadProductConfigs } from "@/modules/catalog/variations";
import { getDeliverySettings } from "@/modules/delivery/service";
import { getStoreAndCustomer } from "@/server/customer-session";

export default function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando cardápio…</p>}>
      <Store params={params} />
    </Suspense>
  );
}

async function Store({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const { store, customer } = await getStoreAndCustomer(slug);
  if (!store) {
    notFound();
  }

  const [categories, products, delivery] = await Promise.all([
    listCategories(store.id),
    // Só produtos ativos: pausados não aparecem no cardápio digital.
    listProducts(store.id, true),
    getDeliverySettings(store.id),
  ]);
  const configs = await loadProductConfigs(
    db,
    products.map((product) => product.id),
  );

  const groups: StorefrontCategory[] = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      products: products
        .filter((product) => product.categoryId === category.id)
        .map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: Number(product.price),
          stockQuantity: product.stockQuantity,
          config: configs.get(product.id) ?? emptyConfig,
        })),
    }))
    .filter((category) => category.products.length > 0);

  return (
    <Storefront
      store={{ name: store.name, slug: store.slug, acceptingOrders: store.acceptingOrders }}
      delivery={{
        enabled: delivery.enabled,
        fee: Number(delivery.fee),
        paymentMethods: delivery.paymentMethods,
      }}
      categories={groups}
      customer={customer ? { firstName: customer.name.split(" ")[0] } : null}
    />
  );
}
