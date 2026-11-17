import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { deliverySettings } from "@/lib/db/schema";
import { isPaymentMethod, type PaymentMethod } from "@/lib/payment-methods";
import type { Actor } from "@/modules/tenancy/service";
import { assertCan } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { fromCents, toCents } from "@/server/money";

export type DeliverySettings = {
  enabled: boolean;
  fee: string;
  paymentMethods: PaymentMethod[];
};

const defaults: DeliverySettings = {
  enabled: false,
  fee: "0.00",
  paymentMethods: ["cash", "pix", "credit_card", "debit_card"],
};

/** Configuração de delivery da loja. Lojas sem configuração salva ficam com o delivery desligado. */
export async function getDeliverySettings(establishmentId: string): Promise<DeliverySettings> {
  const [row] = await db
    .select()
    .from(deliverySettings)
    .where(eq(deliverySettings.establishmentId, establishmentId))
    .limit(1);

  if (!row) {
    return defaults;
  }

  return {
    enabled: row.enabled,
    fee: row.fee,
    paymentMethods: row.paymentMethods.filter(isPaymentMethod),
  };
}

export async function updateDeliverySettings(
  actor: Actor,
  input: { enabled: boolean; fee: string; paymentMethods: string[] },
): Promise<DeliverySettings> {
  assertCan(actor.role, "delivery.manage");

  let cents: number;
  try {
    cents = toCents(input.fee.trim().replace(",", ".") || "0");
  } catch {
    cents = Number.NaN;
  }
  if (!Number.isFinite(cents) || cents < 0) {
    throw new AppError("invalid_fee", "Informe uma taxa de entrega válida.");
  }

  const methods = [...new Set(input.paymentMethods)].filter(isPaymentMethod);
  if (input.enabled && methods.length === 0) {
    throw new AppError("invalid_payment_methods", "Escolha ao menos uma forma de pagamento.");
  }

  const values = { enabled: input.enabled, fee: fromCents(cents), paymentMethods: methods };
  const [row] = await db
    .insert(deliverySettings)
    .values({ establishmentId: actor.establishmentId, ...values })
    .onConflictDoUpdate({ target: deliverySettings.establishmentId, set: values })
    .returning();

  return { enabled: row.enabled, fee: row.fee, paymentMethods: row.paymentMethods.filter(isPaymentMethod) };
}
