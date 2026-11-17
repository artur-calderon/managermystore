import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { DeliverySettingsForm } from "@/components/delivery/delivery-settings-form";
import { getDeliverySettings } from "@/modules/delivery/service";
import { can } from "@/server/authorization";
import { requirePageActor } from "@/server/context";

export default function DeliveryPage() {
  return (
    <Suspense fallback={<p className="text-body-compact text-outline">Carregando…</p>}>
      <Delivery />
    </Suspense>
  );
}

async function Delivery() {
  await connection();
  const actor = await requirePageActor("/painel/delivery");
  if (!can(actor.role, "delivery.manage")) {
    redirect("/painel");
  }

  const settings = await getDeliverySettings(actor.establishmentId);

  return <DeliverySettingsForm settings={settings} storeHref={`/loja/${actor.slug}`} />;
}
