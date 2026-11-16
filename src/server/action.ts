import { AppError } from "./errors";

export type ActionState = { error?: string; success?: string } | null;

export function actionError(error: unknown): ActionState {
  if (isRedirectError(error)) {
    throw error;
  }

  if (error instanceof AppError) {
    return { error: error.message };
  }

  console.error(error);
  return { error: "Não foi possível concluir a operação." };
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
