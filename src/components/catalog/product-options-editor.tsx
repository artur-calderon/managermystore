"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { saveProductConfigAction } from "@/modules/catalog/actions";

/** Configuração salva, como chega do servidor (preços com ponto: "12.50"). */
export type EditorConfig = {
  variants: { id: string; name: string; price: string; isAvailable: boolean }[];
  groups: {
    id: string;
    variantId: string | null;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id: string; name: string; price: string; isDefault: boolean; isAvailable: boolean }[];
  }[];
};

export type EditorProduct = { id: string; name: string; config: EditorConfig };

type DraftVariant = { key: string; id?: string; name: string; price: string; isAvailable: boolean };
type DraftOption = { uid: string; id?: string; name: string; price: string; isDefault: boolean; isAvailable: boolean };
type DraftGroup = {
  uid: string;
  id?: string;
  variantKey: string | null;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: DraftOption[];
};
type Draft = { variants: DraftVariant[]; groups: DraftGroup[] };

type Preset = "included" | "required" | "extras" | "flavors";

const presets: { id: Preset; label: string; hint: string; icon: string }[] = [
  { id: "included", label: "Itens inclusos", hint: "Já vêm no prato; o cliente pode tirar", icon: "playlist_remove" },
  { id: "required", label: "Escolha obrigatória", hint: "Ex.: ponto da carne", icon: "radio_button_checked" },
  { id: "extras", label: "Adicionais", hint: "Opcionais, podem ter preço", icon: "add_circle" },
  { id: "flavors", label: "Sabores", hint: "Ex.: pizza meio a meio", icon: "local_pizza" },
];

let sequence = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

const toInput = (price: string) => (Number(price) === 0 ? "" : price.replace(".", ","));

function fromConfig(config: EditorConfig, keepIds: boolean): Draft {
  const keyById = new Map<string, string>();
  const variants = config.variants.map((variant) => {
    const key = keepIds ? variant.id : uid("v");
    keyById.set(variant.id, key);
    return {
      key,
      id: keepIds ? variant.id : undefined,
      name: variant.name,
      price: variant.price.replace(".", ","),
      isAvailable: variant.isAvailable,
    };
  });
  const groups = config.groups.map((group) => ({
    uid: uid("g"),
    id: keepIds ? group.id : undefined,
    variantKey: group.variantId ? (keyById.get(group.variantId) ?? null) : null,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options.map((option) => ({
      uid: uid("o"),
      id: keepIds ? option.id : undefined,
      name: option.name,
      price: toInput(option.price),
      isDefault: option.isDefault,
      isAvailable: option.isAvailable,
    })),
  }));
  return { variants, groups };
}

/** Mantém mínimo/máximo coerentes com as opções (evita erro ao salvar). */
function fitLimits(group: DraftGroup): DraftGroup {
  const count = Math.max(1, group.options.length);
  const defaults = group.options.filter((option) => option.isDefault).length;
  const maxSelect = Math.min(Math.max(group.maxSelect, defaults, 1), count);
  const minSelect = Math.min(Math.max(group.minSelect, 0), maxSelect);
  return { ...group, minSelect, maxSelect };
}

function ruleLabel(group: DraftGroup) {
  const { minSelect: min, maxSelect: max } = group;
  const plural = (n: number) => (n === 1 ? "opção" : "opções");
  if (min === 0) return `Opcional · até ${max} ${plural(max)}`;
  if (min === max) return `Obrigatório · escolher ${min} ${plural(min)}`;
  return `Obrigatório · de ${min} a ${max} opções`;
}

const inputClass =
  "h-8 w-full rounded border border-outline-variant/40 bg-surface-container-low px-2 text-body-compact text-on-surface outline-none focus:border-primary";

