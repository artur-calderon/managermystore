import { AppError } from "./errors";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");

  if (slug.length < 3 || !slugPattern.test(slug)) {
    throw new AppError(
      "invalid_slug",
      "O nome precisa gerar um endereço com pelo menos 3 letras ou números.",
    );
  }

  return slug;
}
