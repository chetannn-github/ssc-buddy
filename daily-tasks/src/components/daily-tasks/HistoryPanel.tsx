import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "./TaskBoard";
import {
  formatDateLabel,
  formatDuration,
  shiftDateKey,
  statsForTasks,
  type Task,
} from "@/lib/daily-tasks";

export function HistoryPanel({
  tasks,
  date,
  today,
  onDateChange,
  onToggle,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  date: string;
  today: string;
  onDateChange: (d: string) => void;
  onToggle: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const stats = statsForTasks(date, tasks);
  const dayTasks = tasks.filter((t) => t.date === date);
  const isFuture = date >= today;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="label-caps">History</p>
          <h2 className="mt-1 truncate text-base font-semibold">{formatDateLabel(date)}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous day"
            onClick={() => onDateChange(shiftDateKey(date, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDateChange(today)}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next day"
            disabled={isFuture}
            onClick={() => onDateChange(shiftDateKey(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
        <div className="bg-surface-2 p-2.5">
          <p className="label-caps">Tasks</p>
          <p className="mt-1 font-display text-sm font-semibold">
            {stats.completedTasks} / {stats.totalTasks}
          </p>
        </div>
        <div className="bg-surface-2 p-2.5">
          <p className="label-caps">Time</p>
          <p className="mt-1 font-display text-sm font-semibold">
            {formatDuration(stats.completedMinutes)} / {formatDuration(stats.targetMinutes)}
          </p>
        </div>
        <div className="bg-surface-2 p-2.5">
          <p className="label-caps">Completion</p>
          <p className="mt-1 font-display text-sm font-semibold text-primary">{stats.percent}%</p>
        </div>
      </div>

      <div className="mt-4">
        <TaskBoard
          title="Tasks on this day"
          embedded
          tasks={dayTasks}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </section>
  );
}