export function ProductOptionsEditor({
  product,
  others,
  onClose,
}: {
  product: EditorProduct;
  others: EditorProduct[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => fromConfig(product.config, true));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copySources = useMemo(
    () => others.filter((item) => item.config.variants.length > 0 || item.config.groups.length > 0),
    [others],
  );

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

  function updateVariant(key: string, patch: Partial<DraftVariant>) {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)),
    }));
  }

  function removeVariant(key: string) {
    setDraft((current) => ({
      variants: current.variants.filter((variant) => variant.key !== key),
      // Grupos que eram só desta variação passam a valer para todas.
      groups: current.groups.map((group) => (group.variantKey === key ? { ...group, variantKey: null } : group)),
    }));
  }

  function updateGroup(groupUid: string, change: (group: DraftGroup) => DraftGroup) {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.uid === groupUid ? fitLimits(change(group)) : group)),
    }));
  }

  function addGroup(preset: Preset, variantKey: string | null) {
    const base = { uid: uid("g"), variantKey };
    const option = (name: string, isDefault = false): DraftOption => ({
      uid: uid("o"),
      name,
      price: "",
      isDefault,
      isAvailable: true,
    });
    const group: DraftGroup =
      preset === "included"
        ? { ...base, name: "Acompanhamentos", minSelect: 0, maxSelect: 1, options: [option("", true)] }
        : preset === "required"
          ? { ...base, name: "Ponto da carne", minSelect: 1, maxSelect: 1, options: [option(""), option("")] }
          : preset === "extras"
            ? { ...base, name: "Adicionais", minSelect: 0, maxSelect: 1, options: [option("")] }
            : { ...base, name: "Sabores", minSelect: 1, maxSelect: 2, options: [option(""), option("")] };
    setDraft((current) => ({ ...current, groups: [...current.groups, fitLimits(group)] }));
  }

  function addOption(group: DraftGroup) {
    // Em grupos de itens inclusos a nova opção também vem incluída, e o máximo acompanha.
    const allIncluded = group.options.length > 0 && group.options.every((option) => option.isDefault);
    updateGroup(group.uid, (current) => ({
      ...current,
      maxSelect: allIncluded ? current.options.length + 1 : current.maxSelect,
      options: [
        ...current.options,
        { uid: uid("o"), name: "", price: "", isDefault: allIncluded, isAvailable: true },
      ],
    }));
  }

  /** Troca o grupo de lugar com o vizinho da mesma seção (mesma variação). */
  function moveGroup(groupUid: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.groups.findIndex((group) => group.uid === groupUid);
      if (index < 0) return current;
      const variantKey = current.groups[index].variantKey;
      let target = index + direction;
      while (target >= 0 && target < current.groups.length && current.groups[target].variantKey !== variantKey) {
        target += direction;
      }
      if (target < 0 || target >= current.groups.length) return current;
      const groups = [...current.groups];
      [groups[index], groups[target]] = [groups[target], groups[index]];
      return { ...current, groups };
    });
  }

  const hasVariants = draft.variants.length > 0;
  const sections: { key: string | null; title: string; subtitle: string }[] = hasVariants
    ? [
        {
          key: null,
          title: "Todas as variações",
          subtitle: "Aparecem em qualquer variação escolhida",
        },
        ...draft.variants.map((variant) => {
          const name = variant.name.trim() || "(sem nome)";
          return {
            key: variant.key,
            title: `Só ${name}`,
            subtitle: `Aparecem apenas em ${name}${variant.price ? ` · R$ ${variant.price}` : ""}`,
          };
        }),
      ]
    : [{ key: null, title: "", subtitle: "" }];
  const groupCount = (variantKey: string | null) =>
    draft.groups.filter((group) => group.variantKey === variantKey).length;

  function renderGroup(group: DraftGroup, position: number, total: number) {
    return (
      <article key={group.uid} className="flex flex-col gap-2.5 rounded-xl border border-surface-container bg-surface-container-lowest p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} min-w-40 flex-1 font-medium`}
            placeholder="Nome do grupo (ex.: Acompanhamentos)"
            value={group.name}
            onChange={(event) => updateGroup(group.uid, (current) => ({ ...current, name: event.target.value }))}
            aria-label="Nome do grupo"
          />
          <div className="flex items-center">
            <IconButton
              icon="arrow_upward"
              label="Subir grupo"
              disabled={position === 0}
              onClick={() => moveGroup(group.uid, -1)}
            />
            <IconButton
              icon="arrow_downward"
              label="Descer grupo"
              disabled={position === total - 1}
              onClick={() => moveGroup(group.uid, 1)}
            />
            <RemoveButton
              label="Remover grupo"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  groups: current.groups.filter((item) => item.uid !== group.uid),
                }))
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {hasVariants ? (
            <label className="grid gap-1 text-label-regular text-on-surface-variant">
              Mover para
              <select
                className={`${inputClass} w-40`}
                value={group.variantKey ?? ""}
                onChange={(event) =>
                  updateGroup(group.uid, (current) => ({ ...current, variantKey: event.target.value || null }))
                }
              >
                <option value="">Todas as variações</option>
                {draft.variants.map((variant) => (
                  <option key={variant.key} value={variant.key}>
                    Só {variant.name || "(sem nome)"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-label-regular text-on-surface-variant">
            Mínimo
            <input
              className={`${inputClass} w-16`}
              type="number"
              min={0}
              value={group.minSelect}
              onChange={(event) =>
                updateGroup(group.uid, (current) => ({ ...current, minSelect: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label className="grid gap-1 text-label-regular text-on-surface-variant">
            Máximo
            <input
              className={`${inputClass} w-16`}
              type="number"
              min={1}
              value={group.maxSelect}
              onChange={(event) =>
                updateGroup(group.uid, (current) => ({ ...current, maxSelect: Number(event.target.value) || 1 }))
              }
            />
          </label>
          <span className="pb-1.5 text-label-regular font-medium text-tertiary">{ruleLabel(group)}</span>
        </div>

        <ul className="flex flex-col gap-1.5">
          {group.options.map((option) => (
            <li key={option.uid} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-low/60 p-1.5">
              <input
                className={`${inputClass} min-w-36 flex-1`}
                placeholder="Nome da opção"
                value={option.name}
                onChange={(event) =>
                  updateGroup(group.uid, (current) => ({
                    ...current,
                    options: current.options.map((item) =>
                      item.uid === option.uid ? { ...item, name: event.target.value } : item,
                    ),
                  }))
                }
                aria-label="Nome da opção"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-label-regular text-on-surface-variant">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={option.isDefault}
                  onChange={(event) =>
                    updateGroup(group.uid, (current) => ({
                      ...current,
                      options: current.options.map((item) =>
                        item.uid === option.uid ? { ...item, isDefault: event.target.checked } : item,
                      ),
                    }))
                  }
                />
                Incluso
              </label>
              <div className="relative w-24">
                <span className="absolute top-2 left-2 text-label-micro text-outline">+R$</span>
                <input
                  className={`${inputClass} pl-9 disabled:opacity-50`}
                  inputMode="decimal"
                  placeholder={option.isDefault ? "—" : "0,00"}
                  disabled={option.isDefault}
                  value={option.isDefault ? "" : option.price}
                  onChange={(event) =>
                    updateGroup(group.uid, (current) => ({
                      ...current,
                      options: current.options.map((item) =>
                        item.uid === option.uid ? { ...item, price: event.target.value } : item,
                      ),
                    }))
                  }
                  aria-label="Preço adicional"
                  title={option.isDefault ? "Itens inclusos já estão no preço do produto" : undefined}
                />
              </div>
              <AvailabilityToggle
                available={option.isAvailable}
                onChange={(isAvailable) =>
                  updateGroup(group.uid, (current) => ({
                    ...current,
                    options: current.options.map((item) => (item.uid === option.uid ? { ...item, isAvailable } : item)),
                  }))
                }
              />
              <RemoveButton
                label="Remover opção"
                onClick={() =>
                  updateGroup(group.uid, (current) => ({
                    ...current,
                    options: current.options.filter((item) => item.uid !== option.uid),
                  }))
                }
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-body-compact font-medium text-primary hover:bg-primary-fixed/40"
          onClick={() => addOption(group)}
        >
          <Icon name="add" />
          Adicionar opção
        </button>
      </article>
    );
  }

  function copyFrom(productId: string) {
    const source = copySources.find((item) => item.id === productId);
    if (!source) return;
    const hasContent = draft.variants.length > 0 || draft.groups.length > 0;
    if (hasContent && !window.confirm(`Substituir as opções atuais pelas de "${source.name}"?`)) return;
    setDraft(fromConfig(source.config, false));
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveProductConfigAction(product.id, {
        variants: draft.variants.map(({ key, id, name, price, isAvailable }) => ({ key, id, name, price, isAvailable })),
        groups: draft.groups.map((group) => ({
          id: group.id,
          variantKey: group.variantKey,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: group.options.map(({ id, name, price, isDefault, isAvailable }) => ({
            id,
            name,
            price,
            isDefault,
            isAvailable,
          })),
        })),
      });
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-editor-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-surface-container px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="options-editor-title" className="text-headline-sm font-semibold text-on-surface">
              Variações e opções
            </h2>
            <p className="truncate text-body-compact text-outline">{product.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {copySources.length > 0 ? (
              <select
                className="h-8 max-w-44 rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 text-body-compact text-on-surface-variant"
                value=""
                onChange={(event) => copyFrom(event.target.value)}
                aria-label="Copiar opções de outro produto"
              >
                <option value="">Copiar de…</option>
                {copySources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="rounded-lg p-1.5 text-outline hover:bg-surface-container hover:text-on-surface"
              onClick={onClose}
              aria-label="Fechar"
            >
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Variações */}
          <section className="flex flex-col gap-2.5">
            <div>
              <h3 className="text-body-medium font-semibold text-on-surface">Variações</h3>
              <p className="text-label-regular text-outline">
                Versões do produto com preço próprio (ex.: Simples e Completo; Pequena, Média e Grande). Deixe
                vazio se o produto tem um preço só.
              </p>
            </div>
            {draft.variants.map((variant) => (
              <div key={variant.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-low/60 p-2">
                <input
                  className={`${inputClass} min-w-40 flex-1`}
                  placeholder="Nome (ex.: Completo)"
                  value={variant.name}
                  onChange={(event) => updateVariant(variant.key, { name: event.target.value })}
                  aria-label="Nome da variação"
                />
                <div className="relative w-28">
                  <span className="absolute top-2 left-2 text-label-micro text-outline">R$</span>
                  <input
                    className={`${inputClass} pl-7`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={variant.price}
                    onChange={(event) => updateVariant(variant.key, { price: event.target.value })}
                    aria-label="Preço da variação"
                  />
                </div>
                <span
                  className="w-16 text-center text-label-micro text-outline"
                  title="Grupos de opções exclusivos desta variação"
                >
                  {groupCount(variant.key) === 1 ? "1 grupo" : `${groupCount(variant.key)} grupos`}
                </span>
                <AvailabilityToggle
                  available={variant.isAvailable}
                  onChange={(isAvailable) => updateVariant(variant.key, { isAvailable })}
                />
                <RemoveButton label="Remover variação" onClick={() => removeVariant(variant.key)} />
              </div>
            ))}
            <button
              type="button"
              className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-body-compact font-medium text-primary hover:bg-primary-fixed/40"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  variants: [...current.variants, { key: uid("v"), name: "", price: "", isAvailable: true }],
                }))
              }
            >
              <Icon name="add" />
              Adicionar variação
            </button>
          </section>

          {/* Grupos */}
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-body-medium font-semibold text-on-surface">Grupos de opções</h3>
              <p className="text-label-regular text-outline">
                O que o garçom ou o cliente pode escolher, tirar ou adicionar. Tirar um item incluso não muda o
                preço.
              </p>
            </div>

            {sections.map((section) => {
              const groups = draft.groups.filter((group) => group.variantKey === section.key);
              const list = (
                <>
                  {groups.map((group, position) => renderGroup(group, position, groups.length))}
                  <PresetButtons compact={hasVariants} onPick={(preset) => addGroup(preset, section.key)} />
                </>
              );
              if (!hasVariants) {
                return (
                  <div key="all" className="flex flex-col gap-3">
                    {list}
                  </div>
                );
              }
              const isAll = section.key === null;
              return (
                <div
                  key={section.key ?? "all"}
                  className={`flex flex-col gap-3 rounded-xl border-l-4 p-3 ${
                    isAll ? "border-outline-variant bg-surface-container-low/40" : "border-primary bg-primary-fixed/15"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Icon
                          name={isAll ? "select_all" : "sell"}
                          className={`text-[18px] ${isAll ? "text-outline" : "text-primary"}`}
                        />
                        <h4 className="text-body-medium font-semibold text-on-surface">{section.title}</h4>
                      </div>
                      <span className="text-label-regular text-outline">
                        {groups.length === 0
                          ? "Nenhum grupo"
                          : `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`}
                      </span>
                    </div>
                    <p className="text-label-regular text-outline">{section.subtitle}</p>
                  </div>
                  {list}
                </div>
              );
            })}
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-surface-container px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          {error ? (
            <p className="text-body-compact text-error sm:mr-auto" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg bg-surface-container-low px-3 py-1.5 text-body-compact text-on-surface-variant hover:bg-surface-container"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-body-compact font-medium text-on-primary hover:bg-primary-container disabled:opacity-60"
              onClick={save}
            >
              {pending ? "Salvando…" : "Salvar opções"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function AvailabilityToggle({ available, onChange }: { available: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-label-micro ${
        available ? "text-emerald-800 hover:bg-emerald-50" : "bg-surface-container text-outline"
      }`}
      onClick={() => onChange(!available)}
      title={available ? "Disponível — clique para marcar como em falta" : "Em falta — clique para disponibilizar"}
    >
      <Icon name={available ? "check_circle" : "block"} className="text-[16px]" />
      {available ? "Disponível" : "Em falta"}
    </button>
  );
}

function PresetButtons({ compact, onPick }: { compact: boolean; onPick: (preset: Preset) => void }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-outline-variant/60 px-2.5 py-1 text-label-regular font-medium text-on-surface-variant hover:border-primary hover:bg-primary-fixed/20 hover:text-primary"
            onClick={() => onPick(preset.id)}
            title={preset.hint}
          >
            <Icon name={preset.icon} className="text-[16px] text-primary" />
            {preset.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="flex items-start gap-2 rounded-lg border border-dashed border-outline-variant/60 p-2.5 text-left hover:border-primary hover:bg-primary-fixed/20"
          onClick={() => onPick(preset.id)}
        >
          <Icon name={preset.icon} className="text-primary" />
          <span>
            <span className="block text-body-compact font-medium text-on-surface">+ {preset.label}</span>
            <span className="block text-label-regular text-outline">{preset.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <IconButton icon="delete" label={label} onClick={onClick} danger />;
}

function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rounded p-1 text-outline transition-colors hover:bg-surface-container disabled:opacity-30 ${
        danger ? "hover:text-error" : "hover:text-on-surface"
      }`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}
