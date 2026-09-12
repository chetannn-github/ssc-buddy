import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-card px-3 py-3 sm:px-4 sm:py-4 ${className}`}>
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}

export function Bar({
  value,
  tone = "blue",
}: {
  value: number;
  tone?: "blue" | "green" | undefined;
}) {
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-track">
      <div
        className={`h-full rounded-full ${tone === "green" ? "bg-accent-green" : "bg-accent-blue"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Num({
  value,
  onChange,
  className = "",
  min = 0,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string | undefined;
  min?: number | undefined;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={min}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
      className={`h-7 w-14 rounded-full bg-track px-2 text-center font-mono text-[13px] text-foreground outline-none focus:ring-2 focus:ring-accent-blue/40 ${className}`}
    />
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground">
      {children}
    </span>
  );
}

export function GhostButton({
  children,
  onClick,
  tone = "default",
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  tone?: "default" | "blue" | "danger" | undefined;
  className?: string | undefined;
  type?: ("button" | "submit") | undefined;
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive border-destructive/30 hover:bg-destructive/10"
      : tone === "blue"
        ? "text-accent-blue border-accent-blue/30 hover:bg-accent-blue/10"
        : "text-foreground border-border hover:bg-track";
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full border bg-card px-3 py-1.5 text-[13px] transition-colors ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  variant = "ghost",
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  variant?: ("ghost" | "solid") | undefined;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        variant === "solid"
          ? "grid h-7 w-7 place-items-center rounded-full bg-accent-blue text-card transition-opacity hover:opacity-85"
          : "grid h-7 w-7 place-items-center rounded-full bg-track text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

export const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: open ? "rotate(90deg)" : "none" }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);
