"use client";

import { useState } from "react";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { FormModal } from "@/components/shared/form-modal";
import { Icon } from "@/components/ui/icon";
import { roleLabels } from "@/components/layout/navigation";
import type { Role } from "@/lib/db/schema";
import { addMemberAction, removeMemberAction, transferOwnershipAction } from "@/modules/tenancy/actions";

export type RegistryMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled" | "removed";
  isSelf: boolean;
};

const assignableRoles: { role: Role; hint: string; icon: string }[] = [
  { role: "waiter", hint: "Abre mesas e lança pedidos", icon: "room_service" },
  { role: "kitchen", hint: "Vê e prepara os pedidos", icon: "skillet" },
  { role: "cashier", hint: "Fecha contas e recebe pagamentos", icon: "point_of_sale" },
  { role: "admin", hint: "Acesso total, menos transferir a loja", icon: "admin_panel_settings" },
];

const roleTone: Record<Role, string> = {
  owner: "bg-primary-fixed text-on-primary-fixed",
  admin: "bg-tertiary-fixed text-on-tertiary-fixed",
  waiter: "bg-surface-container-high text-on-surface",
  kitchen: "bg-surface-container-high text-on-surface",
  cashier: "bg-surface-container-high text-on-surface",
};

type Filter = "active" | "removed" | Role;

