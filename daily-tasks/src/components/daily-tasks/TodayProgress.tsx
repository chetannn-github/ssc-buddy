import { Flame } from "lucide-react";
import { formatDuration, type DayStats } from "@/lib/daily-tasks";

function Ring({ percent }: { percent: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * clamped) / 100}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-sm font-semibold text-foreground">{clamped}%</span>
      </div>
    </div>
  );
}

export function TodayProgress({
  stats,
  streak,
  label,
}: {
  stats: DayStats;
  streak: number;
  label: string;
}) {
  return (
    <section className="panel grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <Ring percent={stats.percent} />
        <div className="min-w-0">
          <p className="label-caps">Today&apos;s progress</p>
          <h2 className="mt-1 truncate text-base font-semibold text-foreground">{label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.targetMinutes === 0
              ? "Add your first task to set today's target."
              : `${formatDuration(Math.max(0, stats.targetMinutes - stats.completedMinutes))} left to target`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          <div className="bg-surface-2 p-3">
            <p className="label-caps">Tasks</p>
            <p className="mt-1 font-display text-base font-semibold text-foreground">
              {stats.completedTasks}
              <span className="text-muted-foreground"> / {stats.totalTasks}</span>
            </p>
          </div>
          <div className="bg-surface-2 p-3">
            <p className="label-caps">Time</p>
            <p className="mt-1 font-display text-base font-semibold text-foreground">
              {formatDuration(stats.completedMinutes)}
            </p>
          </div>
          <div className="bg-surface-2 p-3">
            <p className="label-caps">Streak</p>
            <p className="mt-1 flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
              <Flame className="h-3.5 w-3.5 text-primary" /> {streak}d
            </p>
          </div>
      </div>
    </section>
  );
}
