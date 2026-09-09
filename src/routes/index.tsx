import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Flame,
  History as HistoryIcon,
  ListChecks,
  PlayCircle,
  Target,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aggregateRecords,
  filterByTime,
  getStreaks,
  metricsForRecord,
  type TimeRange,
} from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { cn } from "@/lib/utils";

const title = "Performance Dashboard — CBT MCQ Practice";
const description =
  "Track questions attempted, accuracy, scores, strong chapters and improvement across CBT practice tests.";
const ALL = "__all__";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Dashboard,
});

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function friendlyDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type MetricCardProps = {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "good" | "bad";
};

function MetricCard({ label, value, icon: Icon, tone = "default" }: MetricCardProps) {
  return (
    <article className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tracking-tight",
              tone === "good" && "text-answered",
              tone === "bad" && "text-destructive",
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary",
            tone === "good" && "bg-answered/10 text-answered",
            tone === "bad" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </article>
  );
}

function Dashboard() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState<TimeRange>("all");
  const [subject, setSubject] = useState(ALL);
  const [chapter, setChapter] = useState(ALL);

  useEffect(() => {
    const refresh = () => {
      setRecords(loadHistory());
      setLoaded(true);
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "cbt-history") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const timeRecords = useMemo(() => filterByTime(records, range), [records, range]);
  const subjects = useMemo(
    () => Array.from(new Set(timeRecords.map((record) => record.subject))).sort(),
    [timeRecords],
  );
  const chapters = useMemo(
    () =>
      Array.from(
        new Set(
          timeRecords
            .filter((record) => subject === ALL || record.subject === subject)
            .map((record) => record.chapter),
        ),
      ).sort(),
    [timeRecords, subject],
  );
  const filtered = useMemo(
    () =>
      timeRecords.filter(
        (record) =>
          (subject === ALL || record.subject === subject) &&
          (chapter === ALL || record.chapter === chapter),
      ),
    [timeRecords, subject, chapter],
  );

  const totals = useMemo(() => aggregateRecords(filtered), [filtered]);
  const streaks = useMemo(() => getStreaks(filtered), [filtered]);
  const recent = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    [filtered],
  );
  const subjectStats = useMemo(
    () =>
      Array.from(new Set(filtered.map((record) => record.subject)))
        .map((name) => ({
          name,
          ...aggregateRecords(filtered.filter((record) => record.subject === name)),
        }))
        .sort((a, b) => b.attempted - a.attempted),
    [filtered],
  );
  const clearFilters = () => {
    setRange("all");
    setSubject(ALL);
    setChapter(ALL);
  };

  if (loaded && records.length === 0) {
    return (
      <AppShell title="Performance Dashboard">
        <div className="card-surface flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BarChart3 className="h-8 w-8" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">Start your first test</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Complete a test and your accuracy, strong chapters and progress will appear here.
          </p>
          <Button className="mt-6 gap-2" asChild>
            <Link to="/test" search={{}}>
              <PlayCircle className="h-4 w-4" /> Start New Test
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Performance Dashboard">
      <div className="space-y-5">
        <section
          className="card-surface grid gap-3 p-4 sm:grid-cols-3"
          aria-label="Dashboard filters"
        >
          <Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={subject}
            onValueChange={(value) => {
              setSubject(value);
              setChapter(ALL);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {subjects.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={chapter} onValueChange={setChapter}>
            <SelectTrigger>
              <SelectValue placeholder="All chapters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All chapters</SelectItem>
              {chapters.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {filtered.length === 0 ? (
          <section className="card-surface p-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">No matching practice data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              No tests match the selected filters.
            </p>
            <Button className="mt-4" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total Tests"
                value={formatNumber(totals.tests)}
                icon={ListChecks}
              />
              <MetricCard
                label="Questions Attempted"
                value={formatNumber(totals.attempted)}
                icon={Target}
              />
              <MetricCard
                label="Correct Answers"
                value={formatNumber(totals.correct)}
                icon={CheckCircle2}
                tone="good"
              />
              <MetricCard
                label="Wrong Answers"
                value={formatNumber(totals.wrong)}
                icon={XCircle}
                tone="bad"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="card-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Subject Performance</h2>
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-4 space-y-4">
                  {subjectStats.slice(0, 6).map((item) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div>
                          <strong>{item.name}</strong>
                          <span className="ml-2 text-muted-foreground">
                            {item.attempted} attempted
                          </span>
                        </div>
                        <strong>{formatPercent(item.accuracy)}</strong>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-answered"
                          style={{ width: `${item.accuracy ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Practice Consistency</h2>
                  <Flame className="animate-consistency-flame h-5 w-5 fill-amber-400 text-amber-500" />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xl font-semibold">{streaks.current}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Current streak</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xl font-semibold">{streaks.longest}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Longest streak</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xl font-semibold">{streaks.activeLast30}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Active days</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Recent Activity</h2>
                  <p className="text-xs text-muted-foreground">Your latest practice tests</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/history">
                    <HistoryIcon className="mr-1.5 h-4 w-4" />
                    View all
                  </Link>
                </Button>
              </div>
              <div className="mt-3 divide-y divide-border">
                {recent.map((record) => {
                  const metrics = metricsForRecord(record);
                  return (
                    <Link
                      key={record.id}
                      to="/history/$id"
                      params={{ id: record.id }}
                      className="flex items-center gap-3 py-3 first:pt-1 hover:text-primary"
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          metrics.accuracy !== null && metrics.accuracy >= 60
                            ? "bg-answered/10 text-answered"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {record.score ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">
                          {record.subject} · {record.chapter}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {record.exercise ?? "Exercise 1"} · {friendlyDate(record.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold">{formatPercent(metrics.accuracy)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {metrics.correct} correct · {metrics.wrong} wrong
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