export function MembersRegistry({
  members,
  canTransferOwnership,
}: {
  members: RegistryMember[];
  canTransferOwnership: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  // null = modal fechado; os campos vêm preenchidos ao readmitir alguém desligado.
  const [adding, setAdding] = useState<{ name: string; email: string; role: Role } | null>(null);

  const current = members.filter((member) => member.status !== "removed");
  const removedCount = members.length - current.length;
  const countByRole = (role: Role) => current.filter((member) => member.role === role).length;
  const rolesPresent = (["owner", "admin", "waiter", "kitchen", "cashier"] as Role[]).filter(
    (role) => countByRole(role) > 0,
  );

  const term = query.trim().toLowerCase();
  const visible = members
    .filter((member) => {
      if (filter === "removed") {
        if (member.status !== "removed") return false;
      } else {
        if (member.status === "removed") return false;
        if (filter !== "active" && member.role !== filter) return false;
      }
      return !term || member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term);
    })
    .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.name.localeCompare(b.name));

  const closeModal = () => setAdding(null);
  const readmitting = Boolean(adding?.email);

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="text-headline-md tracking-tight text-on-surface">Funcionários</h1>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-micro font-medium text-on-surface-variant">
              Equipe
            </span>
          </div>
          <p className="mt-1 text-body-compact text-outline">
            Cadastre quem trabalha na loja e defina o que cada pessoa pode acessar.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-body-compact font-medium text-on-primary shadow-sm hover:bg-primary-container"
          onClick={() => setAdding({ name: "", email: "", role: "waiter" })}
        >
          <Icon name="person_add" />
          Adicionar funcionário
        </button>
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <Summary label="Equipe ativa" value={String(current.length)} detail="pessoas" icon="groups" />
        <Summary
          label="No salão"
          value={String(countByRole("waiter"))}
          detail={countByRole("waiter") === 1 ? "garçom" : "garçons"}
          icon="room_service"
        />
        <Summary
          label="Cozinha e caixa"
          value={String(countByRole("kitchen") + countByRole("cashier"))}
          detail="pessoas"
          icon="skillet"
        />
      </div>

      <div className="flex flex-col justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
          <FilterButton active={filter === "active"} onClick={() => setFilter("active")}>
            Todos <span className="ml-1 opacity-70">{current.length}</span>
          </FilterButton>
          {rolesPresent.map((role) => (
            <FilterButton key={role} active={filter === role} onClick={() => setFilter(role)}>
              {roleLabels[role]} <span className="ml-1 opacity-70">{countByRole(role)}</span>
            </FilterButton>
          ))}
          {removedCount > 0 ? (
            <FilterButton active={filter === "removed"} onClick={() => setFilter("removed")}>
              Desligados <span className="ml-1 opacity-70">{removedCount}</span>
            </FilterButton>
          ) : null}
        </div>
        <div className="relative lg:w-72">
          <Icon name="search" className="absolute top-2 left-2.5 text-[18px] text-outline" />
          <input
            className="h-8 w-full rounded-lg bg-surface-container-low pr-3 pl-8 text-body-compact text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary"
            placeholder="Buscar por nome ou e-mail..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-low/70">
                <th className="px-3.5 py-2 text-label-micro tracking-wider text-outline uppercase">Funcionário</th>
                <th className="px-3 py-2 text-label-micro tracking-wider text-outline uppercase">Papel</th>
                <th className="px-3 py-2 text-center text-label-micro tracking-wider text-outline uppercase">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-label-micro tracking-wider text-outline uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low">
              {visible.length === 0 ? (
                <tr>
                  <td className="px-3.5 py-6 text-body-compact text-outline" colSpan={4}>
                    {filter === "removed" ? "Nenhum funcionário desligado." : "Nenhum funcionário encontrado."}
                  </td>
                </tr>
              ) : (
                visible.map((member) => {
                  // Motivo para a ação ficar bloqueada (null = pode).
                  const lockReason =
                    member.role === "owner"
                      ? "O proprietário não pode ser desligado"
                      : member.isSelf
                        ? "Você não pode desligar a própria conta"
                        : null;
                  const transferLock = !canTransferOwnership
                    ? "Só o proprietário pode transferir a loja"
                    : member.role === "owner"
                      ? "Já é o proprietário"
                      : null;
                  return (
                    <tr key={member.id} className="transition-colors hover:bg-surface-container-low/40">
                      <td className="px-3.5 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-regular font-semibold ${
                              member.status === "removed"
                                ? "bg-surface-container text-outline"
                                : "bg-primary-fixed text-on-primary-fixed"
                            }`}
                            aria-hidden
                          >
                            {initials(member.name)}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span
                              className={`truncate text-body-medium font-medium ${
                                member.status === "removed" ? "text-outline" : "text-on-surface"
                              }`}
                            >
                              {member.name}
                              {member.isSelf ? (
                                <span className="ml-1.5 text-label-micro font-normal text-outline">(você)</span>
                              ) : null}
                            </span>
                            <span className="truncate text-label-micro text-outline">{member.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-2 py-0.5 text-label-micro font-medium ${roleTone[member.role]}`}>
                          {roleLabels[member.role]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusPill status={member.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {member.status === "removed" ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-label-regular text-primary hover:bg-surface-container"
                            title="Readmitir funcionário"
                            onClick={() =>
                              setAdding({ name: member.name, email: member.email, role: member.role })
                            }
                          >
                            <Icon name="person_add" />
                            Readmitir
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            {transferLock ? (
                              <LockedAction icon="workspace_premium" reason={transferLock} />
                            ) : (
                              <BoundForm action={transferOwnershipAction} className="inline">
                                <input type="hidden" name="memberId" value={member.id} />
                                <button
                                  type="submit"
                                  className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-primary"
                                  title="Tornar proprietário"
                                  aria-label={`Tornar ${member.name} proprietário`}
                                  onClick={(event) => {
                                    if (
                                      !window.confirm(
                                        `Transferir a propriedade da loja para ${member.name}? Você deixará de ser o proprietário.`,
                                      )
                                    ) {
                                      event.preventDefault();
                                    }
                                  }}
                                >
                                  <Icon name="workspace_premium" />
                                </button>
                              </BoundForm>
                            )}
                            {lockReason ? (
                              <LockedAction icon="person_remove" reason={lockReason} />
                            ) : (
                              <BoundForm action={removeMemberAction} className="inline">
                                <input type="hidden" name="memberId" value={member.id} />
                                <button
                                  type="submit"
                                  className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-error"
                                  title="Desligar funcionário"
                                  aria-label={`Desligar ${member.name}`}
                                  onClick={(event) => {
                                    if (!window.confirm(`Desligar ${member.name}? A pessoa perde o acesso à loja.`)) {
                                      event.preventDefault();
                                    }
                                  }}
                                >
                                  <Icon name="person_remove" />
                                </button>
                              </BoundForm>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between bg-surface-container-low/40 px-space-md py-space-sm text-body-compact text-outline">
          <span>
            Mostrando <strong>{visible.length}</strong> de{" "}
            <strong>{filter === "removed" ? removedCount : current.length}</strong>{" "}
            {filter === "removed" ? "funcionários desligados" : "funcionários ativos"}
          </span>
        </div>
      </div>

      {adding ? (
        <FormModal
          title={readmitting ? `Readmitir ${adding.name}` : "Adicionar funcionário"}
          icon="person_add"
          onClose={closeModal}
        >
          <BoundForm action={addMemberAction} onSuccess={closeModal}>
            <label className="grid gap-1 text-label-regular font-medium text-on-surface">
              <span>
                Nome <span className="text-primary">*</span>
              </span>
              <input
                className={fieldClassName}
                name="name"
                placeholder="ex: Maria Souza"
                defaultValue={adding.name}
                autoFocus
                required
              />
            </label>
            <label className="grid gap-1 text-label-regular font-medium text-on-surface">
              <span>
                E-mail <span className="text-primary">*</span>
              </span>
              <input
                className={fieldClassName}
                name="email"
                type="email"
                placeholder="maria@email.com"
                defaultValue={adding.email}
                readOnly={readmitting}
                required
              />
              <span className="text-label-micro font-normal text-on-surface-variant">
                Usado para entrar no sistema.
              </span>
            </label>
            {readmitting ? null : (
              <label className="grid gap-1 text-label-regular font-medium text-on-surface">
                Senha
                <input
                  className={fieldClassName}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Senha de acesso"
                />
                <span className="text-label-micro font-normal text-on-surface-variant">
                  Obrigatória para quem ainda não tem conta. Se o e-mail já tem conta, deixe em branco.
                </span>
              </label>
            )}
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-label-regular font-medium text-on-surface">
                Papel <span className="text-primary">*</span>
              </legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {assignableRoles.map((item) => (
                  <label
                    key={item.role}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-outline-variant/40 p-2.5 hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/20"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={item.role}
                      defaultChecked={item.role === adding.role}
                      className="sr-only"
                    />
                    <Icon name={item.icon} className="text-primary" />
                    <span>
                      <span className="block text-body-compact font-medium text-on-surface">
                        {roleLabels[item.role]}
                      </span>
                      <span className="block text-label-micro text-outline">{item.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex items-center justify-end gap-space-sm pt-space-xs">
              <button
                type="button"
                className="rounded-lg bg-surface-container-low px-3 py-1.5 text-body-compact text-on-surface-variant hover:bg-surface-container"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <SubmitButton>{readmitting ? "Readmitir" : "Adicionar funcionário"}</SubmitButton>
            </div>
          </BoundForm>
        </FormModal>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function LockedAction({ icon, reason }: { icon: string; reason: string }) {
  return (
    <span
      className="inline-flex cursor-not-allowed rounded p-1 text-outline opacity-35"
      title={reason}
      aria-label={reason}
      role="img"
    >
      <Icon name={icon} />
    </span>
  );
}

function StatusPill({ status }: { status: RegistryMember["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-label-micro text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        Ativo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-label-micro text-outline">
      <span className="h-1.5 w-1.5 rounded-full bg-outline" />
      {status === "removed" ? "Desligado" : "Usuário desativado"}
    </span>
  );
}

function Summary({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: string }) {
  return (
    <article className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
      <div className="space-y-0.5">
        <span className="text-label-regular tracking-wider text-outline uppercase">{label}</span>
        <div className="text-metric-headline font-semibold text-on-surface">
          {value} <span className="text-body-compact font-normal text-outline">{detail}</span>
        </div>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-low text-primary">
        <Icon name={icon} className="text-[22px]" />
      </div>
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
