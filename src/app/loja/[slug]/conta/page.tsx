import { Suspense } from "react";

import { CustomerAddresses } from "@/components/storefront/customer-addresses";
import { StoreShell } from "@/components/storefront/store-shell";
import { Icon } from "@/components/ui/icon";
import { logoutCustomerAction } from "@/modules/customers/actions";
import { formatAddress, listAddresses } from "@/modules/customers/service";
import { requireCustomer } from "@/server/customer-session";

export default function AccountPage(props: PageProps<"/loja/[slug]/conta">) {
  return (
    <Suspense fallback={<p className="p-6 text-body-compact text-outline">Carregando…</p>}>
      <Account {...props} />
    </Suspense>
  );
}

async function Account({ params }: PageProps<"/loja/[slug]/conta">) {
  const { slug } = await params;
  const { store, customer } = await requireCustomer(slug, "conta");
  const addresses = await listAddresses(customer);

  return (
    <StoreShell slug={slug} storeName={store.name} title="Minha conta" customerName={customer.name}>
      <div className="flex flex-col gap-space-lg">
        <section className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <Icon name="person" className="text-[24px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-medium font-semibold text-on-surface">{customer.name}</p>
            <p className="truncate text-label-regular text-on-surface-variant">{customer.email}</p>
            <p className="text-label-regular text-on-surface-variant">{formatPhone(customer.phone)}</p>
          </div>
          <form action={logoutCustomerAction}>
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              className="flex h-10 items-center gap-1 rounded-lg bg-surface-container px-3 text-body-compact text-on-surface hover:bg-surface-container-high"
            >
              <Icon name="logout" />
              Sair
            </button>
          </form>
        </section>

        <CustomerAddresses
          slug={slug}
          addresses={addresses.map((address) => ({ id: address.id, label: address.label, text: formatAddress(address) }))}
        />
      </div>
    </StoreShell>
  );
}

function formatPhone(phone: string) {
  const match = phone.match(/^(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}
