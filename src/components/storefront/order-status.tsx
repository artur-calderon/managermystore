import { Icon } from "@/components/ui/icon";

export const customerStatusLabels: Record<string, string> = {
  pending: "Aguardando a loja",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  closed: "Entregue",
  cancelled: "Cancelado",
};

const statusTones: Record<string, string> = {
  pending: "bg-secondary-fixed text-on-secondary-fixed",
  preparing: "bg-tertiary-fixed text-on-tertiary-fixed",
  ready: "bg-tertiary-fixed text-on-tertiary-fixed",
  out_for_delivery: "bg-primary-fixed text-on-primary-fixed",
  closed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-error-container text-on-error-container",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-label-micro ${statusTones[status] ?? ""}`}>
      {customerStatusLabels[status] ?? status}
    </span>
  );
}

const steps = [
  { status: "pending", icon: "receipt_long", label: "Pedido recebido" },
  { status: "preparing", icon: "skillet", label: "Em preparo" },
  { status: "out_for_delivery", icon: "two_wheeler", label: "Saiu para entrega" },
  { status: "closed", icon: "task_alt", label: "Entregue" },
];

const progress: Record<string, number> = { pending: 0, preparing: 1, ready: 1, out_for_delivery: 2, closed: 3 };

/** Linha do tempo do pedido para o cliente ("Pronto" fica dentro de "Em preparo"). */
export function StatusTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-error-container p-space-md text-on-error-container">
        <Icon name="cancel" className="text-[22px]" />
        <p className="text-body-medium">Este pedido foi cancelado pela loja.</p>
      </div>
    );
  }

  const current = progress[status] ?? 0;

  return (
    <ol className="flex flex-col gap-0">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  done
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-primary text-on-primary ring-4 ring-primary/20"
                      : "bg-surface-container text-outline"
                }`}
              >
                <Icon name={done ? "check" : step.icon} className="text-[18px]" />
              </span>
              {index < steps.length - 1 ? (
                <span className={`my-1 w-0.5 flex-1 rounded-full ${done ? "bg-emerald-600" : "bg-surface-container-high"}`} />
              ) : null}
            </div>
            <div className={`pt-1.5 ${index < steps.length - 1 ? "pb-5" : ""}`}>
              <p className={`text-body-medium ${active ? "font-semibold text-on-surface" : done ? "text-on-surface" : "text-outline"}`}>
                {step.label}
              </p>
              {active && status === "ready" ? (
                <p className="text-label-regular text-on-surface-variant">Pronto, aguardando o entregador.</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
