import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DonutChart } from "@/components/exam/DonutChart";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
import { consumeLightPageLoader } from "@/lib/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { attemptKey, deleteRecord, loadHistory, type TestRecord } from "@/lib/exam";

function friendlyDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays < 7) return `${diffDays} days ago, ${time}`;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

const title = "History";
const description =
  "Browse every saved practice test: filter by subject and chapter, search, sort by latest or highest score, and open detailed results.";

export const Route = createFileRoute("/history/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: HistoryPage,
});

const ALL = "__all__";

function HistoryPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [subject, setSubject] = useState(ALL);
  const [chapter, setChapter] = useState(ALL);
  const [isLoading, setIsLoading] = useState(consumeLightPageLoader);

  useEffect(() => {
    setRecords(loadHistory());
    if (!isLoading) return;
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const subjects = useMemo(
    () => Array.from(new Set(records.map((r) => r.subject))).sort(),
    [records],
  );
  const chapters = useMemo(
    () =>
      Array.from(
        new Set(
          records.filter((r) => subject === ALL || r.subject === subject).map((r) => r.chapter),
        ),
      ).sort(),
    [records, subject],
  );

  const visible = useMemo(() => {
    const list = records.filter(
      (r) =>
        (subject === ALL || r.subject === subject) && (chapter === ALL || r.chapter === chapter),
    );
    const groups = new Map<string, TestRecord[]>();
    for (const r of list) {
      const key = attemptKey(r);
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }
    return Array.from(groups.values())
      .map((attempts) => {
        const sorted = [...attempts].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        return {
          attempts: sorted,
          latest: sorted[sorted.length - 1] as TestRecord,
          first: sorted[0] as TestRecord,
        };
      })
      .sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());
  }, [records, subject, chapter]);

  return (
    <AppShell title="Test History">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        {isLoading ? (
          <PageLoader label="Loading test history" />
        ) : (
          <div className="space-y-4">
            <div className="card-surface grid gap-3 p-4 sm:grid-cols-2">
              <Select
                value={subject}
                onValueChange={(v) => {
                  setSubject(v);
                  setChapter(ALL);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent className="history-select-content">
                  <SelectItem value={ALL}>All subjects</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={chapter} onValueChange={setChapter}>
                <SelectTrigger>
                  <SelectValue placeholder="All chapters" />
                </SelectTrigger>
                <SelectContent className="history-select-content">
                  <SelectItem value={ALL}>All chapters</SelectItem>
                  {chapters.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {visible.length === 0 ? (
              <div className="card-surface p-10 text-center">
                <p className="text-sm text-muted-foreground">No tests match your filters yet.</p>
                <Button className="mt-4" asChild>
                  <Link to="/test" search={{}}>
                    Start a test
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((g) => {
                  const r = g.latest;
                  const isReattempt = g.attempts.length > 1;
                  const correct = r.correct ?? 0;
                  const wrong = r.wrong ?? 0;
                  const unattempted = r.answers.filter((a) => !a).length;
                  const maxMarks = r.answers.length * r.marking.positive;

                  return (
                    <article
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate({ to: "/history/$id", params: { id: r.id } })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate({ to: "/history/$id", params: { id: r.id } });
                        }
                      }}
                      className="card-surface group flex cursor-pointer flex-col p-4 transition-shadow hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <div className="flex items-center gap-4">
                        <DonutChart
                          size={64}
                          thickness={9}
                          segments={[
                            { label: "Correct", value: correct, color: "var(--color-answered)" },
                            { label: "Wrong", value: wrong, color: "var(--color-destructive)" },
                            {
                              label: "Unattempted",
                              value: unattempted,
                              color: "var(--color-unvisited)",
                            },
                          ]}
                          centerValue={r.score ?? "—"}
                          centerSubValue={`/ ${maxMarks}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-sm font-semibold">{r.subject}</h2>
                            {isReattempt && (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {g.attempts.length} attempts
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{r.chapter}</p>
                          {r.exercise && (
                            <p className="truncate text-xs font-medium text-primary">
                              {r.exercise}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {friendlyDate(r.date)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({
                              to: "/test",
                              search: {
                                subject: r.subject,
                                chapter: r.chapter,
                                exercise: r.exercise,
                                minutes: r.durationMinutes ?? undefined,
                                start: r.startNumber,
                                count: r.answers.length,
                              },
                            });
                          }}
                        >
                          Reattempt
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRecord(r.id);
                            setRecords(loadHistory());
                          }}
                        >
                          {isReattempt ? "Delete latest" : "Delete"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
