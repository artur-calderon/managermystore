export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest ${className}`}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-bright px-space-md py-space-md">
          <div>
            <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>
            {description ? <p className="text-label-micro text-outline">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
