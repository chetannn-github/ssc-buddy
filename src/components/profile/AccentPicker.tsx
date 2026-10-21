import { Check, LoaderCircle } from "lucide-react";
import { APP_ACCENTS, accentInk, normalizeAppAccent, type AppAccent } from "@/lib/app-accent";

export function AccentPicker({
  value,
  onChange,
  disabled = false,
  saving = false,
}: {
  value?: string | undefined;
  onChange: (color: AppAccent) => void;
  disabled?: boolean;
  saving?: boolean;
}) {
  const current = normalizeAppAccent(value);
  return (
    <section className="rounded-xl border border-white/10 bg-[#111] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium">App accent</h4>
        {saving && <LoaderCircle className="h-4 w-4 animate-spin text-primary" />}
      </div>
      <div
        role="radiogroup"
        aria-label="App accent"
        className="flex gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {APP_ACCENTS.map((option) => (
          <button
            key={option.color}
            type="button"
            role="radio"
            aria-label={option.name}
            aria-checked={current === option.color}
            disabled={disabled}
            title={option.name}
            onClick={() => onChange(option.color)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 disabled:opacity-50 ${current === option.color ? "border-white" : "border-transparent"}`}
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-full"
              style={{ backgroundColor: option.color, color: accentInk(option.color) }}
            >
              {current === option.color && <Check className="h-4 w-4" />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
