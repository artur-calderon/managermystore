export function MetricCard({
  label,
  value,
  detail,
  aside,
}: {
  label: string;
  value: string;
  detail?: string;
  aside?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-body-compact font-medium text-outline">{label}</span>
        {aside}
      </div>
      <div className="text-metric-headline font-semibold tracking-tight text-on-surface">{value}</div>
      {detail ? <p className="mt-1 text-label-micro text-outline">{detail}</p> : null}
    </article>
  );
}
