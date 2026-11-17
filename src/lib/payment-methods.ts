/** Formas de pagamento informadas pelo cliente no delivery (não há integração de pagamento). */
export const paymentMethods = ["cash", "pix", "credit_card", "debit_card", "meal_voucher"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  meal_voucher: "Vale-refeição",
};

export const paymentMethodIcons: Record<PaymentMethod, string> = {
  cash: "payments",
  pix: "qr_code_2",
  credit_card: "credit_card",
  debit_card: "credit_card",
  meal_voucher: "restaurant",
};

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (paymentMethods as readonly string[]).includes(value);
}
