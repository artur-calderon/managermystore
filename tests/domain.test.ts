import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { pool, db } from "@/lib/db";
import {
  diningTables,
  establishmentMembers,
  productOptionGroups,
  productOptions,
  products,
  productVariants,
} from "@/lib/db/schema";
import { describeItemOptions, itemDetail, itemTitle } from "@/lib/order-item-options";
import { saveProductConfig } from "@/modules/catalog/variations-admin";
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
      stockQuantity: 10,
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
      stockQuantity: 10,
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
    const product = await createProduct(owner, { categoryId: category.id, name: "Picanha", price: "20", stockQuantity: 20 });
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

    // Delivery com variação, opções e observação por item (como o checkout envia).
    const espeto = await createProduct(owner, { categoryId: category.id, name: "Espeto", price: "12", stockQuantity: 4 });
    const config = await saveProductConfig(owner, espeto.id, {
      variants: [{ key: "c", name: "Completo", price: "20", isAvailable: true }],
      groups: [
        {
          variantKey: "c",
          name: "Acompanhamentos",
          minSelect: 0,
          maxSelect: 2,
          options: [
            { name: "Arroz", price: "", isDefault: true, isAvailable: true },
            { name: "Farofa", price: "", isDefault: true, isAvailable: true },
          ],
        },
      ],
    });
    const [arroz] = config.groups[0].options;
    const withOptions = await createDeliveryOrder(customer, {
      addressId: address.id,
      paymentMethod: "pix",
      items: [
        { productId: espeto.id, quantity: 2, variantId: config.variants[0].id, optionIds: [arroz.id], notes: "Bem passado" },
      ],
    });
    expect(withOptions.totalAmount).toBe("47.50");
    const [deliveredItem] = (await getOrder(store.establishment.id, withOptions.id)).items;
    expect(itemTitle(deliveredItem)).toBe("Espeto Completo");
    expect(itemDetail(deliveredItem)).toBe("sem Farofa · Obs.: Bem passado");
  });

  it("aplica variações, opções e baixa o estoque", async () => {
    const store = await openStore("variacoes");
    const owner = actor(store, "owner");
    const establishmentId = store.establishment.id;
    const category = await createCategory(owner, "Espetos");
    const espeto = await createProduct(owner, {
      categoryId: category.id,
      name: "Espetinho",
      price: "12",
      stockQuantity: 5,
    });
    const table = await createTable(owner, "Mesa 1");

    const [simples, completo] = await db
      .insert(productVariants)
      .values([
        { establishmentId, productId: espeto.id, name: "Simples", price: "12.00", sortOrder: 0 },
        { establishmentId, productId: espeto.id, name: "Completo", price: "20.00", sortOrder: 1 },
      ])
      .returning();
    const [sides, extras] = await db
      .insert(productOptionGroups)
      .values([
        { establishmentId, productId: espeto.id, variantId: completo.id, name: "Acompanhamentos", minSelect: 0, maxSelect: 4 },
        { establishmentId, productId: espeto.id, name: "Adicionais", minSelect: 0, maxSelect: 2, sortOrder: 1 },
      ])
      .returning();
    const [arroz, vinagrete, , , queijo, bacon] = await db
      .insert(productOptions)
      .values([
        { establishmentId, groupId: sides.id, name: "arroz", isDefault: true, sortOrder: 0 },
        { establishmentId, groupId: sides.id, name: "vinagrete", isDefault: true, sortOrder: 1 },
        { establishmentId, groupId: sides.id, name: "farofa", isDefault: true, sortOrder: 2 },
        { establishmentId, groupId: sides.id, name: "mandioca", isDefault: true, sortOrder: 3 },
        { establishmentId, groupId: extras.id, name: "Queijo coalho", price: "4.00", sortOrder: 0 },
        { establishmentId, groupId: extras.id, name: "Bacon", price: "3.00", isAvailable: false, sortOrder: 1 },
      ])
      .returning();

    const stock = async () =>
      (await db.select({ stock: products.stockQuantity }).from(products).where(eq(products.id, espeto.id)))[0]?.stock;

    // Produto com variações exige a escolha; opções de outro grupo/variação e indisponíveis são recusadas.
    await expect(
      createWaiterOrder(owner, { tableId: table.id, items: [{ productId: espeto.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "variant_required" });
    await expect(
      createWaiterOrder(owner, {
        tableId: table.id,
        items: [{ productId: espeto.id, quantity: 1, variantId: simples.id, optionIds: [arroz.id] }],
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
    await expect(
      createWaiterOrder(owner, {
        tableId: table.id,
        items: [{ productId: espeto.id, quantity: 1, variantId: completo.id, optionIds: [bacon.id] }],
      }),
    ).rejects.toMatchObject({ code: "option_unavailable" });
    expect(await stock()).toBe(5);

    // 2x Completo só com arroz e vinagrete + queijo; 1x Completo padrão em outra linha.
    const order = await createWaiterOrder(owner, {
      tableId: table.id,
      items: [
        { productId: espeto.id, quantity: 2, variantId: completo.id, optionIds: [arroz.id, vinagrete.id, queijo.id] },
        { productId: espeto.id, quantity: 1, variantId: completo.id },
      ],
    });
    // 2 x (20 + 4) + 1 x 20 — retirar acompanhamento não baixa o preço.
    expect(order.totalAmount).toBe("68.00");
    expect(await stock()).toBe(2);

    const saved = await getOrder(establishmentId, order.id);
    expect(saved.items).toHaveLength(2);
    const custom = saved.items.find((item) => item.quantity === 2);
    expect(custom).toMatchObject({ unitPrice: "24.00", variantName: "Completo", productName: "Espetinho" });
    expect(describeItemOptions(custom?.options ?? [])).toBe("sem farofa, sem mandioca, Queijo coalho");
    const standard = saved.items.find((item) => item.quantity === 1);
    expect(describeItemOptions(standard?.options ?? [])).toBe("");

    // O mesmo item padrão soma na mesma linha; acima do estoque é recusado sem baixar nada.
    await upsertOrderItem(owner, order.id, { productId: espeto.id, quantity: 2, variantId: completo.id });
    expect(await stock()).toBe(1);
    await expect(
      upsertOrderItem(owner, order.id, { productId: espeto.id, quantity: 3, variantId: simples.id }),
    ).rejects.toMatchObject({ code: "out_of_stock" });
    expect(await stock()).toBe(1);

    // Retirar item e cancelar devolvem ao estoque.
    await removeOrderItem(owner, order.id, standard!.id);
    expect(await stock()).toBe(3);
    await cancelOrder(owner, order.id);
    expect(await stock()).toBe(5);

    // Pizza: sabores com preço próprio, mínimo 1 e máximo 2.
    const pizza = await createProduct(owner, { categoryId: category.id, name: "Pizza", price: "40", stockQuantity: 3 });
    const [flavors] = await db
      .insert(productOptionGroups)
      .values({ establishmentId, productId: pizza.id, name: "Sabores", minSelect: 1, maxSelect: 2 })
      .returning();
    const [calabresa, portuguesa, camarao] = await db
      .insert(productOptions)
      .values([
        { establishmentId, groupId: flavors.id, name: "Calabresa", sortOrder: 0 },
        { establishmentId, groupId: flavors.id, name: "Portuguesa", price: "5.00", sortOrder: 1 },
        { establishmentId, groupId: flavors.id, name: "Camarão", price: "15.00", sortOrder: 2 },
      ])
      .returning();
    await expect(
      createWaiterOrder(owner, { tableId: table.id, items: [{ productId: pizza.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "invalid_options" });
    await expect(
      createWaiterOrder(owner, {
        tableId: table.id,
        items: [{ productId: pizza.id, quantity: 1, optionIds: [calabresa.id, portuguesa.id, camarao.id] }],
      }),
    ).rejects.toMatchObject({ code: "invalid_options" });
    const half = await createWaiterOrder(owner, {
      tableId: table.id,
      items: [{ productId: pizza.id, quantity: 1, optionIds: [calabresa.id, portuguesa.id] }],
    });
    expect(half.totalAmount).toBe("45.00");

    // Observação fica no item; a mesma escolha com outra observação vira outra linha.
    const noted = await createWaiterOrder(owner, {
      tableId: table.id,
      items: [
        { productId: pizza.id, quantity: 1, optionIds: [calabresa.id], notes: "Sem cebola" },
        { productId: pizza.id, quantity: 1, optionIds: [calabresa.id] },
      ],
    });
    const notedItems = (await getOrder(establishmentId, noted.id)).items;
    expect(notedItems).toHaveLength(2);
    expect(notedItems.map((item) => item.notes).sort()).toEqual(["Sem cebola", null].sort());
    await cancelOrder(owner, noted.id);

    // Esgotado.
    await expect(
      createWaiterOrder(owner, {
        tableId: table.id,
        items: [{ productId: pizza.id, quantity: 3, optionIds: [calabresa.id] }],
      }),
    ).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("salva variações e opções pelo painel preservando os ids", async () => {
    const store = await openStore("cadastro-opcoes");
    const owner = actor(store, "owner");
    const other = await openStore("cadastro-outra");
    const category = await createCategory(owner, "Lanches");
    const burger = await createProduct(owner, { categoryId: category.id, name: "Hambúrguer", price: "30", stockQuantity: 5 });

    await expect(
      saveProductConfig(actor(store, "waiter"), burger.id, { variants: [], groups: [] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      saveProductConfig(actor(other, "owner"), burger.id, { variants: [], groups: [] }),
    ).rejects.toMatchObject({ code: "not_found" });

    const first = await saveProductConfig(owner, burger.id, {
      variants: [
        { key: "a", name: "Simples", price: "25,00", isAvailable: true },
        { key: "b", name: "Duplo", price: "32,50", isAvailable: true },
      ],
      groups: [
        {
          variantKey: null,
          name: "Ingredientes",
          minSelect: 0,
          maxSelect: 3,
          options: [
            { name: "Alface", price: "9", isDefault: true, isAvailable: true },
            { name: "Tomate", price: "", isDefault: true, isAvailable: true },
            { name: "Cebola", price: "", isDefault: true, isAvailable: true },
          ],
        },
        {
          variantKey: "b",
          name: "Adicionais",
          minSelect: 0,
          maxSelect: 2,
          options: [
            { name: "Bacon", price: "4,00", isDefault: false, isAvailable: true },
            { name: "Ovo", price: "2", isDefault: false, isAvailable: true },
          ],
        },
      ],
    });
    expect(first.variants.map((variant) => variant.name)).toEqual(["Simples", "Duplo"]);
    expect(first.groups[1]).toMatchObject({ variantId: first.variants[1].id, name: "Adicionais" });
    // Incluso não tem preço; o produto passa a custar "a partir de" R$ 25.
    expect(first.groups[0].options[0].price).toBe("0.00");
    const [saved] = await db.select({ price: products.price }).from(products).where(eq(products.id, burger.id));
    expect(saved.price).toBe("25.00");

    // Editar mantém ids, remove o que saiu e insere o que entrou.
    const [simples, duplo] = first.variants;
    const [ingredients, extras] = first.groups;
    const second = await saveProductConfig(owner, burger.id, {
      variants: [{ key: duplo.id, id: duplo.id, name: "Duplo", price: "34", isAvailable: true }],
      groups: [
        {
          id: extras.id,
          variantKey: null,
          name: "Adicionais",
          minSelect: 0,
          maxSelect: 2,
          options: [
            { id: extras.options[0].id, name: "Bacon", price: "5", isDefault: false, isAvailable: false },
            { name: "Cheddar", price: "3", isDefault: false, isAvailable: true },
          ],
        },
      ],
    });
    expect(second.variants).toEqual([{ id: duplo.id, name: "Duplo", price: "34.00", isAvailable: true }]);
    expect(second.groups).toHaveLength(1);
    expect(second.groups[0].id).toBe(extras.id);
    expect(second.groups[0].variantId).toBeNull();
    expect(second.groups[0].options.map((option) => [option.name, option.price, option.isAvailable])).toEqual([
      ["Bacon", "5.00", false],
      ["Cheddar", "3.00", true],
    ]);
    expect(second.groups[0].options[0].id).toBe(extras.options[0].id);
    expect(
      await db.select().from(productOptionGroups).where(eq(productOptionGroups.id, ingredients.id)),
    ).toHaveLength(0);
    expect(await db.select().from(productVariants).where(eq(productVariants.id, simples.id))).toHaveLength(0);

    // Regras de cadastro.
    const invalid = (groups: Parameters<typeof saveProductConfig>[2]["groups"]) =>
      saveProductConfig(owner, burger.id, { variants: [], groups });
    await expect(
      invalid([{ variantKey: null, name: "Vazio", minSelect: 0, maxSelect: 1, options: [] }]),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await expect(
      invalid([
        {
          variantKey: null,
          name: "Sabores",
          minSelect: 1,
          maxSelect: 3,
          options: [{ name: "Calabresa", price: "", isDefault: false, isAvailable: true }],
        },
      ]),
    ).rejects.toMatchObject({ code: "invalid_config" });
    await expect(
      saveProductConfig(owner, burger.id, {
        variants: [{ key: "x", name: "Grande", price: "", isAvailable: true }],
        groups: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_price" });
    // Id de opção de outro grupo/produto é recusado.
    await expect(
      invalid([
        {
          id: extras.id,
          variantKey: null,
          name: "Adicionais",
          minSelect: 0,
          maxSelect: 1,
          options: [{ id: ingredients.options[0].id, name: "X", price: "", isDefault: false, isAvailable: true }],
        },
      ]),
    ).rejects.toMatchObject({ code: "invalid_config" });

    // Sem variações e sem grupos: produto volta a ser simples.
    const cleared = await saveProductConfig(owner, burger.id, { variants: [], groups: [] });
    expect(cleared).toEqual({ variants: [], groups: [] });
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
