import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DonutChart } from "@/components/exam/DonutChart";
import { cn } from "@/lib/utils";
import { computeScore, type Option, type TestRecord, type Verdict } from "@/lib/exam";

type Props = {
  record: TestRecord;
  onRestart?: () => void;
  attempts?: TestRecord[];
};

type AnswerFilter = "all" | "correct" | "incorrect" | "unattempted";

function AttemptMarksChart({ attempts, activeId }: { attempts: TestRecord[]; activeId: string }) {
  const scores = attempts.map((attempt) => attempt.score ?? 0);
  const low = Math.min(0, ...scores);
  const high = Math.max(0, ...scores);
  const range = Math.max(1, high - low);
  const width = 248;
  const height = 72;
  const pointX = (index: number) => 8 + (index / Math.max(1, attempts.length - 1)) * 232;
  const pointY = (score: number) => 10 + ((high - score) / range) * 48;
  const points = scores.map((score, index) => `${pointX(index)},${pointY(score)}`).join(" ");
  const currentScore = attempts.find((attempt) => attempt.id === activeId)?.score ?? "—";

  return (
    <div className="mt-3 w-full border-t border-border pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Marks by attempt
        </p>
        <span className="text-[10px] text-muted-foreground">
          {low} to {high}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[72px] w-full"
        role="img"
        aria-label="Marks across attempts"
      >
        <line
          x1="8"
          x2="240"
          y1={pointY(0)}
          y2={pointY(0)}
          stroke="var(--color-border)"
          strokeDasharray="3 3"
        />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-primary)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
        {attempts.map((attempt, index) => {
          const score = scores[index] ?? 0;
          const isActive = attempt.id === activeId;
          return (
            <g key={attempt.id}>
              <circle
                cx={pointX(index)}
                cy={pointY(score)}
                r={isActive ? 4.5 : 3}
                fill={isActive ? "var(--color-primary)" : "var(--color-surface)"}
                stroke="var(--color-primary)"
                strokeWidth="2"
              />
              <text
                x={pointX(index)}
                y="70"
                fill="var(--color-muted-foreground)"
                fontSize="9"
                textAnchor="middle"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Attempt 1</span>
        <span>Current: {currentScore}</span>
      </div>
    </div>
  );
}

export function ResultScreen({ record, onRestart, attempts = [] }: Props) {
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");
  const total = record.answers.length;
  const verdicts = useMemo<Verdict[]>(
    () =>
      record.answers.map((a, i) => {
        if (!a) return null;
        const key = record.answerKey?.[i];
        if (!key) return record.evaluations?.[i] ?? null;
        return a === key ? "correct" : "incorrect";
      }),
    [record.answers, record.answerKey, record.evaluations],
  );

  const c = useMemo(() => verdicts.filter((v) => v === "correct").length, [verdicts]);
  const w = useMemo(() => verdicts.filter((v) => v === "incorrect").length, [verdicts]);
  const checked = c + w;
  const attempted = record.answers.filter(Boolean).length;
  const unattempted = total - attempted;
  const unattemptedNumbers = useMemo(
    () =>
      record.answers
        .map((a, i) => (!a ? record.startNumber + i : null))
        .filter((n): n is number => n !== null),
    [record.answers, record.startNumber],
  );
  const remaining = attempted - checked;
  const score = computeScore(c, w, record.marking);
  const maxMarks = total * record.marking.positive;
  const percent = attempted === 0 ? 100 : Math.round((checked / attempted) * 100);
  const complete = remaining === 0;
  const filteredAnswers = useMemo(
    () =>
      record.answers
        .map((answer, index) => ({ answer, index, verdict: verdicts[index] }))
        .filter(({ answer, verdict }) => {
          if (answerFilter === "all") return true;
          if (answerFilter === "unattempted") return !answer;
          return verdict === answerFilter;
        }),
    [answerFilter, record.answers, verdicts],
  );

  const filterClass = (filter: AnswerFilter, tone: "good" | "bad" | "neutral") =>
    cn(
      "cursor-pointer rounded-full border px-2 py-0.5 transition-all",
      tone === "good" && "border-answered/35 bg-answered/15 text-answered",
      tone === "bad" && "border-destructive/35 bg-destructive/15 text-destructive",
      tone === "neutral" && "border-white/12 bg-white/5 text-muted-foreground",
      answerFilter === filter && "border-[#60a5fa] bg-[#2563eb] text-white shadow-sm",
    );

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="card-surface flex items-center gap-4 p-3 sm:p-4 lg:sticky lg:top-4 lg:flex-col lg:items-start">
        <DonutChart
          size={80}
          thickness={11}
          segments={[
            { label: "Correct", value: c, color: "var(--color-answered)" },
            { label: "Wrong", value: w, color: "var(--color-destructive)" },
            { label: "Unattempted", value: unattempted, color: "var(--color-unvisited)" },
          ]}
          centerValue={score ?? 0}
          centerSubValue={`/ ${maxMarks}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              className={filterClass("all", "neutral")}
              onClick={() => setAnswerFilter("all")}
            >
              All {total}
            </button>
            <button
              type="button"
              className={filterClass("correct", "good")}
              onClick={() =>
                setAnswerFilter((current) => (current === "correct" ? "all" : "correct"))
              }
            >
              ✓ {c}
            </button>
            <button
              type="button"
              className={filterClass("incorrect", "bad")}
              onClick={() =>
                setAnswerFilter((current) => (current === "incorrect" ? "all" : "incorrect"))
              }
            >
              ✗ {w}
            </button>
            <button
              type="button"
              className={filterClass("unattempted", "neutral")}
              onClick={() =>
                setAnswerFilter((current) => (current === "unattempted" ? "all" : "unattempted"))
              }
            >
              {unattempted} skip
            </button>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {complete ? "Evaluation complete" : `${percent}% checked`}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5 border-t border-border pt-2">
            <span className="text-[10px] text-muted-foreground">Accuracy</span>
            <span className="text-sm font-semibold text-foreground">
              {checked === 0 ? "—" : `${Math.round((c / checked) * 100)}%`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {checked > 0 && `(${c}/${checked} checked)`}
            </span>
          </div>
          {attempts.length > 1 && <AttemptMarksChart attempts={attempts} activeId={record.id} />}
        </div>
      </div>

      <div className="card-surface p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium text-muted-foreground">Answers</h2>
          <span className="text-[10px] text-muted-foreground">
            {answerFilter === "all" ? total : filteredAnswers.length} of {total} questions
          </span>
        </div>
        {unattemptedNumbers.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 p-2">
            <span className="text-[10px] font-medium text-muted-foreground">Unattempted:</span>
            {unattemptedNumbers.map((n) => (
              <span
                key={n}
                className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
              >
                Q{n}
              </span>
            ))}
          </div>
        )}
        <div className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
          {filteredAnswers.map(({ answer: a, index: i, verdict: v }) => {
            const attemptedRow = Boolean(a);
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors",
                  !attemptedRow
                    ? "border-dashed border-border bg-muted/40"
                    : v === "correct"
                      ? "border-answered bg-answered/10"
                      : v === "incorrect"
                        ? "border-destructive bg-destructive/10"
                        : "border-border bg-background",
                )}
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Q{record.startNumber + i}
                  </span>
                  <span className={cn("text-sm", a ? "font-semibold" : "text-muted-foreground")}>
                    {a ?? "—"}
                  </span>
                  {record.answerKey?.[i] ? (
                    <span className="text-[10px] text-muted-foreground">
                      key {record.answerKey[i]}
                    </span>
                  ) : null}
                </div>

                {attemptedRow ? (
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      v === "correct"
                        ? "text-answered"
                        : v === "incorrect"
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {v === "correct" ? "✓" : v === "incorrect" ? "✗" : "—"}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">0 marks</span>
                )}
              </div>
            );
          })}
          {filteredAnswers.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No questions in this filter.
            </p>
          )}
        </div>
        {onRestart && (
          <Button className="mt-4" size="sm" onClick={onRestart}>
            Start a new test
          </Button>
        )}
      </div>
    </div>
  );
}
