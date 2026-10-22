import { isQuestionAttempt } from "../../mobile-tasks/src/domain/question-deletion";
import { isQuickRecallRecord } from "../../mobile-tasks/src/domain/quick-recall-history";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ResultScreen } from "@/components/exam/ResultScreen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getAttemptGroup,
  loadSubjects,
  getRecord,
  saveRecord,
  reevaluateRecord,
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
  const [reevaluating, setReevaluating] = useState(false);
  const reevaluationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRecord(getRecord(id));
    setAttempts(getAttemptGroup(id));
    setLoaded(true);
  }, [id]);

  useEffect(
    () => () => {
      if (reevaluationTimer.current) clearTimeout(reevaluationTimer.current);
    },
    [],
  );

  const reevaluate = () => {
    if (!record || reevaluating || isQuestionAttempt(record)) return;

    setReevaluating(true);
    reevaluationTimer.current = setTimeout(() => setReevaluating(false), 2000);

    const subject = loadSubjects().find((item) =>
      record.subjectId ? item.id === record.subjectId : item.name === record.subject,
    );
    const chapter = subject?.chapters.find((item) =>
      record.chapterId ? item.id === record.chapterId : item.name === record.chapter,
    );
    const exercise = chapter?.exercises.find((item) =>
      record.exerciseId ? item.id === record.exerciseId : item.name === record.exercise,
    );
    if (Array.isArray(exercise?.questions)) {
      window.alert("The original exercise is no longer book-based.");
      return;
    }
    const fullAnswerKey = exercise?.answerKey;
    if (!fullAnswerKey) {
      window.alert("The original book exercise has no answer key available.");
      return;
    }
    const answerKey = fullAnswerKey.slice(
      record.startNumber - 1,
      record.startNumber - 1 + record.answers.length,
    );
    if (answerKey.length !== record.answers.length || answerKey.some((answer) => !answer)) {
      window.alert("Complete the answer key for the attempted range first.");
      return;
    }
    const updatedRecord = reevaluateRecord({
      ...record,
      answerKey,
    });

    saveRecord(updatedRecord);
    setRecord(updatedRecord);
    setAttempts(getAttemptGroup(updatedRecord.id));
  };

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
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
            <Link to="/history">
              <ArrowLeft className="h-4 w-4" />
              Back to history
            </Link>
          </Button>
          {record ? (
            <div className="flex items-center gap-2">
              {!isQuestionAttempt(record) && !isQuickRecallRecord(record) && (
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
              )}
              {isQuickRecallRecord(record) ? (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" asChild>
                  <Link to="/quick-recall">
                    <RotateCcw className="h-4 w-4" />
                    Practice again
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" asChild>
                  <Link
                    to="/test"
                    search={{
                      attempt: isQuestionAttempt(record) ? record.id : undefined,
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
              )}
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
                    ? "border-2 border-[#93c5fd] bg-[#2563eb] text-white shadow-[0_0_0_2px_rgb(37_99_235_/_35%)]"
                    : "border-white/10 bg-[#121212] text-zinc-300 hover:border-white/25 hover:text-white",
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
      </div>
    </AppShell>
  );
}
