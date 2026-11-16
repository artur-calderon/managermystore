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
});

export const cashSchema = z.object({
  type: z.enum(["in", "out"]),
  amount: z.string().trim().min(1, "Informe o valor."),
  description: z.string().trim().optional(),
});

export const catalogOrderSchema = z.object({
  customerName: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Inclua ao menos um produto."),
});
