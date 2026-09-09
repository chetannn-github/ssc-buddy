import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/exam";

const OPTIONS: Option[] = ["A", "B", "C", "D"];

type Props = {
  count: number;
  startNumber: number;
  subject: string;
  chapter: string;
  onBack: () => void;
  onConfirm: (key: (Option | null)[]) => void;
  initialKey?: (Option | null)[] | null;
  confirmLabel?: string;
  showSkip?: boolean;
};

export function AnswerKeyScreen({
  count,
  startNumber,
  subject,
  chapter,
  onBack,
  onConfirm,
  initialKey = null,
  confirmLabel = "Start Test",
  showSkip = true,
}: Props) {
  const [key, setKey] = useState<(Option | null)[]>(() =>
    Array.from({ length: count }, (_, i) => initialKey?.[i] ?? null),
  );

  const filled = key.filter(Boolean).length;

  const set = (i: number, opt: Option) =>
    setKey((prev) => prev.map((v, idx) => (idx === i ? (v === opt ? null : opt) : v)));

  return (
    <div className="card-surface space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Answer key</h2>
          <p className="truncate text-xs text-muted-foreground">
            {subject} · {chapter} · Q{startNumber}–{startNumber + count - 1}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {filled}/{count} filled
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Saare {count} answers bharna zaroori hai — tabhi chapter save hoga aur result apne aap
        ban jayega.
      </p>

      <div className="grid max-h-[26rem] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {key.map((v, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5"
          >
            <span className="text-xs font-medium text-muted-foreground">Q{startNumber + i}</span>
            <div className="flex gap-1">
              {OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set(i, opt)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                    v === opt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onConfirm(key)} disabled={filled < count}>
          {confirmLabel}
        </Button>
        {showSkip && (
          <Button
            variant="ghost"
            onClick={() => onConfirm(Array.from({ length: count }, () => null))}
          >
            Skip key
          </Button>
        )}
      </div>
    </div>
  );
}
