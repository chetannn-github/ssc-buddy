import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { PageLoader } from "@/components/ui/page-loader";
import { consumeLightPageLoader } from "@/lib/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  attemptKey,
  deleteRecord,
  loadHistory,
  onPracticePersist,
  type TestRecord,
} from "@/lib/exam";
import { isQuickRecallRecord } from "../../mobile-tasks/src/domain/quick-recall-history";

function friendlyDate(timestamp: string, fallbackDate?: string, showTime = true) {
  // Android records use `date` as a local calendar key (YYYY-MM-DD) and keep
  // the real timestamp in `createdAt`. Parsing the calendar key as ISO made
  // every mobile-synced attempt look like 5:30 AM in India (UTC offset).
  const hasClock = timestamp.includes("T");
  const source = hasClock ? timestamp : `${fallbackDate ?? timestamp}T00:00:00`;
  const d = new Date(source);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  const time = hasClock && showTime
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  if (diffDays === 0) return time ? `Today, ${time}` : "Today";
  if (diffDays === 1) return time ? `Yesterday, ${time}` : "Yesterday";
  if (diffDays < 7) return time ? `${diffDays} days ago, ${time}` : `${diffDays} days ago`;
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(consumeLightPageLoader);

  useEffect(() => {
    setRecords(loadHistory());
    if (!isLoading) return;
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, [isLoading]);
  useEffect(
    () =>
      onPracticePersist((key) => {
        if (key === "cbt-history") setRecords(loadHistory());
      }),
    [],
  );

  const sessionRecords = records;

  const subjects = useMemo(
    () => Array.from(new Set(sessionRecords.map((r) => r.subject))).sort(),
    [sessionRecords],
  );
  const chapters = useMemo(
    () =>
      Array.from(
        new Set(
          sessionRecords
            .filter((r) => subject === ALL || r.subject === subject)
            .map((r) => r.chapter)
            .filter(Boolean),
        ),
      ).sort(),
    [sessionRecords, subject],
  );

  const visible = useMemo(() => {
    const list = sessionRecords.filter(
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
  }, [sessionRecords, subject, chapter]);

  return (
    <AppShell title="Test History">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        {isLoading ? (
          <PageLoader label="Loading test history" />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#161616] p-3 sm:grid-cols-2">
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
                  const isRecall = isQuickRecallRecord(r);
                  const isReattempt = !isRecall && g.attempts.length > 1;
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
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate({ to: "/history/$id", params: { id: r.id } });
                        }
                      }}
                      className="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-white/10 bg-[#161616] p-4 transition-colors hover:border-white/20 hover:bg-[#1a1a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      <div className="flex min-h-20 items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-sm font-semibold">{r.subject}</h2>
                            {isReattempt && (
                              <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                {g.attempts.length} attempts
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-400">
                            {isRecall ? `Daily summary · ${r.answers.length} questions` : r.chapter}
                          </p>
                          {!isRecall && r.exercise && (
                            <p className="mt-0.5 truncate text-xs text-zinc-300">
                              {r.exercise}
                            </p>
                          )}
                          <p className="mt-2 text-[11px] text-zinc-500">
                            {isRecall
                              ? friendlyDate(r.date, undefined, false)
                              : friendlyDate(r.createdAt ?? r.date, r.date, false)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <p className="text-xl font-semibold leading-tight tracking-tight">{r.score ?? "—"}</p>
                          <p className="mt-1 text-[10px] text-zinc-500">/ {maxMarks} marks</p>
                        </div>
                      </div>

                      <dl className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/5 py-2.5">
                        {[{label:"Correct",value:correct,color:"text-emerald-400"},{label:"Wrong",value:wrong,color:"text-rose-400"},{label:"Skipped",value:unattempted,color:"text-zinc-400"}].map(item=><div key={item.label} className="text-center">
                          <dt className="text-[10px] text-zinc-500">{item.label}</dt>
                          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${item.color}`}>{item.value}</dd>
                        </div>)}
                      </dl>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 rounded-full bg-[#f6f8f2] px-3 text-xs font-medium text-[#171717] hover:bg-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isRecall) {
                              void navigate({ to: "/quick-recall" });
                              return;
                            }
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
                          <RotateCcw className="h-3 w-3" />{isRecall ? "Practice again" : "Reattempt"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-full p-0 text-zinc-500 hover:bg-rose-400/10 hover:text-rose-300"
                          aria-label={isReattempt ? "Delete latest attempt" : "Delete attempt"}
                          title={isReattempt ? "Delete latest attempt" : "Delete attempt"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent aria-describedby={undefined} className="w-[calc(100%-3rem)] max-w-sm rounded-[28px] border-0 bg-[#181818] p-7 text-zinc-100 sm:rounded-[28px]">
          <AlertDialogTitle className="text-left text-xl font-semibold leading-snug">Are you sure you want to delete this attempt?</AlertDialogTitle>
          <div className="mt-8 flex items-center justify-end gap-4">
            <AlertDialogCancel className="mt-0 border-0 bg-transparent px-2 text-zinc-100 shadow-none hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-transparent px-2 text-[#ff1744] shadow-none hover:bg-white/5" onClick={() => {
              if (!pendingDelete) return;
              deleteRecord(pendingDelete);
              setRecords(loadHistory());
              setPendingDelete(null);
            }}>Yes, delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
