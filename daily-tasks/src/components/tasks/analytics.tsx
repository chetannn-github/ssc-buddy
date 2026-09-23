import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBJECTS } from "@/lib/syllabus";
import {
  RANGE_OPTIONS,
  filterTasks,
  formatDayLabel,
  formatDuration,
  groupBy,
  rangeBounds,
  summarize,
  type RangeKey,
  type Task,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function BarRow({
  label,
  tasks,
  minutes,
  max,
}: {
  label: string;
  tasks: number;
  minutes: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {tasks} tasks · <span className="text-primary">{formatDuration(minutes)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${max ? Math.max(4, (minutes / max) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

export function Analytics({ tasks }: { tasks: Task[] }) {
  const [range, setRange] = useState<RangeKey>("week");
  const [subject, setSubject] = useState("All Subjects");

  const scoped = useMemo(
    () => filterTasks(tasks, rangeBounds(range), subject),
    [tasks, range, subject],
  );
  const stats = summarize(scoped);
  const bySubject = groupBy(scoped, (t) => t.subject);
  const byType = groupBy(scoped, (t) => t.type);
  const maxSubject = bySubject[0]?.minutes ?? 0;
  const maxType = byType[0]?.minutes ?? 0;

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of scoped) {
      map.set(t.date, [...(map.get(t.date) ?? []), t]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [scoped]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Analytics &amp; History</h2>
        <div className="w-full sm:w-52">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Subjects">All Subjects</SelectItem>
              {SUBJECTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setRange(o.key)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              range === o.key
                ? "border-primary/50 bg-primary-soft text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {scoped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
          <p className="font-medium text-foreground">Not enough data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a few tasks to see your study analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total Study Time" value={formatDuration(stats.totalMinutes)} />
            <StatTile label="Tasks Completed" value={String(stats.completed)} />
            <StatTile label="Not Completed" value={String(stats.pending)} />
            <StatTile label="Completion Rate" value={`${stats.completionRate}%`} />
          </div>

          {bySubject.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="surface-card space-y-4 p-5">
                <h3 className="text-sm font-semibold text-foreground">Subject-wise time</h3>
                <div className="space-y-3.5">
                  {bySubject.map((r) => (
                    <BarRow
                      key={r.key}
                      label={r.key}
                      tasks={r.tasks}
                      minutes={r.minutes}
                      max={maxSubject}
                    />
                  ))}
                </div>
              </div>

              <div className="surface-card space-y-4 p-5">
                <h3 className="text-sm font-semibold text-foreground">Task-type breakdown</h3>
                <div className="space-y-3.5">
                  {byType.map((r) => (
                    <BarRow
                      key={r.key}
                      label={r.key}
                      tasks={r.tasks}
                      minutes={r.minutes}
                      max={maxType}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="surface-card space-y-4 p-5">
            <h3 className="text-sm font-semibold text-foreground">Day-wise history</h3>
            <div className="space-y-4">
              {byDay.map(([day, dayTasks]) => {
                const s = summarize(dayTasks);
                const subjects = groupBy(dayTasks, (t) => t.subject);
                const pending = dayTasks.filter((t) => !t.completed);
                return (
                  <div key={day} className="rounded-xl border border-border bg-surface-2/50 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {formatDayLabel(day)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.completed} completed · {s.pending} not completed ·{" "}
                        <span className="text-primary">{formatDuration(s.totalMinutes)}</span>
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {subjects.map((sub) => (
                        <span key={sub.key}>
                          {sub.key} → {formatDuration(sub.minutes)}
                        </span>
                      ))}
                    </div>
                    {pending.length > 0 && (
                      <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2.5">
                        {pending.map((t) => (
                          <p key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="size-1.5 shrink-0 rounded-full border border-muted-foreground/60" />
                            <span>
                              {t.name}
                              <span className="text-foreground/50"> · {t.subject} · {t.type}</span>
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
