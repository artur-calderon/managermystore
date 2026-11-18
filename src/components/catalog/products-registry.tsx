"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { FormModal } from "@/components/shared/form-modal";
import { Icon } from "@/components/ui/icon";
import { ProductOptionsEditor, type EditorConfig } from "@/components/catalog/product-options-editor";
import {
  createCategoryAction,
  createProductAction,
  setProductAvailabilityAction,
  updateProductAction,
} from "@/modules/catalog/actions";

export type RegistryCategory = {
  id: string;
  name: string;
};

export type RegistryProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  priceLabel: string;
  costPrice: string | null;
  costPriceLabel: string | null;
  marginLabel: string | null;
  stockQuantity: number;
  isAvailable: boolean;
  categoryId: string;
  categoryName: string;
  config: EditorConfig;
};

type ModalState = { kind: "product"; productId: string | null } | { kind: "category" } | null;

function configSummary(config: EditorConfig) {
  const parts = [];
  if (config.variants.length > 0) {
    parts.push(`${config.variants.length} ${config.variants.length === 1 ? "variação" : "variações"}`);
  }
  if (config.groups.length > 0) {
    parts.push(`${config.groups.length} ${config.groups.length === 1 ? "grupo de opções" : "grupos de opções"}`);
  }
  return parts.join(" · ");
}

