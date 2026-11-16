import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-margin-mobile py-16">
      <section className="w-full max-w-lg rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-xl text-center">
        <p className="text-label-micro font-semibold tracking-wider text-primary uppercase">Manager My Store</p>
        <h1 className="mt-2 text-display-lg-mobile font-bold tracking-tight text-on-surface md:text-display-lg">
          Gestão do salão, da cozinha e do caixa
        </h1>
        <p className="mt-3 text-body-default text-on-surface-variant">
          Cadastre o estabelecimento, monte o cardápio e acompanhe os pedidos em um só lugar.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/entrar"
            className="inline-flex h-8 items-center rounded bg-primary px-3 text-body-medium font-medium text-on-primary"
          >
            Entrar
          </Link>
          <Link
            href="/cadastrar"
            className="inline-flex h-8 items-center rounded border border-outline-variant/50 px-3 text-body-medium text-on-surface"
          >
            Cadastrar
          </Link>
        </div>
      </section>
    </main>
  );
}
