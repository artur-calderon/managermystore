import Link from "next/link";

import { Icon } from "@/components/ui/icon";

/** Cabeçalho das páginas internas da loja (entrar, checkout, pedidos, conta). */
export function StoreShell({
  slug,
  storeName,
  title,
  backHref,
  customerName,
  children,
}: {
  slug: string;
  storeName: string;
  title: string;
  backHref?: string;
  customerName?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="sticky top-0 z-30 bg-surface-container-lowest/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-margin-mobile md:px-margin">
          <div className="flex min-w-0 items-center gap-1">
            <Link
              href={backHref ?? `/loja/${slug}`}
              aria-label="Voltar"
              className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
            >
              <Icon name="arrow_back" className="text-[22px]" />
            </Link>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-label-micro tracking-wider text-on-surface-variant uppercase">{storeName}</span>
              <span className="truncate text-headline-sm text-on-surface">{title}</span>
            </div>
          </div>
          {customerName ? (
            <nav className="flex shrink-0 items-center gap-1">
              <Link
                href={`/loja/${slug}/pedidos`}
                aria-label="Meus pedidos"
                className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <Icon name="receipt_long" className="text-[22px]" />
              </Link>
              <Link
                href={`/loja/${slug}/conta`}
                aria-label="Minha conta"
                className="flex size-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
              >
                <Icon name="account_circle" className="text-[22px]" />
              </Link>
            </nav>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-margin-mobile pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-margin">
        {children}
      </main>
    </div>
  );
}
