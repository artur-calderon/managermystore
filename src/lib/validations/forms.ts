import { z } from "zod";

export const registerSchema = z.object({
  userName: z.string().trim().min(2, "Informe seu nome."),
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  establishmentName: z.string().trim().min(3, "Informe o nome do estabelecimento."),
});

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

export const memberSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").optional().or(z.literal("")),
  role: z.enum(["admin", "waiter", "kitchen", "cashier"]),
});

export const namedSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
});

export const productSchema = z.object({
  categoryId: z.uuid("Escolha uma categoria."),
  name: z.string().trim().min(1, "Informe o nome."),
  description: z.string().trim().optional(),
  price: z.string().trim().min(1, "Informe o preço."),
  costPrice: z.string().trim().optional(),
  stockQuantity: z.coerce
    .number({ error: "Informe a quantidade." })
    .int("A quantidade deve ser um número inteiro.")
    .min(0, "A quantidade não pode ser negativa."),
});

/** Variações e grupos de opções de um produto (regras de negócio ficam no serviço). */
export const productConfigSchema = z.object({
  variants: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        id: z.uuid().optional(),
        name: z.string().max(60, "Nome de variação muito longo."),
        price: z.string().max(12),
        isAvailable: z.boolean(),
      }),
    )
    .max(20),
  groups: z
    .array(
      z.object({
        id: z.uuid().optional(),
        variantKey: z.string().min(1).max(64).nullable(),
        name: z.string().max(60, "Nome de grupo muito longo."),
        minSelect: z.number().int().min(0).max(50),
        maxSelect: z.number().int().min(1).max(50),
        options: z
          .array(
            z.object({
              id: z.uuid().optional(),
              name: z.string().max(60, "Nome de opção muito longo."),
              price: z.string().max(12),
              isDefault: z.boolean(),
              isAvailable: z.boolean(),
            }),
          )
          .max(50),
      }),
    )
    .max(20),
});

export const cashSchema = z.object({
  type: z.enum(["in", "out"]),
  amount: z.string().trim().min(1, "Informe o valor."),
  description: z.string().trim().optional(),
});

/** Variação e opções escolhidas para um item (validadas de novo no servidor contra o produto). */
const itemSelection = {
  variantId: z.uuid().nullish(),
  optionIds: z.array(z.uuid()).max(50).optional(),
};

export const waiterOrderSchema = z.object({
  tableId: z.uuid("Escolha uma mesa."),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        productName: z.string().trim().optional(),
        quantity: z.number().int().positive().max(999),
        ...itemSelection,
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "Adicione ao menos um produto."),
});

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length >= 10 && value.length <= 11, "Informe um telefone com DDD.");

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  email: z.email("Informe um e-mail válido.").trim().max(160),
  phone,
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(128),
});

export const customerLoginSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim(),
  password: z.string().min(1, "Informe sua senha.").max(128),
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  street: z.string().trim().min(2, "Informe a rua.").max(120),
  number: z.string().trim().min(1, "Informe o número.").max(20),
  complement: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().min(2, "Informe o bairro.").max(80),
  city: z.string().trim().min(2, "Informe a cidade.").max(80),
  postalCode: z.string().trim().max(9).optional(),
  reference: z.string().trim().max(120).optional(),
});

export const deliveryOrderSchema = z.object({
  addressId: z.uuid("Escolha um endereço de entrega."),
  paymentMethod: z.enum(["cash", "pix", "credit_card", "debit_card", "meal_voucher"], {
    error: "Escolha a forma de pagamento.",
  }),
  changeFor: z.string().trim().max(12).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
        ...itemSelection,
      }),
    )
    .min(1, "Seu carrinho está vazio.")
    .max(50, "Pedido com itens demais."),
});
