import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { customerAddresses, customerSessions, customers } from "@/lib/db/schema";
import { AppError } from "@/server/errors";
import {
  assertLoginAllowed,
  clearLoginFailures,
  customerScope,
  recordLoginFailure,
} from "@/server/login-throttle";
import { hashPassword, verifyPassword } from "@/server/password";

export const CUSTOMER_SESSION_DAYS = 30;

export type Customer = {
  id: string;
  establishmentId: string;
  name: string;
  email: string;
  phone: string;
};

export type AddressInput = {
  label?: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  postalCode?: string;
  reference?: string;
};

const customerColumns = {
  id: customers.id,
  establishmentId: customers.establishmentId,
  name: customers.name,
  email: customers.email,
  phone: customers.phone,
};

// Hash fixo usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos.
let dummyHash: Promise<string> | null = null;

export async function registerCustomer(
  establishmentId: string,
  input: { name: string; email: string; phone: string; password: string },
): Promise<Customer> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.establishmentId, establishmentId), sql`lower(${customers.email}) = ${email}`))
    .limit(1);

  if (existing) {
    throw new AppError("email_taken", "Já existe uma conta com este e-mail. Entre com sua senha.");
  }

  try {
    const [customer] = await db
      .insert(customers)
      .values({
        establishmentId,
        name: input.name.trim(),
        email,
        phone: normalizePhone(input.phone),
        passwordHash: await hashPassword(input.password),
      })
      .returning(customerColumns);
    return customer;
  } catch (error) {
    if (String(error).includes("customers_establishment_email_uidx")) {
      throw new AppError("email_taken", "Já existe uma conta com este e-mail. Entre com sua senha.");
    }
    throw error;
  }
}

/** Confere e-mail e senha do cliente; lança `rate_limited` depois de muitas falhas seguidas. */
export async function authenticateCustomer(
  establishmentId: string,
  emailInput: string,
  password: string,
  ip: string | null = null,
): Promise<Customer | null> {
  const email = emailInput.trim().toLowerCase();
  const scope = customerScope(establishmentId, email, ip);
  await assertLoginAllowed(scope);
  const customer = await checkCustomerPassword(establishmentId, email, password);
  if (customer) {
    await clearLoginFailures(scope);
  } else {
    await recordLoginFailure(scope);
  }
  return customer;
}

async function checkCustomerPassword(establishmentId: string, email: string, password: string) {
  const [row] = await db
    .select({ ...customerColumns, passwordHash: customers.passwordHash })
    .from(customers)
    .where(
      and(
        eq(customers.establishmentId, establishmentId),
        sql`lower(${customers.email}) = ${email}`,
        isNull(customers.disabledAt),
      ),
    )
    .limit(1);

  if (!row) {
    dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(password, await dummyHash);
    return null;
  }

  if (!(await verifyPassword(password, row.passwordHash))) {
    return null;
  }

  return {
    id: row.id,
    establishmentId: row.establishmentId,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}

/** Cria uma sessão e devolve o token em claro (só ele vai para o cookie; o banco guarda o hash). */
export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(customerSessions).values({ tokenHash: hashToken(token), customerId, expiresAt });
  return { token, expiresAt };
}

export async function deleteCustomerSession(token: string) {
  await db.delete(customerSessions).where(eq(customerSessions.tokenHash, hashToken(token)));
}

export async function findCustomerBySession(establishmentId: string, token: string): Promise<Customer | null> {
  const [row] = await db
    .select(customerColumns)
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(
      and(
        eq(customerSessions.tokenHash, hashToken(token)),
        gt(customerSessions.expiresAt, new Date()),
        eq(customers.establishmentId, establishmentId),
        isNull(customers.disabledAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listAddresses(customer: Customer) {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customer.id))
    .orderBy(customerAddresses.createdAt);
}

export async function getAddress(customer: Customer, addressId: string) {
  const [address] = await db
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customer.id)))
    .limit(1);

  if (!address) {
    throw new AppError("not_found", "Endereço não encontrado.");
  }

  return address;
}

const MAX_ADDRESSES = 10;

export async function createAddress(customer: Customer, input: AddressInput) {
  const existing = await listAddresses(customer);
  if (existing.length >= MAX_ADDRESSES) {
    throw new AppError("too_many_addresses", "Você pode salvar até 10 endereços. Remova um para adicionar outro.");
  }

  const [address] = await db
    .insert(customerAddresses)
    .values({
      customerId: customer.id,
      label: blankToNull(input.label),
      street: input.street.trim(),
      number: input.number.trim(),
      complement: blankToNull(input.complement),
      neighborhood: input.neighborhood.trim(),
      city: input.city.trim(),
      postalCode: blankToNull(input.postalCode),
      reference: blankToNull(input.reference),
    })
    .returning();

  return address;
}

export async function deleteAddress(customer: Customer, addressId: string) {
  const removed = await db
    .delete(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customer.id)))
    .returning({ id: customerAddresses.id });

  if (removed.length === 0) {
    throw new AppError("not_found", "Endereço não encontrado.");
  }
}

/** Texto do endereço copiado para o pedido (editar o endereço depois não altera pedidos antigos). */
export function formatAddress(address: {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  postalCode: string | null;
  reference: string | null;
}) {
  const firstLine = [`${address.street}, ${address.number}`, address.complement].filter(Boolean).join(" - ");
  const secondLine = [address.neighborhood, address.city, address.postalCode].filter(Boolean).join(" - ");
  return [firstLine, secondLine, address.reference ? `Ref.: ${address.reference}` : null].filter(Boolean).join("\n");
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
