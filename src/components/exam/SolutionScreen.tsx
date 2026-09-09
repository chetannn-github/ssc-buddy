import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Option, TestRecord } from "@/lib/exam";

const OPTIONS: Option[] = ["A", "B", "C", "D"];

type Props = {
  record: TestRecord;
  onExit: () => void;
};

export function SolutionScreen({ record, onExit }: Props) {
  const total = record.answers.length;
  const [current, setCurrent] = useState(0);
  const [reattempt, setReattempt] = useState(true);
  const [retryAnswers, setRetryAnswers] = useState<(Option | null)[]>(() =>
    Array.from({ length: total }, () => null),
  );

  const key = record.answerKey ?? [];

  const verdicts = useMemo(
    () =>
      record.answers.map((a, i) => {
        if (!a) return null;
        const k = key[i];
        if (!k) return record.evaluations?.[i] ?? null;
        return a === k ? "correct" : "incorrect";
      }),
    [record.answers, record.evaluations, key],
  );

  const original = record.answers[current] ?? null;
  const correctOpt = key[current] ?? null;
  const retry = retryAnswers[current] ?? null;

  const paletteClass = (i: number) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-md border text-xs font-semibold transition-all hover:scale-105",
      verdicts[i] === "correct"
        ? "border-answered bg-answered text-answered-foreground"
        : verdicts[i] === "incorrect"
          ? "border-destructive bg-destructive text-destructive-foreground"
          : "border-border bg-muted text-muted-foreground",
      i === current && "ring-2 ring-ring ring-offset-2",
    );

  const optionClass = (opt: Option) => {
    // Reattempt mode must not reveal the answer key. Only the option selected
    // for this retry is coloured, based on its result.
    if (reattempt) {
      if (!retry) return "border-border bg-surface hover:border-primary/40 hover:bg-accent/50";
      if (opt === retry) {
        return retry === correctOpt
          ? "border-answered bg-answered/15 font-semibold"
          : "border-destructive bg-destructive/10 font-semibold";
      }
      return "border-border bg-surface";
    }
    if (correctOpt && opt === correctOpt) return "border-answered bg-answered/15 font-semibold";
    if (opt === original) return "border-destructive bg-destructive/10 font-semibold";
    return "border-border bg-surface";
  };

  const badgeClass = (opt: Option) => {
    const active = reattempt ? opt === retry : opt === original || opt === correctOpt;
    if (!active) return "border-border text-muted-foreground";
    if ((reattempt && retry === correctOpt) || (!reattempt && correctOpt && opt === correctOpt)) {
      return "border-answered bg-answered text-answered-foreground";
    }
    return "border-destructive bg-destructive text-destructive-foreground";
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-20 text-exam-header-foreground shadow-[var(--shadow-card)]"
        style={{ backgroundImage: "var(--gradient-header)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-xs font-semibold tracking-[0.14em] uppercase opacity-80">
              Solution
            </h1>
            <p className="truncate text-sm font-medium">
              {record.subject} · {record.chapter}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs backdrop-blur-sm">
              Reattempt Mode
              <Switch checked={reattempt} onCheckedChange={setReattempt} />
            </label>
            <Button size="sm" variant="secondary" onClick={onExit}>
              Close
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[1fr_320px]">
        <section className="card-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <h2 className="text-lg font-semibold">Question {record.startNumber + current}</h2>
            <span className="text-sm text-muted-foreground">
              Question {current + 1} of {total}
            </span>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {reattempt
              ? "Attempt this question again — you will see instantly if it is right or wrong."
              : "Your answer from the original attempt, with the correct option marked."}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={!reattempt}
                onClick={() =>
                  reattempt &&
                  setRetryAnswers((prev) =>
                    prev.map((v, i) => (i === current ? (v === opt ? null : opt) : v)),
                  )
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-4 text-left text-sm transition-all",
                  reattempt && "active:scale-[0.99]",
                  optionClass(opt),
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                    badgeClass(opt),
                  )}
                >
                  {opt}
                </span>
                Option {opt}
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium">
                  {!reattempt && correctOpt === opt && (
                    <span className="rounded-full bg-answered/15 px-2 py-0.5 text-answered">
                      Correct
                    </span>
                  )}
                  {reattempt && retry && original === opt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      Your 1st attempt
                    </span>
                  )}
                  {!reattempt && original === opt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      You marked
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {!reattempt && !original && (
            <p className="mt-4 text-sm text-muted-foreground">Not attempted · 0 marks</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
            >
              Previous
            </Button>
            <Button
              onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
              disabled={current === total - 1}
            >
              Next
            </Button>
          </div>
        </section>

        <aside className="card-surface h-fit p-4 lg:sticky lg:top-24">
          <h3 className="text-sm font-semibold">Question Palette</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-answered" /> Correct
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-destructive" /> Wrong
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-muted" /> Not attempted
            </li>
          </ul>

          <div className="mt-4 grid max-h-[420px] grid-cols-5 gap-2 overflow-y-auto pr-1">
            {record.answers.map((_, i) => (
              <button key={i} type="button" className={paletteClass(i)} onClick={() => setCurrent(i)}>
                {record.startNumber + i}
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