export function ProductsRegistry({
  products,
  categories,
  canManage,
  catalogHref,
}: {
  products: RegistryProduct[];
  categories: RegistryCategory[];
  canManage: boolean;
  catalogHref: string;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "paused">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [optionsProductId, setOptionsProductId] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftCost, setDraftCost] = useState("");

  const totalCount = products.length;
  const availableCount = products.filter((product) => product.isAvailable).length;
  const pausedCount = totalCount - availableCount;
  const editingId = modal?.kind === "product" ? modal.productId : null;
  const editing = products.find((product) => product.id === editingId) ?? null;
  const optionsProduct = products.find((product) => product.id === optionsProductId) ?? null;
  const editingHasVariants = (editing?.config.variants.length ?? 0) > 0;
  const draftMarginLabel = marginPercentLabel(draftPrice, draftCost);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter !== "all" && product.categoryId !== categoryFilter) return false;
      if (availabilityFilter === "available" && !product.isAvailable) return false;
      if (availabilityFilter === "paused" && product.isAvailable) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.categoryName.toLowerCase().includes(term) ||
        (product.description?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [availabilityFilter, categoryFilter, products, query]);

  function openProduct(product: RegistryProduct | null) {
    setDraftPrice(product?.price ?? "");
    setDraftCost(product?.costPrice ?? "");
    setModal({ kind: "product", productId: product?.id ?? null });
  }

  const closeModal = () => setModal(null);

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="text-headline-md tracking-tight text-on-surface">Produtos e Cardápio</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-label-micro text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Catálogo ativo
            </span>
          </div>
          <p className="mt-1 text-body-compact text-outline">
            Gerencie os itens do cardápio, preços e disponibilidade para salão e cardápio digital.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-lowest px-3 py-1.5 text-body-compact text-on-surface shadow-sm hover:bg-surface-container"
              onClick={() => setModal({ kind: "category" })}
            >
              <Icon name="add_circle_outline" className="text-outline" />
              Nova categoria
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-body-compact font-medium text-on-primary shadow-sm hover:bg-primary-container"
              onClick={() => openProduct(null)}
            >
              <Icon name="add" />
              Cadastrar produto
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <Summary label="Total de produtos" value={String(totalCount)} detail="cadastrados" icon="inventory_2" tone="primary" />
        <Summary
          label="Categorias ativas"
          value={String(categories.length)}
          detail="grupos operando"
          icon="category"
          tone="secondary"
        />
        <Summary
          label="Itens disponíveis"
          value={String(availableCount)}
          detail="ativos"
          badge={pausedCount > 0 ? `${pausedCount} pausados` : undefined}
          icon="check_circle"
          tone="success"
        />
      </div>

      <div className="flex flex-col items-center justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm lg:flex-row">
        <div className="flex w-full items-center gap-1 overflow-x-auto pb-1 lg:w-auto lg:pb-0">
          <CategoryTab active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>
            Todos <span className="ml-1 opacity-70">{totalCount}</span>
          </CategoryTab>
          {categories.map((category) => {
            const count = products.filter((product) => product.categoryId === category.id).length;
            return (
              <CategoryTab
                key={category.id}
                active={categoryFilter === category.id}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name} <span className="ml-1 opacity-70">{count}</span>
              </CategoryTab>
            );
          })}
        </div>
        <div className="flex w-full items-center justify-end gap-space-sm lg:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Icon name="search" className="absolute top-2 left-2.5 text-[18px] text-outline" />
            <input
              className="h-8 w-full rounded-lg bg-surface-container-low pr-3 pl-8 text-body-compact text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary"
              placeholder="Buscar produto por nome..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-surface-container-low p-0.5">
            {(
              [
                ["all", "Todos"],
                ["available", "Disponíveis"],
                ["paused", "Pausados"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded px-2.5 py-1 text-label-micro transition-colors ${
                  availabilityFilter === value
                    ? "bg-surface-container-lowest text-on-surface shadow-sm"
                    : "text-outline hover:text-on-surface"
                }`}
                onClick={() => setAvailabilityFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-low/70">
                <th className="px-3.5 py-2 text-label-micro tracking-wider text-outline uppercase">Produto</th>
                <th className="px-3 py-2 text-label-micro tracking-wider text-outline uppercase">Categoria</th>
                <th className="px-3 py-2 text-right text-label-micro tracking-wider text-outline uppercase">
                  Preço venda
                </th>
                <th className="px-3 py-2 text-right text-label-micro tracking-wider text-outline uppercase">
                  Custo / margem
                </th>
                <th className="px-3 py-2 text-right text-label-micro tracking-wider text-outline uppercase">
                  Qtd.
                </th>
                <th className="px-3 py-2 text-label-micro tracking-wider text-outline uppercase">Canais</th>
                <th className="px-3 py-2 text-center text-label-micro tracking-wider text-outline uppercase">
                  Status
                </th>
                {canManage ? (
                  <th className="px-3 py-2 text-right text-label-micro tracking-wider text-outline uppercase">
                    Ações
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low">
              {visible.length === 0 ? (
                <tr>
                  <td className="px-3.5 py-6 text-outline" colSpan={canManage ? 8 : 7}>
                    {totalCount === 0 ? "Nenhum produto cadastrado." : "Nenhum produto encontrado."}
                  </td>
                </tr>
              ) : (
                visible.map((product) => (
                  <tr
                    key={product.id}
                    className={`transition-colors hover:bg-surface-container-low/40 ${
                      product.isAvailable ? "" : "opacity-85"
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex min-w-0 flex-col">
                        <span
                          className={`truncate text-body-medium font-medium ${
                            product.isAvailable ? "text-on-surface" : "text-outline line-through"
                          }`}
                        >
                          {product.name}
                        </span>
                        {product.description ? (
                          <span className="truncate text-label-micro text-outline">{product.description}</span>
                        ) : null}
                        {configSummary(product.config) ? (
                          <span className="mt-0.5 inline-flex w-fit items-center gap-1 text-label-micro text-tertiary">
                            <Icon name="tune" className="text-[13px]" />
                            {configSummary(product.config)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-surface-container px-2 py-0.5 text-label-micro text-on-surface-variant">
                        {product.categoryName}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-metric-table font-semibold ${
                        product.isAvailable ? "text-on-surface" : "text-outline"
                      }`}
                    >
                      {product.config.variants.length > 0 ? (
                        <span className="block text-label-micro font-normal text-outline">a partir de</span>
                      ) : null}
                      {product.priceLabel}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {product.costPriceLabel ? (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-body-compact text-outline">{product.costPriceLabel}</span>
                          {product.marginLabel ? (
                            <span
                              className={`text-label-micro font-medium ${
                                product.isAvailable ? "text-emerald-700" : "text-outline"
                              }`}
                            >
                              {product.marginLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-label-micro text-outline">—</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-metric-table font-semibold ${
                        product.stockQuantity === 0 ? "text-error" : "text-on-surface"
                      }`}
                    >
                      {product.stockQuantity}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex max-w-[150px] flex-wrap items-center gap-1">
                        <span className="rounded bg-surface-container-low px-1.5 py-0.5 text-label-micro text-on-surface-variant">
                          Salão
                        </span>
                        <span className="rounded bg-surface-container-low px-1.5 py-0.5 text-label-micro text-on-surface-variant">
                          Cardápio
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {product.isAvailable ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-label-micro text-emerald-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-label-micro text-outline">
                          <span className="h-1.5 w-1.5 rounded-full bg-outline" />
                          Pausado
                        </span>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-primary"
                            title="Editar"
                            onClick={() => openProduct(product)}
                          >
                            <Icon name="edit" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-primary"
                            title="Variações e opções"
                            onClick={() => setOptionsProductId(product.id)}
                          >
                            <Icon name="tune" />
                          </button>
                          <BoundForm action={setProductAvailabilityAction} className="inline">
                            <input type="hidden" name="productId" value={product.id} />
                            <input
                              type="hidden"
                              name="isAvailable"
                              value={product.isAvailable ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={`rounded p-1 transition-colors hover:bg-surface-container ${
                                product.isAvailable
                                  ? "text-outline hover:text-error"
                                  : "text-emerald-700"
                              }`}
                              title={product.isAvailable ? "Pausar no cardápio" : "Reativar produto"}
                            >
                              <Icon name={product.isAvailable ? "pause_circle" : "play_circle"} />
                            </button>
                          </BoundForm>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between bg-surface-container-low/40 px-space-md py-space-sm text-body-compact text-outline">
          <span>
            Mostrando <strong>{visible.length}</strong> de <strong>{totalCount}</strong> produtos cadastrados
          </span>
        </div>
      </div>

      {canManage && modal?.kind === "category" ? (
        <FormModal title="Nova categoria" icon="category" onClose={closeModal}>
          <BoundForm action={createCategoryAction} onSuccess={closeModal}>
            <label className="grid gap-1 text-label-regular font-medium text-on-surface">
              <span>
                Nome da categoria <span className="text-primary">*</span>
              </span>
              <input className={fieldClassName} name="name" placeholder="ex: Espetos" autoFocus required />
            </label>
            <div className="flex items-center justify-between gap-space-sm pt-space-xs">
              <Link href="/painel/categorias" className="text-label-regular text-tertiary hover:underline">
                Gerenciar categorias
              </Link>
              <div className="flex items-center gap-space-sm">
                <button
                  type="button"
                  className="rounded-lg bg-surface-container-low px-3 py-1.5 text-body-compact text-on-surface-variant hover:bg-surface-container"
                  onClick={closeModal}
                >
                  Cancelar
                </button>
                <SubmitButton>Salvar categoria</SubmitButton>
              </div>
            </div>
          </BoundForm>
        </FormModal>
      ) : null}

      {canManage && modal?.kind === "product" && (modal.productId === null || editing) ? (
        <FormModal
          title={editing ? `Editar ${editing.name}` : "Novo produto"}
          icon={editing ? "edit" : "add_box"}
          onClose={closeModal}
          // Com o editor de opções aberto por cima, o Esc e o clique fora fecham só ele.
          dismissible={!optionsProduct}
        >
          {categories.length === 0 ? (
            <div className="flex flex-col gap-space-sm">
              <p className="text-body-compact text-outline">Crie uma categoria antes de cadastrar produtos.</p>
              <button
                type="button"
                className="w-fit rounded-lg bg-primary px-3 py-1.5 text-body-compact font-medium text-on-primary hover:bg-primary-container"
                onClick={() => setModal({ kind: "category" })}
              >
                Criar categoria
              </button>
            </div>
          ) : (
            <BoundForm
              key={editing?.id ?? "new"}
              action={editing ? updateProductAction : createProductAction}
              onSuccess={closeModal}
            >
              {editing ? <input type="hidden" name="productId" value={editing.id} /> : null}
              <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                <span>
                  Nome do produto <span className="text-primary">*</span>
                </span>
                <input
                  className={fieldClassName}
                  name="name"
                  placeholder="ex: Espeto de Picanha Especial"
                  defaultValue={editing?.name ?? ""}
                  autoFocus
                  required
                />
              </label>

              <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                <span>
                  Categoria <span className="text-primary">*</span>
                </span>
                <select
                  className={fieldClassName}
                  name="categoryId"
                  defaultValue={editing?.categoryId ?? (categoryFilter !== "all" ? categoryFilter : categories[0]?.id)}
                  required
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-space-sm">
                <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                  <span>
                    Preço venda <span className="text-primary">*</span>
                  </span>
                  <div className="relative">
                    <span className="absolute top-2 left-2.5 text-label-micro text-outline">R$</span>
                    <input
                      className={`${fieldClassName} pl-8 font-medium read-only:opacity-70`}
                      name="price"
                      placeholder="0,00"
                      value={draftPrice}
                      onChange={(event) => setDraftPrice(event.target.value)}
                      readOnly={editingHasVariants}
                      title={editingHasVariants ? "Definido pelas variações (menor preço)" : undefined}
                      required
                    />
                  </div>
                </label>
                <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                  <span className="flex items-center justify-between gap-2">
                    <span>Custo</span>
                    {draftMarginLabel ? (
                      <span className="text-label-micro font-semibold text-emerald-700">{draftMarginLabel}</span>
                    ) : null}
                  </span>
                  <div className="relative">
                    <span className="absolute top-2 left-2.5 text-label-micro text-outline">R$</span>
                    <input
                      className={`${fieldClassName} pl-8`}
                      name="costPrice"
                      placeholder="0,00"
                      value={draftCost}
                      onChange={(event) => setDraftCost(event.target.value)}
                    />
                  </div>
                </label>
              </div>

              <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                <span>
                  Quantidade <span className="text-primary">*</span>
                </span>
                <input
                  className={fieldClassName}
                  name="stockQuantity"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="0"
                  defaultValue={editing?.stockQuantity ?? ""}
                  required
                />
              </label>

              {editing ? (
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/40 p-space-sm text-left hover:border-primary"
                  onClick={() => setOptionsProductId(editing.id)}
                >
                  <span>
                    <span className="block text-body-compact font-medium text-on-surface">Variações e opções</span>
                    <span className="mt-0.5 block text-label-micro text-on-surface-variant">
                      {configSummary(editing.config) || "Tamanhos, acompanhamentos, sabores, adicionais…"}
                    </span>
                  </span>
                  <Icon name="chevron_right" className="text-outline" />
                </button>
              ) : null}
              {editingHasVariants ? (
                <p className="-mt-1 text-label-micro text-outline">
                  Com variações, o preço de venda é o menor preço entre elas (&quot;a partir de&quot;).
                </p>
              ) : null}

              <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                Descrição do cardápio
                <textarea
                  className="min-h-16 w-full resize-none rounded-lg border border-outline-variant/40 bg-surface-container-low p-2.5 text-body-compact text-on-surface outline-none placeholder:text-outline focus:border-primary"
                  name="description"
                  rows={2}
                  placeholder="Ingredientes, ponto da carne ou detalhes para o cliente..."
                  defaultValue={editing?.description ?? ""}
                />
              </label>

              {editing ? (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-container-low p-space-sm">
                  <span>
                    <span className="block text-body-compact font-medium text-on-surface">Disponível no cardápio</span>
                    <span className="mt-0.5 block text-label-micro text-on-surface-variant">
                      Desmarque para pausar sem remover o cadastro
                    </span>
                  </span>
                  <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
                    <input
                      type="checkbox"
                      name="isAvailable"
                      defaultChecked={editing.isAvailable}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-10 rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
                    <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </span>
                </label>
              ) : null}

              <div className="mt-1 flex items-center justify-end gap-space-sm pt-space-xs">
                <button
                  type="button"
                  className="rounded-lg bg-surface-container-low px-3 py-1.5 text-body-compact text-on-surface-variant hover:bg-surface-container"
                  onClick={closeModal}
                >
                  Cancelar
                </button>
                <SubmitButton>{editing ? "Atualizar produto" : "Salvar produto"}</SubmitButton>
              </div>
            </BoundForm>
          )}
        </FormModal>
      ) : null}

      {optionsProduct ? (
        <ProductOptionsEditor
          key={optionsProduct.id}
          product={{ id: optionsProduct.id, name: optionsProduct.name, config: optionsProduct.config }}
          others={products
            .filter((product) => product.id !== optionsProduct.id)
            .map((product) => ({ id: product.id, name: product.name, config: product.config }))}
          onClose={() => setOptionsProductId(null)}
        />
      ) : null}

      <div className="flex items-start gap-space-sm rounded-xl bg-surface-container-low/70 p-space-md shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest text-primary">
          <Icon name="sync" />
        </div>
        <div>
          <span className="text-body-medium font-medium text-on-surface">Cardápio sincronizado</span>
          <p className="mt-0.5 leading-relaxed text-body-compact text-outline">
            Alterações de preço ou pausa refletem no salão, na cozinha e no cardápio digital{" "}
            <Link href={catalogHref} className="text-tertiary hover:underline" target="_blank">
              {catalogHref}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
  badge,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  badge?: string;
  icon: string;
  tone: "primary" | "secondary" | "success";
}) {
  const toneClass =
    tone === "secondary" ? "text-secondary" : tone === "success" ? "text-emerald-700" : "text-primary";

  return (
    <article className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
      <div className="space-y-0.5">
        <span className="text-label-regular tracking-wider text-outline uppercase">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-metric-headline font-semibold text-on-surface">
            {value} <span className="text-body-compact font-normal text-outline">{detail}</span>
          </span>
          {badge ? (
            <span className="rounded bg-surface-container px-1.5 py-0.5 text-label-micro text-outline">{badge}</span>
          ) : null}
        </div>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low ${toneClass}`}>
        <Icon name={icon} className="text-[22px]" />
      </div>
    </article>
  );
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-body-compact whitespace-nowrap transition-colors ${
        active
          ? "bg-primary-fixed font-medium text-on-primary-fixed"
          : "text-outline hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function marginPercentLabel(priceValue: string, costValue: string) {
  const price = parseMoneyInput(priceValue);
  const cost = parseMoneyInput(costValue);
  if (price === null || cost === null || price <= 0) return null;
  const margin = Math.round(((price - cost) / price) * 100);
  return `~${margin}% mrg`;
}
