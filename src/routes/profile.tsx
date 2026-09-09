import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, CalendarDays, CheckCircle2, Flame, Target, XCircle } from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { aggregateRecords, getStreaks, metricsForRecord } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { cn } from "@/lib/utils";

const title = "Practice Profile — MCQ Practice";
const description = "Yearly practice activity, streaks and performance summary.";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: Profile,
});

function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof BarChart3;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <article className="card-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              tone === "good" && "text-answered",
              tone === "bad" && "text-destructive",
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary",
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

function ActivityHeatmap({ records }: { records: TestRecord[] }) {
  const { days, monthLabels, totalActivity, activeDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (364 - index));
      return date;
    });
    const activity = new Map<string, number>();
    records.forEach((record) => {
      const key = localDay(new Date(record.date));
      activity.set(
        key,
        (activity.get(key) ?? 0) + Math.max(1, record.answers.filter(Boolean).length),
      );
    });
    const values = entries.map((date) => activity.get(localDay(date)) ?? 0);
    const maximum = Math.max(...values, 1);
    const labels = entries
      .map((date, index) => ({ date, index }))
      .filter(
        ({ date, index }) => index === 0 || date.getMonth() !== entries[index - 1]?.getMonth(),
      )
      .map(({ date, index }) => ({
        label: date.toLocaleDateString(undefined, { month: "short" }),
        index,
      }));

    return {
      days: entries.map((date, index) => ({ date, value: values[index] ?? 0, maximum })),
      monthLabels: labels,
      totalActivity: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter(Boolean).length,
    };
  }, [records]);

  return (
    <section className="card-surface overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Yearly activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalActivity} questions practiced in the last year
          </p>
        </div>
        <div className="flex gap-4 text-right text-xs">
          <div>
            <p className="font-semibold text-foreground">{activeDays}</p>
            <p className="text-muted-foreground">Active days</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">{days.length}</p>
            <p className="text-muted-foreground">Days tracked</p>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="min-w-[720px]">
          <div className="relative mb-2 h-4 text-[10px] text-muted-foreground">
            {monthLabels.map(({ label, index }) => (
              <span
                key={`${label}-${index}`}
                className="absolute"
                style={{ left: `${(index / 364) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {days.map(({ date, value, maximum }) => {
              const intensity = value === 0 ? 0 : Math.min(4, Math.ceil((value / maximum) * 4));
              return (
                <span
                  key={localDay(date)}
                  title={`${formatDate(localDay(date))}: ${value} question${value === 1 ? "" : "s"}`}
                  className={cn(
                    "h-3 w-3 rounded-[3px] ring-1 ring-inset ring-border/50",
                    intensity === 0 && "bg-muted",
                    intensity === 1 && "bg-amber-200",
                    intensity === 2 && "bg-amber-300",
                    intensity === 3 && "bg-amber-400",
                    intensity === 4 && "bg-amber-500",
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        Less
        {[0, 1, 2, 3, 4].map((intensity) => (
          <span
            key={intensity}
            className={cn(
              "h-3 w-3 rounded-[3px]",
              intensity === 0 && "bg-muted",
              intensity === 1 && "bg-amber-200",
              intensity === 2 && "bg-amber-300",
              intensity === 3 && "bg-amber-400",
              intensity === 4 && "bg-amber-500",
            )}
          />
        ))}
        More
      </div>
    </section>
  );
}

function Profile() {
  const records = useMemo(() => loadHistory(), []);
  const totals = useMemo(() => aggregateRecords(records), [records]);
  const streaks = useMemo(() => getStreaks(records), [records]);
  const subjectStats = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.subject))).map((subject) => ({
        subject,
        ...aggregateRecords(records.filter((record) => record.subject === subject)),
      })),
    [records],
  );
  const recent = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [records],
  );

  return (
    <AppShell title="Practice Profile" subtitle="Your activity and performance centre">
      <div className="space-y-5">
        <section className="card-surface overflow-hidden bg-gradient-to-br from-amber-50 to-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Practice consistency
              </p>
              <h2 className="mt-1 text-2xl font-semibold">Keep your streak alive</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every practice test adds to your yearly activity.
              </p>
            </div>
            <div
              className={cn(
                "flex h-24 w-24 flex-col items-center justify-center rounded-full border-4",
                streaks.current > 0
                  ? "border-amber-400 bg-amber-100 text-amber-700 shadow-[0_0_28px_oklch(0.82_0.17_85_/_0.42)]"
                  : "border-muted bg-muted/60 text-muted-foreground",
              )}
            >
              <Flame
                className={cn("h-6 w-6", streaks.current > 0 && "fill-amber-400 text-amber-500")}
              />
              <span className="text-2xl font-semibold">{streaks.current}</span>
              <span className="text-[10px] font-medium">days</span>
            </div>
          </div>
        </section>

        <ActivityHeatmap records={records} />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total tests" value={totals.tests} icon={BarChart3} />
          <SummaryCard label="Questions attempted" value={totals.attempted} icon={Target} />
          <SummaryCard
            label="Correct answers"
            value={totals.correct}
            icon={CheckCircle2}
            tone="good"
          />
          <SummaryCard label="Wrong answers" value={totals.wrong} icon={XCircle} tone="bad" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="card-surface p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Subject performance</h2>
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-5 space-y-4">
              {subjectStats.length ? (
                subjectStats.map((item) => (
                  <div key={item.subject}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{item.subject}</span>
                      <span className="font-semibold">
                        {item.accuracy === null ? "—" : `${Math.round(item.accuracy)}%`}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-destructive">
                      <div
                        className="h-full rounded-l-full bg-answered"
                        style={{ width: `${item.accuracy ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete a test to see subject performance.
                </p>
              )}
            </div>
          </article>

          <article className="card-surface p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Performance summary</h2>
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-muted/60 p-3">
                <dt className="text-[10px] text-muted-foreground">Current streak</dt>
                <dd className="mt-1 text-xl font-semibold">{streaks.current}</dd>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <dt className="text-[10px] text-muted-foreground">Longest streak</dt>
                <dd className="mt-1 text-xl font-semibold">{streaks.longest}</dd>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <dt className="text-[10px] text-muted-foreground">Active days</dt>
                <dd className="mt-1 text-xl font-semibold">{streaks.activeLast30}</dd>
              </div>
            </dl>
            <Button className="mt-5 w-full" asChild>
              <Link to="/test" search={{}}>
                Start a test
              </Link>
            </Button>
          </article>
        </section>

        <section className="card-surface p-5 sm:p-6">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <div className="mt-3 divide-y divide-border">
            {recent.length ? (
              recent.map((record) => {
                const metrics = metricsForRecord(record);
                return (
                  <Link
                    key={record.id}
                    to="/history/$id"
                    params={{ id: record.id }}
                    className="flex items-center justify-between gap-3 py-3 hover:text-primary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {record.subject} · {record.chapter}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.exercise ?? "Exercise 1"} · {formatDate(record.date)}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold">{record.score ?? "—"} marks</p>
                      <p className="text-muted-foreground">
                        {metrics.accuracy === null ? "—" : `${Math.round(metrics.accuracy)}%`}
                      </p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No practice recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
