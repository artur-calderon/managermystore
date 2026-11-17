"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  defaultOptionIds,
  evaluateSelection,
  groupsFor,
  type ProductConfig,
  type ProductOptionGroup,
} from "@/lib/product-config";

export type SheetSelection = {
  variantId: string | null;
  optionIds: string[];
  quantity: number;
  note: string;
};

type SheetProduct = { id: string; name: string; description?: string | null; price: number; config: ProductConfig };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Folha (mobile) / janela (tablet+) para escolher variação e opções de um produto.
 * Abre com os itens inclusos já marcados; o botão só libera quando os mínimos são atendidos.
 */
export function OptionsSheet({
  product,
  available,
  confirmLabel = "Adicionar",
  onClose,
  onAdd,
}: {
  product: SheetProduct;
  /** Unidades que ainda podem ser adicionadas (estoque menos o que já está na comanda). */
  available: number;
  confirmLabel?: string;
  onClose: () => void;
  onAdd: (selection: SheetSelection) => void;
}) {
  const availableVariants = product.config.variants.filter((variant) => variant.isAvailable);
  const initialVariant = availableVariants.length === 1 ? availableVariants[0].id : null;
  const [variantId, setVariantId] = useState<string | null>(initialVariant);
  const [selected, setSelected] = useState<string[]>(() => defaultOptionIds(product.config, initialVariant));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const groups = groupsFor(product.config, variantId);
  const needsVariant = product.config.variants.length > 0 && !variantId;
  const evaluation = evaluateSelection(product.price, product.config, variantId, selected);
  const total = (evaluation.unitCents / 100) * quantity;
  const blocked = Boolean(evaluation.problem) || quantity > available || available <= 0;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function chooseVariant(nextId: string) {
    // Mantém o que foi escolhido nos grupos que valem para as duas variações; os grupos novos vêm no padrão.
    const keepGroups = new Set(groupsFor(product.config, nextId).map((group) => group.id));
    const previousGroups = new Set(groupsFor(product.config, variantId).map((group) => group.id));
    const kept = product.config.groups
      .filter((group) => keepGroups.has(group.id) && previousGroups.has(group.id))
      .flatMap((group) => group.options.filter((option) => selected.includes(option.id)).map((option) => option.id));
    const fresh = product.config.groups
      .filter((group) => keepGroups.has(group.id) && !previousGroups.has(group.id))
      .flatMap((group) => group.options.filter((option) => option.isDefault && option.isAvailable).map((option) => option.id));
    setVariantId(nextId);
    setSelected([...kept, ...fresh]);
  }

  function toggle(group: ProductOptionGroup, optionId: string) {
    setSelected((current) => {
      const inGroup = new Set(group.options.map((option) => option.id));
      const isOn = current.includes(optionId);
      if (group.maxSelect === 1) {
        // Escolha única: troca a opção; tocar de novo desmarca se o grupo for opcional.
        const others = current.filter((id) => !inGroup.has(id));
        if (isOn) return group.minSelect === 0 ? others : current;
        return [...others, optionId];
      }
      if (isOn) return current.filter((id) => id !== optionId);
      const count = current.filter((id) => inGroup.has(id)).length;
      return count >= group.maxSelect ? current : [...current, optionId];
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-sheet-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-xl md:max-w-lg md:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-surface-container px-4 pt-3 pb-2.5">
          <div className="min-w-0">
            <h2 id="options-sheet-title" className="text-headline-sm font-semibold text-on-surface">
              {product.name}
            </h2>
            {product.description ? (
              <p className="line-clamp-2 text-label-regular text-on-surface-variant">{product.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3">
          {product.config.variants.length > 0 ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 flex w-full items-center justify-between">
                <span className="text-body-medium font-semibold text-on-surface">Escolha a opção</span>
                <Requirement ok={!needsVariant} label="Obrigatório" />
              </legend>
              {product.config.variants.map((variant) => {
                const active = variant.id === variantId;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={!variant.isAvailable}
                    onClick={() => chooseVariant(variant.id)}
                    aria-pressed={active}
                    className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-primary bg-primary-fixed/40"
                        : "border-surface-container-high bg-surface-container-lowest hover:border-primary/50"
                    } disabled:opacity-50`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        name={active ? "radio_button_checked" : "radio_button_unchecked"}
                        className={active ? "text-primary" : "text-outline"}
                      />
                      <span className="text-body-medium text-on-surface">{variant.name}</span>
                      {!variant.isAvailable ? (
                        <span className="text-label-micro text-error">Em falta</span>
                      ) : null}
                    </span>
                    <span className="text-metric-table font-semibold text-on-surface">
                      {money.format(Number(variant.price))}
                    </span>
                  </button>
                );
              })}
            </fieldset>
          ) : null}

          {needsVariant ? null : (
            groups.map((group) => {
              const count = group.options.filter((option) => selected.includes(option.id)).length;
              const allIncluded = group.options.every((option) => option.isDefault);
              return (
                <fieldset key={group.id} className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 flex w-full items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-body-medium font-semibold text-on-surface">{group.name}</span>
                      <span className="block text-label-micro text-on-surface-variant">
                        {allIncluded
                          ? "Desmarque o que o cliente não quer"
                          : group.maxSelect === 1
                            ? "Escolha 1"
                            : `Escolha até ${group.maxSelect}${group.minSelect > 0 ? ` (mínimo ${group.minSelect})` : ""}`}
                      </span>
                    </span>
                    {group.minSelect > 0 ? (
                      <Requirement ok={count >= group.minSelect} label="Obrigatório" />
                    ) : (
                      <span className="shrink-0 text-label-micro text-on-surface-variant">
                        {count}/{group.maxSelect}
                      </span>
                    )}
                  </legend>
                  {group.options.map((option) => {
                    const isOn = selected.includes(option.id);
                    const full = !isOn && group.maxSelect > 1 && count >= group.maxSelect;
                    const price = Number(option.price);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!option.isAvailable || full}
                        onClick={() => toggle(group, option.id)}
                        aria-pressed={isOn}
                        className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
                          isOn
                            ? "border-primary/60 bg-primary-fixed/30"
                            : "border-surface-container-high bg-surface-container-lowest"
                        } disabled:opacity-45`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon
                            name={
                              group.maxSelect === 1
                                ? isOn
                                  ? "radio_button_checked"
                                  : "radio_button_unchecked"
                                : isOn
                                  ? "check_box"
                                  : "check_box_outline_blank"
                            }
                            className={isOn ? "text-primary" : "text-outline"}
                          />
                          <span
                            className={`truncate text-body-medium ${
                              option.isDefault && !isOn ? "text-on-surface-variant line-through" : "text-on-surface"
                            }`}
                          >
                            {option.name}
                          </span>
                          {!option.isAvailable ? <span className="text-label-micro text-error">Em falta</span> : null}
                        </span>
                        <span className="shrink-0 text-label-regular text-on-surface-variant">
                          {option.isDefault ? "incluso" : price > 0 ? `+ ${money.format(price)}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </fieldset>
              );
            })
          )}

          <label className="flex flex-col gap-1">
            <span className="text-body-medium font-semibold text-on-surface">Observação</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="Ex.: bem passado, sem sal..."
              className="h-10 rounded-lg bg-surface-container-low px-3 text-body-default text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:bg-surface-container"
            />
          </label>
        </div>

        <footer className="flex flex-col gap-2 border-t border-surface-container px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {evaluation.problem && !needsVariant ? (
            <p className="text-label-regular text-error">{evaluation.problem}</p>
          ) : available <= 0 ? (
            <p className="text-label-regular text-error">Sem estoque para mais unidades.</p>
          ) : quantity > available ? (
            <p className="text-label-regular text-error">
              Só {available === 1 ? "resta 1 unidade" : `restam ${available} unidades`}.
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 items-center rounded-lg bg-surface-container-low p-1">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1}
                aria-label="Diminuir quantidade"
                className="flex size-9 items-center justify-center rounded-md bg-surface-container-lowest disabled:opacity-40"
              >
                <Icon name="remove" className="text-[16px]" />
              </button>
              <span className="w-8 text-center text-metric-table font-semibold" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((value) => value + 1)}
                disabled={quantity >= available}
                aria-label="Aumentar quantidade"
                className="flex size-9 items-center justify-center rounded-md bg-surface-container-lowest disabled:opacity-40"
              >
                <Icon name="add" className="text-[16px]" />
              </button>
            </div>
            <button
              type="button"
              disabled={blocked}
              onClick={() => onAdd({ variantId, optionIds: selected, quantity, note })}
              className="flex h-11 flex-1 items-center justify-between gap-2 rounded-xl bg-primary px-4 text-body-medium font-semibold text-on-primary shadow-md transition active:scale-[0.99] disabled:opacity-50"
            >
              <span>{needsVariant ? "Escolha uma opção" : confirmLabel}</span>
              <span>{money.format(total)}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-label-micro ${
        ok ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      {ok ? <Icon name="check" className="text-[12px]" /> : null}
      {label}
    </span>
  );
}
