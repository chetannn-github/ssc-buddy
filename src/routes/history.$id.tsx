import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpenCheck, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ResultScreen } from "@/components/exam/ResultScreen";
import { SolutionScreen } from "@/components/exam/SolutionScreen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAttemptGroup, getRecord, type TestRecord } from "@/lib/exam";

const title = "Test Result Details — MCQ Practice";
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
  const navigate = useNavigate();

  useEffect(() => {
    setRecord(getRecord(id));
    setAttempts(getAttemptGroup(id));
    setSolution(false);
    setLoaded(true);
  }, [id]);

  if (solution && record) {
    return <SolutionScreen key={record.id} record={record} onExit={() => setSolution(false)} />;
  }

  return (
    <AppShell
      title={record ? record.subject : "Result details"}
      subtitle={record ? record.chapter : undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
          <Link to="/history">
            <ArrowLeft className="h-4 w-4" />
            Back to history
          </Link>
        </Button>
        {record ? (
          <div className="flex items-center gap-2">
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
                to="/"
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
        <ResultScreen key={record.id} record={record} />
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
