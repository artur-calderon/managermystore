import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { CustomerAuth } from "@/components/storefront/customer-auth";
import { StoreShell } from "@/components/storefront/store-shell";
import { getStoreAndCustomer } from "@/server/customer-session";

const allowedNext = ["checkout", "pedidos", "conta"] as const;

export default function CustomerLoginPage(props: PageProps<"/loja/[slug]/entrar">) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <CustomerLogin {...props} />
    </Suspense>
  );
}

async function CustomerLogin({ params, searchParams }: PageProps<"/loja/[slug]/entrar">) {
  const { slug } = await params;
  const query = await searchParams;
  const nextValue = typeof query.next === "string" ? query.next : "";
  const next = (allowedNext as readonly string[]).includes(nextValue) ? nextValue : "";

  const { store, customer } = await getStoreAndCustomer(slug);
  if (!store) {
    notFound();
  }
  if (customer) {
    redirect(`/loja/${slug}${next ? `/${next}` : ""}`);
  }

  return (
    <StoreShell slug={slug} storeName={store.name} title="Entrar ou criar conta">
      <CustomerAuth slug={slug} next={next} checkout={next === "checkout"} />
    </StoreShell>
  );
}
