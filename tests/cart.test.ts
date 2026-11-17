import { describe, expect, it } from "vitest";

import { resolveCart, type Cart, type CartProduct } from "@/components/storefront/use-cart";
import { evaluateSelection, selectionKey, type ProductConfig } from "@/lib/product-config";

const config: ProductConfig = {
  variants: [
    { id: "simples", name: "Simples", price: "12.50", isAvailable: true },
    { id: "completo", name: "Completo", price: "20.00", isAvailable: true },
  ],
  groups: [
    {
      id: "acomp",
      variantId: "completo",
      name: "Acompanhamentos",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "arroz", name: "Arroz", price: "0.00", isDefault: true, isAvailable: true },
        { id: "farofa", name: "Farofa", price: "0.00", isDefault: true, isAvailable: true },
      ],
    },
    {
      id: "extras",
      variantId: null,
      name: "Adicionais",
      minSelect: 0,
      maxSelect: 1,
      options: [{ id: "queijo", name: "Queijo coalho", price: "4.00", isDefault: false, isAvailable: true }],
    },
  ],
};

const espeto: CartProduct = { id: "espeto", name: "Espeto", price: 12.5, stockQuantity: 5, config };
const suco: CartProduct = {
  id: "suco",
  name: "Suco",
  price: 8,
  stockQuantity: 5,
  config: { variants: [], groups: [] },
};
const products = new Map([espeto, suco].map((product) => [product.id, product]));

describe("cálculo de opções e carrinho (telas)", () => {
  it("calcula preço e resumo como o servidor", () => {
    const result = evaluateSelection(12.5, config, "completo", ["arroz", "queijo"]);
    expect(result).toMatchObject({ unitCents: 2400, variantName: "Completo", summary: "sem Farofa, Queijo coalho" });
    expect(result.problem).toBeNull();
    expect(evaluateSelection(12.5, config, null, []).problem).toBe("Escolha uma opção.");
    expect(evaluateSelection(12.5, config, "completo", ["arroz", "farofa", "queijo"]).problem).toBeNull();
  });

  it("lê o carrinho antigo e o novo, somando a mesma escolha numa linha", () => {
    const key = selectionKey("espeto", "completo", ["queijo", "arroz"]);
    expect(key).toBe(selectionKey("espeto", "completo", ["arroz", "queijo"]));
    const cart: Cart = {
      suco: { productId: "suco", variantId: null, quantity: 2 },
      [key]: { productId: "espeto", variantId: "completo", optionIds: ["arroz", "queijo"], quantity: 1, note: "Bem passado" },
      // Produto que agora tem variações, salvo antes sem escolha: precisa ser refeito.
      espeto: { productId: "espeto", variantId: null, quantity: 1 },
      sumiu: { productId: "sumiu", variantId: null, quantity: 1 },
    };
    const { lines, missing } = resolveCart(cart, products);
    expect(missing).toBe(1);
    expect(lines.find((line) => line.key === "suco")).toMatchObject({ unitPrice: 8, problem: null });
    expect(lines.find((line) => line.key === key)).toMatchObject({
      unitPrice: 24,
      variantName: "Completo",
      summary: "sem Farofa, Queijo coalho",
      problem: null,
    });
    expect(lines.find((line) => line.key === "espeto")?.problem).toBe("Escolha uma opção.");
  });
});
