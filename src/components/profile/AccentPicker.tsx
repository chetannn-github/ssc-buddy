import { Check, LoaderCircle } from "lucide-react";
import { useRef } from "react";
import { SlidingHighlight } from "../../../shared/SlidingHighlight";
import { APP_ACCENTS, accentInk, normalizeAppAccent, type AppAccent } from "../../lib/app-accent";

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
  const row=useRef<HTMLDivElement>(null);
  return (
    <section className="rounded-xl border border-white/10 bg-[#111] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium">App accent</h4>
        {saving && <LoaderCircle className="h-4 w-4 animate-spin text-primary" />}
      </div>
      <div
        ref={row}
        role="radiogroup"
        aria-label="App accent"
        className="relative isolate flex gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <SlidingHighlight container={row} active={current} color="transparent" borderColor={current} radius={999}/>
        {APP_ACCENTS.map((option) => (
          <button
            key={option.color}
            data-slide-key={option.color}
            type="button"
            role="radio"
            aria-label={option.name}
            aria-checked={current === option.color}
            disabled={disabled}
            title={option.name}
            onClick={() => onChange(option.color)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-transparent disabled:opacity-50"
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
