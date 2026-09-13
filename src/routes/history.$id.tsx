import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenCheck, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ResultScreen } from "@/components/exam/ResultScreen";
import { SolutionScreen } from "@/components/exam/SolutionScreen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  computeScore,
  getAttemptGroup,
  getExercise,
  getRecord,
  saveRecord,
  type TestRecord,
} from "@/lib/exam";

const title = "Test Detail";
const description =
  "Detailed result of a saved practice test: all marked answers, correct and wrong counts, marking scheme and final score.";

export const Route = createFileRoute("/history/$id")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: ResultDetail,
});

function ResultDetail() {
  const { id } = Route.useParams();
  const [record, setRecord] = useState<TestRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [attempts, setAttempts] = useState<TestRecord[]>([]);
  const [solution, setSolution] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const reevaluationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRecord(getRecord(id));
    setAttempts(getAttemptGroup(id));
    setSolution(false);
    setLoaded(true);
  }, [id]);

  useEffect(
    () => () => {
      if (reevaluationTimer.current) clearTimeout(reevaluationTimer.current);
    },
    [],
  );

  const reevaluate = () => {
    if (!record || reevaluating) return;

    setReevaluating(true);
    reevaluationTimer.current = setTimeout(() => setReevaluating(false), 2000);

    const exercise = getExercise(record.subject, record.chapter, record.exercise);
    const fullAnswerKey = exercise?.answerKey;
    if (!fullAnswerKey) return;

    const answerKey = fullAnswerKey.slice(
      record.startNumber - 1,
      record.startNumber - 1 + record.answers.length,
    );
    const evaluations = record.answers.map((answer, index) => {
      const correctAnswer = answerKey[index];
      if (!answer || !correctAnswer) return null;
      return answer === correctAnswer ? "correct" : "incorrect";
    });
    const correct = evaluations.filter((verdict) => verdict === "correct").length;
    const wrong = evaluations.filter((verdict) => verdict === "incorrect").length;
    const updatedRecord: TestRecord = {
      ...record,
      answerKey,
      evaluations,
      correct,
      wrong,
      score: computeScore(correct, wrong, record.marking),
    };

    saveRecord(updatedRecord);
    setRecord(updatedRecord);
    setAttempts(getAttemptGroup(updatedRecord.id));
  };

  if (solution && record) {
    return <SolutionScreen key={record.id} record={record} onExit={() => setSolution(false)} />;
  }

  return (
    <AppShell
      title={record ? record.subject : "Result details"}
      subtitle={
        record
          ? record.exercise
            ? `${record.chapter} · ${record.exercise}`
            : record.chapter
          : undefined
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" className="h-8 w-fit gap-1.5 px-2 text-xs" asChild>
          <Link to="/history">
            <ArrowLeft className="h-4 w-4" />
            Back to history
          </Link>
        </Button>
        {record ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={reevaluate}
              disabled={reevaluating}
            >
              <RefreshCw className={cn("h-4 w-4", reevaluating && "animate-spin")} />
              Reevaluate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => setSolution(true)}
            >
              <BookOpenCheck className="h-4 w-4" />
              View Solution
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" asChild>
              <Link
                to="/test"
                search={{
                  subject: record.subject,
                  chapter: record.chapter,
                  exercise: record.exercise,
                  minutes: record.durationMinutes ?? undefined,
                  start: record.startNumber,
                  count: record.answers.length,
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reattempt test
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {attempts.length > 1 && (
        <div className="card-surface mb-3 flex flex-wrap items-center gap-1.5 p-3">
          {attempts.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate({ to: "/history/$id", params: { id: a.id } })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                a.id === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary hover:text-primary",
              )}
            >
              Attempt {i + 1} · {a.score ?? "—"}
            </button>
          ))}
        </div>
      )}

      {record ? (
        <ResultScreen key={record.id} record={record} attempts={attempts} />
      ) : loaded ? (
        <div className="card-surface p-10 text-center">
          <p className="text-sm text-muted-foreground">This test result was not found.</p>
          <Button className="mt-4" asChild>
            <Link to="/history">Back to history</Link>
          </Button>
        </div>
      ) : null}
    </AppShell>
  );
}
