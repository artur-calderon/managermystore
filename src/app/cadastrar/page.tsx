import Link from "next/link";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { registerAction } from "@/modules/tenancy/actions";

export default function RegisterPage() {
  return (
    <main className="mx-auto grid w-full max-w-md gap-4 px-margin-mobile py-16">
      <h1 className="text-headline-md font-semibold text-on-surface">Cadastrar estabelecimento</h1>
      <BoundForm action={registerAction}>
        <label>
          Seu nome
          <input className={fieldClassName} name="userName" required />
        </label>
        <label>
          E-mail
          <input className={fieldClassName} name="email" type="email" required />
        </label>
        <label>
          Senha
          <input className={fieldClassName} name="password" type="password" required />
        </label>
        <label>
          Nome do estabelecimento
          <input className={fieldClassName} name="establishmentName" required />
        </label>
        <SubmitButton>Criar</SubmitButton>
      </BoundForm>
      <Link href="/entrar" className="text-body-compact text-primary">
        Já tenho conta
      </Link>
    </main>
  );
}
