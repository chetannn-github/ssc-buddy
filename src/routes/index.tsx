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
const CONSISTENCY_ANIMATION_KEY = "cbt-consistency-animation-at";
const CONSISTENCY_ANIMATION_INTERVAL = 60 * 60 * 1000;

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
    <article className="card-surface group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-semibold tracking-tight",
              tone === "good" && "text-answered",
              tone === "bad" && "text-destructive",
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 transition-transform duration-200 group-hover:scale-105",
            tone === "good" && "bg-answered/10 text-answered",
            tone === "bad" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
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
  const [isConsistencyAnimating, setIsConsistencyAnimating] = useState(false);

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

  useEffect(() => {
    let stopAnimationTimer: ReturnType<typeof setTimeout> | undefined;
    let nextAnimationTimer: ReturnType<typeof setTimeout> | undefined;
    let repeatAnimationTimer: ReturnType<typeof setInterval> | undefined;

    const playAnimation = () => {
      setIsConsistencyAnimating(true);
      localStorage.setItem(CONSISTENCY_ANIMATION_KEY, String(Date.now()));
      stopAnimationTimer = setTimeout(() => setIsConsistencyAnimating(false), 2000);
    };
    const scheduleHourlyAnimation = () => {
      playAnimation();
      repeatAnimationTimer = setInterval(playAnimation, CONSISTENCY_ANIMATION_INTERVAL);
    };

    const lastAnimationAt = Number(localStorage.getItem(CONSISTENCY_ANIMATION_KEY));
    const elapsed = Date.now() - lastAnimationAt;
    if (!lastAnimationAt || elapsed >= CONSISTENCY_ANIMATION_INTERVAL) {
      scheduleHourlyAnimation();
    } else {
      nextAnimationTimer = setTimeout(
        scheduleHourlyAnimation,
        CONSISTENCY_ANIMATION_INTERVAL - elapsed,
      );
    }

    return () => {
      if (stopAnimationTimer) clearTimeout(stopAnimationTimer);
      if (nextAnimationTimer) clearTimeout(nextAnimationTimer);
      if (repeatAnimationTimer) clearInterval(repeatAnimationTimer);
    };
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
          className="card-surface grid gap-3 bg-surface/90 p-3 sm:grid-cols-3"
          aria-label="Dashboard filters"
        >
          <Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
            <SelectTrigger className="bg-muted/45">
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
            <SelectTrigger className="bg-muted/45">
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
            <SelectTrigger className="bg-muted/45">
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
              <article className="card-surface p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Subject Performance</h2>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
                    <BookOpen className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5 space-y-5">
                  {subjectStats.slice(0, 6).map((item) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div>
                          <strong>{item.name}</strong>
                          <span className="ml-2 text-muted-foreground">
                            {item.attempted} attempted
                          </span>
                        </div>
                        <strong className="text-sm">{formatPercent(item.accuracy)}</strong>
                      </div>
                      <div
                        className={cn(
                          "mt-2 h-2.5 overflow-hidden rounded-full",
                          item.accuracy === null ? "bg-muted" : "bg-destructive",
                        )}
                      >
                        <div
                          className="h-full rounded-l-full bg-answered"
                          style={{ width: `${item.accuracy ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card-surface p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Practice Consistency</h2>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 ring-1 ring-amber-500/15">
                    <Flame
                      className={cn(
                        "h-5 w-5 fill-amber-400 text-amber-500",
                        isConsistencyAnimating && "animate-consistency-flame",
                      )}
                    />
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-primary/5 p-3 ring-1 ring-primary/10">
                    <p className="text-xl font-semibold">{streaks.current}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Current streak</p>
                  </div>
                  <div className="rounded-xl bg-amber-400/10 p-3 ring-1 ring-amber-500/10">
                    <p className="text-xl font-semibold">{streaks.longest}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Longest streak</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 p-3 ring-1 ring-border/60">
                    <p className="text-xl font-semibold">{streaks.activeLast30}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Active days</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="card-surface p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent Activity</h2>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/history">
                    <HistoryIcon className="mr-1.5 h-4 w-4" />
                    View all
                  </Link>
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {recent.map((record) => {
                  const metrics = metricsForRecord(record);
                  return (
                    <Link
                      key={record.id}
                      to="/history/$id"
                      params={{ id: record.id }}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-muted/70 hover:text-primary hover:shadow-sm"
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold",
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
