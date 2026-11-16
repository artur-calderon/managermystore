export function toCents(value: string): number {
  const negative = value.trim().startsWith("-");
  const normalized = negative ? value.trim().slice(1) : value.trim();
  const [whole = "0", fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));

  if (!Number.isSafeInteger(cents)) {
    throw new Error("Valor monetário inválido.");
  }

  return negative ? -cents : cents;
}

export function formatMoney(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
