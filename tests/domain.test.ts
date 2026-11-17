import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { pool, db } from "@/lib/db";
import { diningTables, establishmentMembers } from "@/lib/db/schema";
import { createCategory, createProduct, updateProduct } from "@/modules/catalog/service";
import { addCashMovement } from "@/modules/cash/service";
import {
  authenticateCustomer,
  createAddress,
  createCustomerSession,
  deleteCustomerSession,
  findCustomerBySession,
  registerCustomer,
} from "@/modules/customers/service";
import { getDeliverySettings, updateDeliverySettings } from "@/modules/delivery/service";
import {
  advanceOrder,
  cancelOrder,
  closeOrder,
  createCatalogOrder,
  createDeliveryOrder,
  dispatchOrder,
  createWaiterOrder,
  getOrder,
  listCustomerOrders,
  removeOrderItem,
  upsertOrderItem,
} from "@/modules/orders/service";
import { getReport } from "@/modules/reports/service";
import { createTable } from "@/modules/tables/service";
import {
  addMember,
  getMembers,
  registerEstablishment,
  removeMember,
  setEstablishmentOpen,
  setUserDisabled,
  transferOwnership,
} from "@/modules/tenancy/service";
import type { Actor } from "@/modules/tenancy/service";
import { AppError } from "@/server/errors";
import { zonedStart } from "@/server/time";

import { removeTenant } from "./cleanup";

const tenants: { establishmentId: string; userIds: string[] }[] = [];

afterAll(async () => {
  for (const tenant of tenants) {
    await removeTenant(tenant.establishmentId, tenant.userIds);
  }
  await pool.end();
});

