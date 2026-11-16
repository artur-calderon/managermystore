export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function rethrowDb(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }

  const message = errorText(error);

  if (message.includes("establishment_requires_one_owner")) {
    throw new AppError(
      "owner_required",
      "O estabelecimento precisa de exatamente um proprietário ativo.",
    );
  }

  if (message.includes("cannot_disable_active_owner")) {
    throw new AppError("owner_active", "O proprietário ativo não pode ser desativado.");
  }

  if (message.includes("establishment_members_one_owner")) {
    throw new AppError(
      "owner_conflict",
      "Já existe um proprietário ativo para este estabelecimento.",
    );
  }

  if (message.includes("users_email_lower_uidx")) {
    throw new AppError("email_taken", "Este e-mail já está cadastrado.");
  }

  if (message.includes("establishments_slug_unique")) {
    throw new AppError("slug_taken", "Este endereço público já está em uso.");
  }

  if (message.includes("cash_movements_one_sale")) {
    throw new AppError("duplicate_cash", "Este pedido já possui uma entrada financeira.");
  }

  throw error;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
      continue;
    }

    parts.push(String(current));
    break;
  }

  return parts.join(" ");
}
