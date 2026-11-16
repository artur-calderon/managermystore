"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { Icon } from "@/components/ui/icon";
import {
  createEnvironmentAction,
  createTableAction,
  deactivateTableAction,
  reactivateTableAction,
  updateTableAction,
} from "@/modules/tables/actions";

export type RegistryEnvironment = {
  id: string;
  name: string;
};

export type RegistryTable = {
  id: string;
  name: string;
  capacity: number;
  notes: string | null;
  digitalMenuEnabled: boolean;
  environmentId: string;
  environmentName: string;
  occupied: boolean;
  active: boolean;
};

export function TablesRegistry({
  tables,
  environments,
  catalogHref,
}: {
  tables: RegistryTable[];
  environments: RegistryEnvironment[];
  catalogHref: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "inactive" | string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [capacity, setCapacity] = useState(4);
  const nameRef = useRef<HTMLInputElement>(null);

  const activeTables = tables.filter((table) => table.active);
  const inactiveTables = tables.filter((table) => !table.active);
  const activeCount = activeTables.length;
  const inactiveCount = inactiveTables.length;
  const totalCapacity = activeTables.reduce((sum, table) => sum + table.capacity, 0);
  const editing = tables.find((table) => table.id === editingId && table.active) ?? null;
  const showingInactive = filter === "inactive";

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tables.filter((table) => {
      if (showingInactive) {
        if (table.active) return false;
      } else {
        if (!table.active) return false;
        if (filter !== "all" && table.environmentId !== filter) return false;
      }
      return !term || table.name.toLowerCase().includes(term);
    });
  }, [filter, query, showingInactive, tables]);

  useEffect(() => {
    setCapacity(editing?.capacity ?? 4);
    nameRef.current?.focus();
  }, [editing?.id, tables.length]);

  function startCreate() {
    setEditingId(null);
    setCreatingEnvironment(false);
    setCapacity(4);
  }

  return (
    <div className="flex flex-col">
      <div className="mb-space-lg flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-headline-md tracking-tight text-on-surface">Mesas e ambientes</h1>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-micro font-medium text-on-surface-variant">
              Cadastro
            </span>
          </div>
          <p className="mt-0.5 text-body-default text-on-surface-variant">
            Gerencie os ambientes e cadastre as mesas do estabelecimento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <Link
            href="/painel/mesas"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-surface-container-lowest px-3.5 text-body-medium text-on-surface shadow-sm hover:bg-surface-container-low"
          >
            Ver salão
          </Link>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-surface-container-lowest px-3.5 text-body-medium text-on-surface shadow-sm hover:bg-surface-container-low"
            onClick={() => {
              setEditingId(null);
              setCreatingEnvironment(true);
            }}
          >
            <Icon name="add_business" className="text-outline" />
            Novo ambiente
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-4 text-body-medium text-on-primary shadow-sm hover:bg-primary-container"
            onClick={startCreate}
          >
            <Icon name="table_bar" />
            Cadastrar mesa
          </button>
        </div>
      </div>

      <div className="mb-space-lg grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <Summary label="Total de mesas" value={String(activeCount)} detail="cadastradas" icon="table_restaurant" />
        <Summary label="Capacidade total" value={String(totalCapacity)} detail="lugares" icon="group" />
        <Summary
          label="Ambientes ativos"
          value={String(environments.length)}
          detail="áreas"
          icon="floor_lamp"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <div className="flex flex-col gap-space-md lg:col-span-8">
          <div className="flex flex-col justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-1 overflow-x-auto">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                Ativas ({activeCount})
              </FilterButton>
              {environments.map((environment) => (
                <FilterButton
                  key={environment.id}
                  active={filter === environment.id}
                  onClick={() => setFilter(environment.id)}
                >
                  {environment.name} ({activeTables.filter((table) => table.environmentId === environment.id).length})
                </FilterButton>
              ))}
              {inactiveCount > 0 ? (
                <FilterButton active={showingInactive} onClick={() => setFilter("inactive")}>
                  Desativadas ({inactiveCount})
                </FilterButton>
              ) : null}
            </div>
            <div className="relative sm:w-60">
              <Icon name="search" className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[16px] text-outline" />
              <input
                className="h-8 w-full rounded bg-surface-container-low pr-3 pl-8 text-body-compact text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary"
                placeholder="Buscar mesa..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant">
                    <th className="px-4 py-2.5 text-label-micro font-semibold tracking-wider uppercase">
                      Identificação
                    </th>
                    <th className="px-3 py-2.5 text-label-micro font-semibold tracking-wider uppercase">Ambiente</th>
                    <th className="px-3 py-2.5 text-label-micro font-semibold tracking-wider uppercase">Lugares</th>
                    <th className="px-3 py-2.5 text-label-micro font-semibold tracking-wider uppercase">Status</th>
                    <th className="px-3 py-2.5 text-label-micro font-semibold tracking-wider uppercase">
                      Cardápio digital
                    </th>
                    <th className="px-4 py-2.5 text-right text-label-micro font-semibold tracking-wider uppercase">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low text-body-compact">
                  {visible.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-outline" colSpan={6}>
                        {showingInactive
                          ? "Nenhuma mesa desativada."
                          : activeCount === 0
                            ? "Nenhuma mesa cadastrada."
                            : "Nenhuma mesa encontrada."}
                      </td>
                    </tr>
                  ) : (
                    visible.map((table) => (
                      <tr key={table.id} className="hover:bg-surface-container-low/60">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                !table.active
                                  ? "bg-outline"
                                  : table.occupied
                                    ? "bg-primary"
                                    : "bg-emerald-600"
                              }`}
                            />
                            <span
                              className={`text-body-medium font-semibold ${
                                table.active ? "text-on-surface" : "text-on-surface-variant"
                              }`}
                            >
                              {table.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-on-surface-variant">{table.environmentName}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1 font-medium text-on-surface">
                            <Icon name="chair" className="text-[15px] text-outline" />
                            {table.capacity} lugares
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-label-micro font-medium ${
                              !table.active
                                ? "bg-surface-container text-on-surface-variant"
                                : table.occupied
                                  ? "bg-primary-fixed text-on-primary-fixed"
                                  : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {!table.active ? "Desativada" : table.occupied ? "Ocupada" : "Ativa"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {table.digitalMenuEnabled ? (
                            <Link
                              href={catalogHref}
                              className="inline-flex items-center gap-1 text-label-regular text-tertiary hover:underline"
                              target="_blank"
                            >
                              <Icon name="qr_code_2" className="text-[15px]" />
                              Cardápio
                            </Link>
                          ) : (
                            <span className="text-label-micro text-outline">Desligado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1">
                            {table.active ? (
                              <>
                                <button
                                  type="button"
                                  className="rounded p-1 text-outline hover:bg-surface-container hover:text-on-surface"
                                  title="Editar mesa"
                                  onClick={() => {
                                    setCreatingEnvironment(false);
                                    setEditingId(table.id);
                                  }}
                                >
                                  <Icon name="edit" />
                                </button>
                                {table.occupied ? null : (
                                  <BoundForm action={deactivateTableAction} className="inline">
                                    <input type="hidden" name="tableId" value={table.id} />
                                    <button
                                      type="submit"
                                      className="rounded p-1 text-outline hover:bg-surface-container hover:text-error"
                                      title="Desativar mesa (sai do salão)"
                                    >
                                      <Icon name="pause_circle" />
                                    </button>
                                  </BoundForm>
                                )}
                              </>
                            ) : (
                              <BoundForm action={reactivateTableAction} className="inline">
                                <input type="hidden" name="tableId" value={table.id} />
                                <button
                                  type="submit"
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-label-regular text-primary hover:bg-surface-container"
                                  title="Reativar mesa"
                                >
                                  <Icon name="play_circle" />
                                  Reativar
                                </button>
                              </BoundForm>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between bg-surface-container-low/40 p-space-sm text-label-regular text-on-surface-variant">
              <span>
                {showingInactive
                  ? `Mostrando ${visible.length} de ${inactiveCount} mesas desativadas`
                  : `Mostrando ${visible.length} de ${activeCount} mesas ativas`}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="sticky top-20 rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            {creatingEnvironment ? (
              <>
                <div className="mb-space-md flex items-center justify-between border-b border-surface-container-low pb-space-sm">
                  <div className="flex items-center gap-2">
                    <Icon name="add_business" className="text-primary" />
                    <h2 className="text-headline-sm font-semibold tracking-tight text-on-surface">Novo ambiente</h2>
                  </div>
                  <button
                    type="button"
                    className="text-label-micro font-medium tracking-wide text-outline uppercase hover:text-on-surface"
                    onClick={() => setCreatingEnvironment(false)}
                  >
                    Limpar
                  </button>
                </div>
                <BoundForm action={createEnvironmentAction}>
                  <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                    Nome do ambiente <span className="text-primary">*</span>
                    <input
                      className={fieldClassName}
                      name="name"
                      placeholder="ex: Varanda / Deck"
                      required
                    />
                  </label>
                  <div className="flex items-center justify-end gap-space-sm">
                    <button
                      type="button"
                      className="h-8 rounded bg-surface-container-low px-3 text-body-compact text-on-surface hover:bg-surface-container"
                      onClick={() => setCreatingEnvironment(false)}
                    >
                      Cancelar
                    </button>
                    <SubmitButton>Salvar ambiente</SubmitButton>
                  </div>
                </BoundForm>
              </>
            ) : (
              <>
                <div className="mb-space-md flex items-center justify-between border-b border-surface-container-low pb-space-sm">
                  <div className="flex items-center gap-2">
                    <Icon name={editing ? "edit" : "add_circle"} className="text-primary" />
                    <h2 className="text-headline-sm font-semibold tracking-tight text-on-surface">
                      {editing ? `Editar ${editing.name}` : "Nova mesa"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="text-label-micro font-medium tracking-wide text-outline uppercase hover:text-on-surface"
                    onClick={startCreate}
                  >
                    Limpar
                  </button>
                </div>

                {environments.length === 0 ? (
                  <p className="text-body-compact text-outline">
                    Crie um ambiente antes de cadastrar mesas.
                  </p>
                ) : (
                  <BoundForm
                    key={editing?.id ?? "new"}
                    action={editing ? updateTableAction : createTableAction}
                  >
                    {editing ? <input type="hidden" name="tableId" value={editing.id} /> : null}
                    <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                      <span>
                        Número ou identificador <span className="text-primary">*</span>
                      </span>
                      <input
                        ref={nameRef}
                        className={fieldClassName}
                        name="name"
                        placeholder="ex: Mesa 25 ou M25"
                        defaultValue={editing?.name ?? ""}
                        required
                      />
                      <span className="text-label-micro font-normal text-on-surface-variant">
                        Nome exibido na comanda e no terminal do garçom.
                      </span>
                    </label>

                    <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                      <span>
                        Ambiente / setor <span className="text-primary">*</span>
                      </span>
                      <select
                        className={fieldClassName}
                        name="environmentId"
                        defaultValue={editing?.environmentId ?? environments[0]?.id}
                        required
                      >
                        {environments.map((environment) => (
                          <option key={environment.id} value={environment.id}>
                            {environment.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-1">
                      <span className="text-label-regular font-medium text-on-surface">
                        Capacidade de lugares <span className="text-primary">*</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            className={`${fieldClassName} pr-8`}
                            name="capacity"
                            type="number"
                            min={1}
                            max={50}
                            value={capacity}
                            onChange={(event) => setCapacity(Number(event.target.value) || 1)}
                            required
                          />
                          <Icon name="chair" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[16px] text-outline" />
                        </div>
                        {[2, 4, 6].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className="h-8 rounded bg-surface-container-low px-2.5 text-label-regular font-medium text-on-surface-variant hover:text-on-surface"
                            onClick={() => setCapacity(value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-container-low p-space-sm">
                      <span>
                        <span className="block text-body-compact font-medium text-on-surface">
                          QR Code de autoatendimento
                        </span>
                        <span className="mt-0.5 block text-label-micro text-on-surface-variant">
                          Gerar link para cardápio digital desta mesa
                        </span>
                      </span>
                      <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
                        <input
                          type="checkbox"
                          name="digitalMenuEnabled"
                          defaultChecked={editing?.digitalMenuEnabled ?? true}
                          className="peer sr-only"
                        />
                        <span className="h-6 w-10 rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40" />
                        <span className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                      </span>
                    </label>

                    <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                      <span>
                        Observações operacionais{" "}
                        <span className="font-normal text-outline">(opcional)</span>
                      </span>
                      <textarea
                        className="min-h-16 w-full rounded border border-outline-variant/40 bg-surface-container-low px-2 py-2 text-body-compact text-on-surface outline-none placeholder:text-outline focus:border-primary"
                        name="notes"
                        rows={2}
                        placeholder="ex: Perto da tomada, mesa móvel para junção..."
                        defaultValue={editing?.notes ?? ""}
                      />
                    </label>

                    <div className="flex items-center justify-end gap-space-sm pt-space-sm">
                      <button
                        type="button"
                        className="h-8 rounded bg-surface-container-low px-3 text-body-compact text-on-surface hover:bg-surface-container"
                        onClick={startCreate}
                      >
                        Cancelar
                      </button>
                      <SubmitButton>{editing ? "Atualizar mesa" : "Salvar mesa"}</SubmitButton>
                    </div>
                  </BoundForm>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <article className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
      <div>
        <span className="text-label-regular text-on-surface-variant">{label}</span>
        <div className="mt-0.5 text-metric-headline font-semibold tracking-tight text-on-surface">
          {value} <span className="text-label-regular font-normal text-on-surface-variant">{detail}</span>
        </div>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-primary">
        <Icon name={icon} />
      </span>
    </article>
  );
}

function FilterButton({
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
      className={`rounded px-3 py-1.5 text-body-compact whitespace-nowrap ${
        active
          ? "bg-surface-container font-semibold text-on-surface"
          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}
