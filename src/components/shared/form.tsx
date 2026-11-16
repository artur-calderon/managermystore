"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ActionState } from "@/server/action";

export function BoundForm({
  action,
  children,
  className = "grid gap-3",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error ? <p className="text-body-compact text-error" role="alert">{state.error}</p> : null}
      {state?.success ? <p className="text-body-compact text-emerald-800">{state.success}</p> : null}
    </form>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-8 w-fit items-center rounded bg-primary px-3 text-body-medium font-medium text-on-primary disabled:opacity-60"
    >
      {pending ? "Salvando…" : children}
    </button>
  );
}

export const fieldClassName =
  "h-8 w-full rounded border border-outline-variant/40 bg-surface-container-low px-2 text-body-compact text-on-surface outline-none focus:border-primary";
