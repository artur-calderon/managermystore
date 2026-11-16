import { Suspense } from "react";
import { connection } from "next/server";

import { fieldClassName } from "@/components/shared/form";
import { getReport } from "@/modules/reports/service";
import { requireActor } from "@/server/context";

export default function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const actor = await requireActor();
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: actor.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const from = params.from || today;
  const to = params.to || today;
  const report = await getReport(actor, from, to);

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">Relatórios</h1>
      <form className="flex flex-wrap gap-2">
        <input className={fieldClassName} type="date" name="from" defaultValue={from} />
        <input className={fieldClassName} type="date" name="to" defaultValue={to} />
        <button type="submit">Consultar</button>
      </form>
      <p>Faturamento: {report.revenue}</p>
      <p>Pedidos fechados: {report.orderCount}</p>
      <p>Produtos vendidos: {report.productQuantity}</p>
      <p>Entradas: {report.inflow}</p>
      <p>Saídas: {report.outflow}</p>
      <p>Saldo: {report.balance}</p>
      <h2 className="font-semibold">Mais pedidos</h2>
      <ul>
        {report.topProducts.map((product) => (
          <li key={`${product.productId}-${product.productName}`}>
            {product.productName}: {product.quantity}
          </li>
        ))}
      </ul>
    </section>
  );
}
