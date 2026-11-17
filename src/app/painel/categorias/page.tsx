import { Suspense } from "react";
import { connection } from "next/server";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import {
  createCategoryAction,
  deactivateCategoryAction,
  updateCategoryAction,
} from "@/modules/catalog/actions";
import { listCategories } from "@/modules/catalog/service";
import { requirePageActor } from "@/server/context";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await connection();
  const actor = await requirePageActor("/painel/categorias");
  const categories = await listCategories(actor.establishmentId, true);

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Categorias</h1>
      <BoundForm action={createCategoryAction}>
        <input className={fieldClassName} name="name" placeholder="Nome" required />
        <SubmitButton>Criar</SubmitButton>
      </BoundForm>
      <ul className="grid gap-3">
        {categories.map((category) => (
          <li key={category.id} className="grid gap-2 border p-3">
            <BoundForm action={updateCategoryAction}>
              <input type="hidden" name="categoryId" value={category.id} />
              <input className={fieldClassName} name="name" defaultValue={category.name} />
              <SubmitButton>Salvar</SubmitButton>
            </BoundForm>
            {!category.deletedAt ? (
              <BoundForm action={deactivateCategoryAction}>
                <input type="hidden" name="categoryId" value={category.id} />
                <SubmitButton>Desativar</SubmitButton>
              </BoundForm>
            ) : (
              <p>Desativada</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
