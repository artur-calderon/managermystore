export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined text-[18px] ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}
