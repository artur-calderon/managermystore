import { Suspense } from "react";
import { connection } from "next/server";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import {
  addMemberAction,
  removeMemberAction,
  transferOwnershipAction,
} from "@/modules/tenancy/actions";
import { getMembers } from "@/modules/tenancy/service";
import { can } from "@/server/authorization";
import { requireActor } from "@/server/context";

export default function MembersPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Members />
    </Suspense>
  );
}

async function Members() {
  await connection();
  const actor = await requireActor();
  const members = await getMembers(actor);

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Funcionários</h1>
      <BoundForm action={addMemberAction}>
        <input className={fieldClassName} name="name" placeholder="Nome" required />
        <input className={fieldClassName} name="email" type="email" placeholder="E-mail" required />
        <input className={fieldClassName} name="password" type="password" placeholder="Senha, se for um usuário novo" />
        <select className={fieldClassName} name="role" defaultValue="waiter">
          <option value="admin">Administrador</option>
          <option value="waiter">Garçom</option>
          <option value="kitchen">Cozinha</option>
          <option value="cashier">Caixa</option>
        </select>
        <SubmitButton>Adicionar</SubmitButton>
      </BoundForm>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Papel</th>
            <th>Situação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.name}</td>
              <td>{member.email}</td>
              <td>{member.role}</td>
              <td>{member.deletedAt ? "Desligado" : member.disabledAt ? "Usuário desativado" : "Ativo"}</td>
              <td className="flex gap-2">
                {!member.deletedAt && member.role !== "owner" ? (
                  <BoundForm action={removeMemberAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <SubmitButton>Desligar</SubmitButton>
                  </BoundForm>
                ) : null}
                {can(actor.role, "ownership.transfer") && !member.deletedAt && member.role !== "owner" ? (
                  <BoundForm action={transferOwnershipAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <SubmitButton>Tornar proprietário</SubmitButton>
                  </BoundForm>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
