import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
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
import {
  attemptKey,
  loadHistory,
  onPracticePersist,
  type TestRecord,
} from "@/lib/exam";
import { isQuickRecallRecord } from "../../mobile-tasks/src/domain/quick-recall-history";
import { HISTORY_TIME_RANGES, matchesHistoryTimeRange, type HistoryTimeRange } from "../../mobile-tasks/src/domain/practice-history-range";

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
  "Browse saved practice tests by time range and subject, and open detailed results.";

export const Route = createFileRoute("/history/")({
  head: () => ({
    meta: [
      { title: `${title} · SSC Buddy` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} · SSC Buddy` },
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
  const [timeRange, setTimeRange] = useState<HistoryTimeRange>("today");
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
  const visible = useMemo(() => {
    const list = sessionRecords.filter(
      (r) =>
        (subject === ALL || r.subject === subject) && matchesHistoryTimeRange(r, timeRange),
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
  }, [sessionRecords, subject, timeRange]);

  return (
    <AppShell title="Test History">
      <div className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        {isLoading ? (
          <PageLoader label="Loading test history" />
        ) : (
          <div className="space-y-4">
            <div aria-label="History filters" className="web-sticky-section web-history-filters rounded-2xl">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#161616] p-3">
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as HistoryTimeRange)}>
                <SelectTrigger aria-label="Time range"><SelectValue placeholder="Today" /></SelectTrigger>
                <SelectContent className="history-select-content">
                  {HISTORY_TIME_RANGES.map(({value,label}) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={subject}
                onValueChange={setSubject}
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
            </div>
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
