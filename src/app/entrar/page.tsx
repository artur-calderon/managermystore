import Link from "next/link";

import { BoundForm, SubmitButton, fieldClassName } from "@/components/shared/form";
import { loginAction } from "@/modules/tenancy/actions";

export default function LoginPage() {
  return (
    <main className="mx-auto grid w-full max-w-md gap-4 px-margin-mobile py-16">
      <h1 className="text-headline-md font-semibold text-on-surface">Entrar</h1>
      <BoundForm action={loginAction}>
        <label>
          E-mail
          <input className={fieldClassName} name="email" type="email" required />
        </label>
        <label>
          Senha
          <input className={fieldClassName} name="password" type="password" required />
        </label>
        <SubmitButton>Entrar</SubmitButton>
      </BoundForm>
      <Link href="/cadastrar" className="text-body-compact text-primary">
        Cadastrar estabelecimento
      </Link>
    </main>
  );
}
