import { RefreshCw } from "lucide-react";
export function ReattemptButton({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${active ? "border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] text-primary" : "border-white/15 text-zinc-400 hover:text-white"}`}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Reattempt mode
    </button>
  );
}