describe("estabelecimento e pedidos", () => {
  it("cria o estabelecimento com um proprietário e isola os dados", async () => {
    const first = await openStore("norte");
    const second = await openStore("sul");
    const owner = actor(first, "owner");
    const other = actor(second, "owner");

    const members = await getMembers(owner);
    expect(members.filter((member) => member.role === "owner" && !member.deletedAt)).toHaveLength(1);

    const category = await createCategory(owner, "Lanches");
    const product = await createProduct(owner, {
      categoryId: category.id,
      name: "X-burger",
      price: "12,50",
    });
    expect(product.price).toBe("12.50");

    await expect(createProduct(other, {
      categoryId: category.id,
      name: "Invasão",
      price: "1.00",
    })).rejects.toMatchObject({ code: "not_found" });

    const table = await createTable(owner, "Mesa 1");
    const order = await createWaiterOrder(owner, {
      tableId: table.id,
      items: [{ productId: product.id, quantity: 2 }],
    });
    expect(order.channel).toBe("waiter");
    expect(order.totalAmount).toBe("25.00");

    await expect(getOrder(other.establishmentId, order.id)).rejects.toBeInstanceOf(AppError);
    await expect(createWaiterOrder(other, {
      tableId: table.id,
      items: [{ productId: product.id, quantity: 1 }],
    })).rejects.toMatchObject({ code: "not_found" });
  });

  it("valida papéis, preços, status, fechamento e relatórios", async () => {
    const store = await openStore("centro");
    const owner = actor(store, "owner");
    const waiterMember = await addMember(owner, {
      name: "Garçom",
      email: uniqueEmail("garcom"),
      password: "senha-segura-1",
      role: "waiter",
    });
    const kitchenMember = await addMember(owner, {
      name: "Cozinha",
      email: uniqueEmail("cozinha"),
      password: "senha-segura-1",
      role: "kitchen",
    });
    const cashierMember = await addMember(owner, {
      name: "Caixa",
      email: uniqueEmail("caixa"),
      password: "senha-segura-1",
      role: "cashier",
    });
    remember(store.establishment.id, waiterMember.userId, kitchenMember.userId, cashierMember.userId);

    const waiter = actor(store, "waiter", waiterMember.userId);
    const kitchen = actor(store, "kitchen", kitchenMember.userId);
    const cashier = actor(store, "cashier", cashierMember.userId);
    const category = await createCategory(owner, "Bebidas");
    const product = await createProduct(owner, {
      categoryId: category.id,
      name: "Suco",
      price: "8.00",
    });
    const table = await createTable(owner, "Balcão");

    await expect(closeOrder(waiter, randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    await expect(advanceOrder(waiter, randomUUID())).rejects.toMatchObject({ code: "forbidden" });

    const waiterOrder = await createWaiterOrder(waiter, {
      tableId: table.id,
      items: [{ productId: product.id, quantity: 1 }],
    });
    const saved = await getOrder(store.establishment.id, waiterOrder.id);
    expect(saved.items[0]?.unitPrice).toBe("8.00");
    expect(saved.items[0]?.productName).toBe("Suco");

    await updateProduct(owner, product.id, { price: "10.00" });
    const changed = await upsertOrderItem(waiter, waiterOrder.id, {
      productId: product.id,
      quantity: 3,
    });
    expect(changed.totalAmount).toBe("30.00");
    const repriced = await getOrder(store.establishment.id, waiterOrder.id);
    expect(repriced.items[0]?.unitPrice).toBe("10.00");

    await advanceOrder(kitchen, waiterOrder.id);
    await expect(upsertOrderItem(waiter, waiterOrder.id, {
      productId: product.id,
      quantity: 1,
    })).rejects.toMatchObject({ code: "final_order" });
    await expect(removeOrderItem(waiter, waiterOrder.id, repriced.items[0].id)).rejects.toMatchObject({
      code: "final_order",
    });

    const ready = await advanceOrder(kitchen, waiterOrder.id);
    expect(ready.status).toBe("ready");
    await expect(advanceOrder(kitchen, waiterOrder.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(db.delete(diningTables).where(eq(diningTables.id, table.id))).rejects.toThrow();

    const closed = await closeOrder(cashier, waiterOrder.id);
    expect(closed.totalAmount).toBe("30.00");
    await expect(closeOrder(cashier, waiterOrder.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(cancelOrder(cashier, waiterOrder.id)).rejects.toMatchObject({ code: "final_order" });

    const catalog = await createCatalogOrder(store.establishment.slug, {
      customerName: "Cliente",
      items: [{ productId: product.id, quantity: 1 }],
    });
    const publicOrder = await getOrder(store.establishment.id, catalog.id);
    expect(publicOrder.channel).toBe("catalog");
    expect(publicOrder.tableId).toBeNull();
    expect(publicOrder.items[0]?.unitPrice).toBe("10.00");
    expect(catalog.totalAmount).toBe("10.00");

    await advanceOrder(kitchen, catalog.id);
    await advanceOrder(kitchen, catalog.id);
    const [firstClose, secondClose] = await Promise.allSettled([
      closeOrder(cashier, catalog.id),
      closeOrder(owner, catalog.id),
    ]);
    const fulfilled = [firstClose, secondClose].filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    await addCashMovement(cashier, { type: "out", amount: "4.00", description: "Troco" });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const report = await getReport(owner, today, today);
    expect(report.revenue).toBe("40.00");
    expect(report.orderCount).toBe(2);
    expect(report.productQuantity).toBe(4);
    expect(report.inflow).toBe("40.00");
    expect(report.outflow).toBe("4.00");
    expect(report.balance).toBe("36.00");
    expect(report.topProducts[0]?.productName).toBe("Suco");

    const empty = await getReport(owner, "2000-01-01", "2000-01-01");
    expect(empty.orderCount).toBe(0);
    expect(zonedStart("2026-01-15", "America/Sao_Paulo").toISOString()).toBe("2026-01-15T03:00:00.000Z");

    await removeMember(owner, waiterMember.id);
    const history = await getMembers(owner);
    expect(history.find((member) => member.id === waiterMember.id)?.deletedAt).toBeTruthy();
    expect((await getOrder(store.establishment.id, waiterOrder.id)).id).toBe(waiterOrder.id);
  });

  it("configura o delivery e segue o fluxo com saída para entrega", async () => {
    const store = await openStore("entrega");
    const owner = actor(store, "owner");

    expect(await getDeliverySettings(store.establishment.id)).toMatchObject({ enabled: false });
    await expect(
      updateDeliverySettings(actor(store, "waiter"), { enabled: true, fee: "5", paymentMethods: ["pix"] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      updateDeliverySettings(owner, { enabled: true, fee: "5", paymentMethods: [] }),
    ).rejects.toMatchObject({ code: "invalid_payment_methods" });
    await expect(
      updateDeliverySettings(owner, { enabled: true, fee: "-1", paymentMethods: ["pix"] }),
    ).rejects.toMatchObject({ code: "invalid_fee" });

    const saved = await updateDeliverySettings(owner, {
      enabled: true,
      fee: "7,50",
      paymentMethods: ["pix", "cash", "bitcoin"],
    });
    expect(saved).toEqual({ enabled: true, fee: "7.50", paymentMethods: ["pix", "cash"] });

    const category = await createCategory(owner, "Espetos");
    const product = await createProduct(owner, { categoryId: category.id, name: "Picanha", price: "20" });
    const customer = await registerCustomer(store.establishment.id, {
      name: "Cliente Delivery",
      email: uniqueEmail("cliente"),
      phone: "(11) 91234-5678",
      password: "senha-cliente-1",
    });
    expect(customer.phone).toBe("11912345678");
    const address = await createAddress(customer, {
      street: "Rua das Flores",
      number: "10",
      neighborhood: "Centro",
      city: "São Paulo",
      reference: "Portão azul",
    });
    const items = [{ productId: product.id, quantity: 2 }];

    // Loja fechada recusa; pagamento não aceito recusa; troco menor que o total recusa.
    await setEstablishmentOpen(owner, false);
    await expect(
      createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "pix", items }),
    ).rejects.toMatchObject({ code: "store_closed" });
    await setEstablishmentOpen(owner, true);
    await expect(
      createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "credit_card", items }),
    ).rejects.toMatchObject({ code: "invalid_payment_method" });
    await expect(
      createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "cash", changeFor: "10", items }),
    ).rejects.toMatchObject({ code: "invalid_change" });

    // Endereço de outro cliente não pode ser usado.
    const intruder = await registerCustomer(store.establishment.id, {
      name: "Outro",
      email: uniqueEmail("outro"),
      phone: "11999998888",
      password: "senha-cliente-2",
    });
    await expect(
      createDeliveryOrder(intruder, { addressId: address.id, paymentMethod: "pix", items }),
    ).rejects.toMatchObject({ code: "not_found" });

    const placed = await createDeliveryOrder(customer, {
      addressId: address.id,
      paymentMethod: "cash",
      changeFor: "100",
      notes: "Sem cebola",
      items,
    });
    // 2 x R$ 20,00 + taxa de R$ 7,50
    expect(placed.totalAmount).toBe("47.50");
    const order = await getOrder(store.establishment.id, placed.id);
    expect(order).toMatchObject({
      channel: "delivery",
      status: "pending",
      customerName: "Cliente Delivery",
      customerPhone: "11912345678",
      deliveryFee: "7.50",
      paymentMethod: "cash",
      changeFor: "100.00",
    });
    expect(order.deliveryAddress).toContain("Rua das Flores, 10");
    expect((await listCustomerOrders(customer)).map((item) => item.id)).toEqual([placed.id]);
    expect(await listCustomerOrders(intruder)).toEqual([]);

    // Limite de pedidos aguardando a loja por cliente.
    await createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "pix", items });
    await createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "pix", items });
    await expect(
      createDeliveryOrder(customer, { addressId: address.id, paymentMethod: "pix", items }),
    ).rejects.toMatchObject({ code: "too_many_pending" });

    await advanceOrder(owner, order.id);
    await expect(dispatchOrder(owner, order.id)).rejects.toMatchObject({ code: "invalid_transition" });
    await advanceOrder(owner, order.id);
    await expect(closeOrder(owner, order.id)).rejects.toMatchObject({ code: "invalid_transition" });
    expect((await dispatchOrder(owner, order.id)).status).toBe("out_for_delivery");
    expect((await closeOrder(owner, order.id)).status).toBe("closed");
    expect((await getOrder(store.establishment.id, order.id)).totalAmount).toBe("47.50");

    const table = await createTable(owner, "Mesa 9");
    const local = await createWaiterOrder(owner, { tableId: table.id, items: [{ productId: product.id, quantity: 1 }] });
    await advanceOrder(owner, local.id);
    await advanceOrder(owner, local.id);
    await expect(dispatchOrder(owner, local.id)).rejects.toMatchObject({ code: "invalid_transition" });
    expect((await closeOrder(owner, local.id)).status).toBe("closed");
  });

  it("autentica clientes por loja com sessão própria", async () => {
    const first = await openStore("cliente-a");
    const second = await openStore("cliente-b");
    const email = uniqueEmail("comprador");
    const customer = await registerCustomer(first.establishment.id, {
      name: "Comprador",
      email,
      phone: "11912345678",
      password: "senha-cliente-1",
    });

    await expect(
      registerCustomer(first.establishment.id, { name: "Dup", email: email.toUpperCase(), phone: "11912345678", password: "outra-senha-1" }),
    ).rejects.toMatchObject({ code: "email_taken" });
    // O mesmo e-mail pode ter conta em outra loja.
    await registerCustomer(second.establishment.id, { name: "Outro", email, phone: "11912345678", password: "senha-b-12345" });

    expect(await authenticateCustomer(first.establishment.id, email, "errada")).toBeNull();
    expect((await authenticateCustomer(first.establishment.id, email.toUpperCase(), "senha-cliente-1"))?.id).toBe(customer.id);

    const { token } = await createCustomerSession(customer.id);
    expect((await findCustomerBySession(first.establishment.id, token))?.id).toBe(customer.id);
    // Sessão de uma loja não vale em outra.
    expect(await findCustomerBySession(second.establishment.id, token)).toBeNull();
    await deleteCustomerSession(token);
    expect(await findCustomerBySession(first.establishment.id, token)).toBeNull();
  });

  it("transfere a propriedade uma vez sob concorrência e protege o último proprietário", async () => {
    const store = await openStore("oeste");
    const owner = actor(store, "owner");
    const first = await addMember(owner, {
      name: "Admin Um",
      email: uniqueEmail("admin-um"),
      password: "senha-segura-1",
      role: "admin",
    });
    const second = await addMember(owner, {
      name: "Admin Dois",
      email: uniqueEmail("admin-dois"),
      password: "senha-segura-1",
      role: "admin",
    });
    remember(store.establishment.id, first.userId, second.userId);

    await expect(removeMember(owner, store.member.id)).rejects.toMatchObject({ code: "owner_required" });
    await expect(setUserDisabled(store.user.id, true)).rejects.toMatchObject({ code: "owner_active" });

    const [left, right] = await Promise.allSettled([
      transferOwnership(owner, first.id),
      transferOwnership(owner, second.id),
    ]);
    expect([left, right].filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const rows = await db
      .select()
      .from(establishmentMembers)
      .where(eq(establishmentMembers.establishmentId, store.establishment.id));
    expect(rows.filter((row) => row.role === "owner" && !row.deletedAt)).toHaveLength(1);

    const winner = rows.find((row) => row.role === "owner");
    const former = actor(store, "admin");
    await expect(transferOwnership(former, second.id)).rejects.toMatchObject({ code: "forbidden" });
    expect(winner?.userId).not.toBe(store.user.id);
  });
});

async function openStore(label: string) {
  const suffix = randomUUID().slice(0, 8);
  const result = await registerEstablishment({
    userName: `Dono ${label}`,
    email: uniqueEmail(label),
    password: "senha-segura-1",
    establishmentName: `Loja ${label} ${suffix}`,
  });
  tenants.push({ establishmentId: result.establishment.id, userIds: [result.user.id] });
  return result;
}

function actor(
  store: { user: { id: string }; establishment: { id: string } },
  role: Actor["role"],
  userId = store.user.id,
): Actor {
  return { userId, establishmentId: store.establishment.id, role };
}

function remember(establishmentId: string, ...userIds: string[]) {
  const tenant = tenants.find((item) => item.establishmentId === establishmentId);
  for (const userId of userIds) {
    if (tenant && !tenant.userIds.includes(userId)) {
      tenant.userIds.push(userId);
    }
  }
}

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}
