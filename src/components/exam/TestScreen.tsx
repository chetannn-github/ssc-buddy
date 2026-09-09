import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatClock, type Option, type QuestionState } from "@/lib/exam";

const OPTIONS: Option[] = ["A", "B", "C", "D"];

type Props = {
  minutes: number;
  startNumber: number;
  subject: string;
  chapter: string;
  questionCount?: number | null;
  maxQuestions?: number | null;
  onSubmit: (answers: (Option | null)[], timeTakenSeconds: number) => void;
};

const blank = (visited: boolean): QuestionState => ({ answer: null, marked: false, visited });

export function TestScreen({
  minutes,
  startNumber,
  subject,
  chapter,
  questionCount = null,
  maxQuestions = null,
  onSubmit,
}: Props) {
  const total = minutes * 60;
  const [states, setStates] = useState<QuestionState[]>(() =>
    questionCount && questionCount > 0
      ? Array.from({ length: questionCount }, (_, i) => blank(i === 0))
      : [blank(true)],
  );
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(total);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submitted = useRef(false);

  const answers = useMemo(() => states.map((s) => s.answer), [states]);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const submit = (list: (Option | null)[], remaining: number) => {
    if (submitted.current) return;
    submitted.current = true;
    onSubmit(list, total - remaining);
  };

  useEffect(() => {
    if (seconds === 0) submit(answers, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const update = (index: number, patch: Partial<QuestionState>) =>
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const goTo = (index: number) => {
    if (index < 0 || index > states.length) return;
    if (index === states.length) {
      if (questionCount) return;
      if (maxQuestions && states.length >= maxQuestions) return;
      setStates((prev) => [...prev, blank(true)]);
    }
    else update(index, { visited: true });
    setCurrent(index);
  };

  const counts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    let notAnswered = 0;
    let notVisited = 0;
    states.forEach((s) => {
      if (s.marked) marked++;
      else if (s.answer) answered++;
      else if (!s.visited) notVisited++;
      else notAnswered++;
    });
    return { answered, marked, notAnswered, notVisited };
  }, [states]);

  const paletteClass = (s: QuestionState, i: number) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-md border text-xs font-semibold transition-all hover:scale-105",
      s.marked
        ? "border-marked bg-marked text-marked-foreground"
        : s.answer
          ? "border-answered bg-answered text-answered-foreground"
          : s.visited
            ? "border-border bg-unanswered text-unanswered-foreground"
            : "border-border bg-muted text-muted-foreground",
      i === current && "ring-2 ring-ring ring-offset-2",
    );

  const q: QuestionState = states[current] ?? blank(true);

  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-20 text-exam-header-foreground shadow-[var(--shadow-card)]"
        style={{ backgroundImage: "var(--gradient-header)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-xs font-semibold tracking-[0.14em] uppercase opacity-80">
              Mock Test
            </h1>
            <p className="truncate text-sm font-medium">
              {subject} · {chapter}
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 backdrop-blur-sm",
              seconds <= 60 && "animate-pulse border-destructive/50 bg-destructive/25",
            )}
          >
            <span className="text-[11px] tracking-wide uppercase opacity-70">Time left</span>
            <span className="font-mono text-base font-semibold tabular-nums">
              {formatClock(seconds)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[1fr_320px]">
        <section className="card-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <h2 className="text-lg font-semibold">Question {startNumber + current}</h2>
            <span className="text-sm text-muted-foreground">
              {questionCount
                ? `Question ${current + 1} of ${questionCount}`
                : maxQuestions
                  ? `Question ${current + 1} of ${maxQuestions}`
                  : `${states.length} attempted so far`}
            </span>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Read this question from your book and select the correct option.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => update(current, { answer: q.answer === opt ? null : opt })}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-4 text-left text-sm transition-all active:scale-[0.99]",
                  q.answer === opt
                    ? "border-primary bg-primary/10 font-semibold shadow-[var(--shadow-card)]"
                    : "border-border bg-surface hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    q.answer === opt
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {opt}
                </span>
                Option {opt}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => goTo(current - 1)} disabled={current === 0}>
              Previous
            </Button>
            <Button
              variant="outline"
              className={q.marked ? "border-marked text-marked" : ""}
              onClick={() => {
                update(current, { marked: !q.marked });
                goTo(current + 1);
              }}
            >
              {q.marked ? "Unmark Review" : "Mark for Review"}
            </Button>
            <Button variant="outline" onClick={() => update(current, { answer: null })}>
              Clear Response
            </Button>
            <Button
              onClick={() => goTo(current + 1)}
              disabled={
                current === states.length - 1 &&
                (Boolean(questionCount) ||
                  Boolean(maxQuestions && states.length >= maxQuestions))
              }
            >
              Save &amp; Next
            </Button>
            <Button variant="destructive" className="ml-auto" onClick={() => setConfirmOpen(true)}>
              Submit Test
            </Button>
          </div>
        </section>

        <aside className="card-surface h-fit p-4 lg:sticky lg:top-24">
          <h3 className="text-sm font-semibold">Question Palette</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-answered" /> Answered ({counts.answered})
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-border bg-unanswered" /> Not
              answered ({counts.notAnswered})
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-marked" /> Marked ({counts.marked})
            </li>
            {questionCount ? (
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-muted" /> Not visited ({counts.notVisited})
              </li>
            ) : null}
          </ul>

          <div className="mt-4 grid max-h-[420px] grid-cols-5 gap-2 overflow-y-auto pr-1">
            {states.map((s, i) => (
              <button key={i} type="button" className={paletteClass(s, i)} onClick={() => goTo(i)}>
                {startNumber + i}
              </button>
            ))}
          </div>
        </aside>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit the test?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.answered + counts.marked} of {states.length} questions have a marked answer.
              You cannot return to the test after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep solving</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(answers, seconds)}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
