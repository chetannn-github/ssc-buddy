import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeInsights,
  dayState,
  formatDuration,
  formatShortDate,
  fromDateKey,
  rangeStats,
  statsForTasks,
  shiftDateKey,
  type Task,
} from "@/lib/daily-tasks";
import { Button } from "@/components/ui/button";

function RangeTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`h-7 rounded px-2.5 text-[0.7rem] font-medium transition-colors ${
        active ? "bg-accent-soft text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Button>
  );
}

export function PerformanceChart({ tasks, today }: { tasks: Task[]; today: string }) {
  const [days, setDays] = useState(7);
  const data = useMemo(
    () =>
      rangeStats(tasks, days, today).map((d) => ({
        ...d,
        label:
          days === 7
            ? fromDateKey(d.date).toLocaleDateString(undefined, { weekday: "short" })
            : formatShortDate(d.date),
        targetHours: +(d.targetMinutes / 60).toFixed(2),
        completedHours: +(d.completedMinutes / 60).toFixed(2),
      })),
    [tasks, days, today],
  );

  return (
    <section className="panel p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="label-caps">Performance</p>
          <h2 className="mt-1 truncate text-base font-semibold">Target vs completed</h2>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
          <RangeTab active={days === 7} onClick={() => setDays(7)}>
            7 Days
          </RangeTab>
          <RangeTab active={days === 30} onClick={() => setDays(30)}>
            30 Days
          </RangeTab>
        </div>
      </div>

      <div className="mt-4 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              unit="h"
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                color: "var(--color-foreground)",
                fontSize: 12,
              }}
              formatter={(value: number, name) => [
                `${value}h`,
                name === "targetHours" ? "Target" : "Completed",
              ]}
              labelFormatter={(_l, payload) => {
                const p = payload?.[0]?.payload;
                return p ? `${formatShortDate(p.date)} · ${p.percent}%` : "";
              }}
            />
            <Bar dataKey="targetHours" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="completedHours" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[0.68rem] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-chart-2" /> Target
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" /> Completed
        </span>
      </div>
    </section>
  );
}

export function ConsistencyStrip({ tasks, today }: { tasks: Task[]; today: string }) {
  const week = rangeStats(tasks, 7, today);
  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5">
      {week.map((d) => {
        const state = dayState(d);
        return (
          <div key={d.date} className="text-center">
            <div
              title={`${formatShortDate(d.date)} · ${d.percent}%`}
               className={`h-6 rounded border ${
                state === "done"
                  ? "border-primary/40 bg-primary/70"
                  : state === "partial"
                    ? "border-primary/25 bg-accent-soft"
                    : "border-border bg-surface-2"
              }`}
            />
            <span className="mt-1 block text-[0.65rem] text-muted-foreground">
              {fromDateKey(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 p-2.5">
      <p className="label-caps">{label}</p>
      <p className="mt-1 font-display text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function InsightsCard({ tasks, today }: { tasks: Task[]; today: string }) {
  const i = useMemo(() => computeInsights(tasks, today), [tasks, today]);
  const todayStats = statsForTasks(today, tasks);
  void shiftDateKey;

  return (
    <section className="panel p-4 sm:p-5">
      <p className="label-caps">Your performance</p>
      <h2 className="mt-1 text-base font-semibold">
        {i.streak} day consistency · {Math.round(i.avgPercent)}% avg
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
        <Stat label="Avg target / day" value={formatDuration(i.avgTarget)} />
        <Stat label="Avg completed / day" value={formatDuration(i.avgCompleted)} />
        <Stat label="Total study time" value={formatDuration(i.totalMinutes)} />
        <Stat label="Tasks completed" value={`${i.totalTasks}`} />
      </div>

      <div className="mt-3 divide-y divide-border border-y border-border">
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span className="text-xs text-muted-foreground">Highest completed study time</span>
          <span className="text-sm font-medium">
            {i.bestMinutes
              ? `${formatDuration(i.bestMinutes.completedMinutes)} — ${formatShortDate(i.bestMinutes.date)}`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span className="text-xs text-muted-foreground">Best completion %</span>
          <span className="text-sm font-medium">
            {i.bestPercent
              ? `${i.bestPercent.percent}% — ${formatShortDate(i.bestPercent.date)}`
              : "—"}
          </span>
        </div>
      </div>

      <p className="mt-4 label-caps">Last 7 days</p>
      <ConsistencyStrip tasks={tasks} today={today} />
      <p className="mt-3 text-xs text-muted-foreground">
        Today: {todayStats.completedTasks}/{todayStats.totalTasks} tasks ·{" "}
        {todayStats.percent}% of target.
      </p>
    </section>
  );
}
