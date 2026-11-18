"use client";

import { useEffect, useId } from "react";

import { Icon } from "@/components/ui/icon";

/** Modal de formulário de cadastro/edição (fecha com Esc, clique fora ou X). */
export function FormModal({
  title,
  icon,
  onClose,
  dismissible = true,
  children,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  /** Falso enquanto outro modal está aberto por cima (o Esc e o clique fora ficam com ele). */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest shadow-xl sm:max-w-lg sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-surface-container px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name={icon} className="text-primary" />
            <h2 id={titleId} className="truncate text-headline-sm font-semibold text-on-surface">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-outline hover:bg-surface-container hover:text-on-surface"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
