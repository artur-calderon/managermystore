import { randomUUID } from "node:crypto";

import { inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/lib/db";
import { authAttempts, users } from "@/lib/db/schema";
import { authorizeCredentials } from "@/lib/credentials";
import { authenticateCustomer, registerCustomer } from "@/modules/customers/service";
import { addMember, isUserActive, registerEstablishment } from "@/modules/tenancy/service";
import { canAccessPage, homePathFor } from "@/server/authorization";

import { removeTenant } from "./cleanup";

const tenants: { establishmentId: string; userIds: string[] }[] = [];
const ip = `test-${randomUUID()}`;

afterAll(async () => {
  await db.delete(authAttempts).where(like(authAttempts.key, `%${ip}%`));
  for (const tenant of tenants) {
    await removeTenant(tenant.establishmentId, tenant.userIds);
  }
  await pool.end();
});

describe("segurança", () => {
  it("bloqueia telas do painel pela permissão, mesmo digitando o endereço", () => {
    // Cozinha e caixa não abrem telas de gestão.
    for (const path of ["/painel/caixa", "/painel/relatorios", "/painel/funcionarios", "/painel/delivery", "/painel/categorias"]) {
      expect(canAccessPage("kitchen", path)).toBe(false);
    }
    expect(canAccessPage("cashier", "/painel/produtos")).toBe(false);
    expect(canAccessPage("cashier", "/painel/mesas/cadastro")).toBe(false);
    expect(canAccessPage("cashier", "/painel/caixa")).toBe(true);
    expect(canAccessPage("kitchen", "/painel/cozinha")).toBe(true);
    expect(canAccessPage("kitchen", "/painel/produtos")).toBe(true);
    // Garçom continua restrito ao modo garçom e à lista de pedidos.
    expect(canAccessPage("waiter", "/garcom")).toBe(true);
    expect(canAccessPage("waiter", "/painel/pedidos")).toBe(true);
    expect(canAccessPage("waiter", "/painel")).toBe(false);
    // Gestão acessa tudo; a tela inicial de cada papel é sempre permitida.
    for (const path of ["/painel/caixa", "/painel/funcionarios", "/painel/delivery", "/garcom"]) {
      expect(canAccessPage("admin", path)).toBe(true);
    }
    for (const role of ["owner", "admin", "waiter", "kitchen", "cashier"] as const) {
      expect(canAccessPage(role, homePathFor(role))).toBe(true);
    }
  });

  it("limita tentativas de login e derruba usuário desativado", async () => {
    const email = `seguranca-${randomUUID()}@example.com`;
    const store = await registerEstablishment({
      userName: "Dono Segurança",
      email,
      password: "senha-segura-1",
      establishmentName: `Loja segurança ${randomUUID().slice(0, 8)}`,
    });
    tenants.push({ establishmentId: store.establishment.id, userIds: [store.user.id] });

    expect(await authorizeCredentials(email, "senha-segura-1", ip)).toMatchObject({ id: store.user.id });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await authorizeCredentials(email, "errada", ip)).toBeNull();
    }
    // Sexta tentativa bloqueada, mesmo com a senha certa.
    await expect(authorizeCredentials(email, "senha-segura-1", ip)).rejects.toMatchObject({ code: "rate_limited" });

    // Desativar a conta corta o acesso já na próxima requisição.
    await db.delete(authAttempts).where(like(authAttempts.key, `%${email}%`));
    const staff = await addMember(
      { userId: store.user.id, establishmentId: store.establishment.id, role: "owner" },
      { name: "Caixa", email: `caixa-${randomUUID()}@example.com`, password: "senha-segura-1", role: "cashier" },
    );
    tenants[tenants.length - 1].userIds.push(staff.userId);
    expect(await isUserActive(staff.userId)).toBe(true);
    await db.update(users).set({ disabledAt: new Date() }).where(inArray(users.id, [staff.userId]));
    expect(await isUserActive(staff.userId)).toBe(false);

    // Cliente do cardápio: mesmo limite, por loja.
    const customerEmail = `cliente-${randomUUID()}@example.com`;
    await registerCustomer(store.establishment.id, {
      name: "Cliente",
      email: customerEmail,
      phone: "11912345678",
      password: "senha-cliente-1",
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await authenticateCustomer(store.establishment.id, customerEmail, "errada", ip)).toBeNull();
    }
    await expect(
      authenticateCustomer(store.establishment.id, customerEmail, "senha-cliente-1", ip),
    ).rejects.toMatchObject({ code: "rate_limited" });
    await db.delete(authAttempts).where(like(authAttempts.key, `%${customerEmail}%`));
  });
});
