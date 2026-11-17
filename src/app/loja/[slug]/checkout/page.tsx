import { Suspense } from "react";
import { db } from "@/lib/db";
import { emptyConfig } from "@/lib/product-config";
import { loadProductConfigs } from "@/modules/catalog/variations";

import { CheckoutForm } from "@/components/storefront/checkout-form";
import { StoreShell } from "@/components/storefront/store-shell";
import { listProducts } from "@/modules/catalog/service";
import { formatAddress, listAddresses } from "@/modules/customers/service";
import { getDeliverySettings } from "@/modules/delivery/service";
import { requireCustomer } from "@/server/customer-session";

export default function CheckoutPage(props: PageProps<"/loja/[slug]/checkout">) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <Checkout {...props} />
    </Suspense>
  );
}

async function Checkout({ params }: PageProps<"/loja/[slug]/checkout">) {
  const { slug } = await params;
  const { store, customer } = await requireCustomer(slug, "checkout");
  const [addresses, delivery, products] = await Promise.all([
    listAddresses(customer),
    getDeliverySettings(store.id),
    listProducts(store.id, true),
  ]);
  const configs = await loadProductConfigs(
    db,
    products.map((product) => product.id),
  );

  return (
    <StoreShell slug={slug} storeName={store.name} title="Finalizar pedido" customerName={customer.name}>
      <CheckoutForm
        slug={slug}
        customerName={customer.name}
        canOrder={store.acceptingOrders && delivery.enabled}
        closed={!store.acceptingOrders}
        fee={Number(delivery.fee)}
        paymentMethods={delivery.paymentMethods}
        addresses={addresses.map((address) => ({
          id: address.id,
          label: address.label,
          text: formatAddress(address),
        }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: Number(product.price),
          stockQuantity: product.stockQuantity,
          config: configs.get(product.id) ?? emptyConfig,
        }))}
      />
    </StoreShell>
  );
}
