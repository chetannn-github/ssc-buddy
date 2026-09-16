import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TodayProgress } from "@/components/daily-tasks/TodayProgress";
import { TaskBoard } from "@/components/daily-tasks/TaskBoard";
import { TaskDialog } from "@/components/daily-tasks/TaskDialog";
import { InsightsCard, PerformanceChart } from "@/components/daily-tasks/Performance";
import { HistoryPanel } from "@/components/daily-tasks/HistoryPanel";
import {
  computeInsights,
  formatDateLabel,
  statsForTasks,
  toDateKey,
  useTasks,
  type Subject,
  type Task,
} from "@/lib/daily-tasks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Tasks — SSC Buddy Study Command Center" },
      {
        name: "description",
        content:
          "Plan daily SSC CGL tasks by subject, track target vs completed study hours, and review 7 and 30 day performance.",
      },
      { property: "og:title", content: "Daily Tasks — SSC Buddy" },
      {
        property: "og:description",
        content:
          "Plan daily SSC CGL tasks, track target vs completed study hours, and review your consistency.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyTasksPage,
});

function DailyTasksPage() {
  const { tasks, hydrated, addTask, updateTask, deleteTask, toggleTask } = useTasks();
  const today = useMemo(() => toDateKey(new Date()), []);
  const [historyDate, setHistoryDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const todayStats = statsForTasks(today, tasks);
  const todayTasks = tasks.filter((t) => t.date === today);
  const insights = computeInsights(tasks, today);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setDialogOpen(true);
  };

  const handleSubmit = (values: { name: string; subject: Subject; targetMinutes: number }) => {
    if (editing) updateTask(editing.id, values);
    else addTask({ ...values, date: today });
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/50 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-base font-semibold">SSC Buddy</h1>
            <div className="h-3 w-px bg-border" />
            <p className="label-caps">Daily Tasks</p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">{formatDateLabel(today)}</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
        {!hydrated ? (
          <div className="panel h-64 animate-pulse" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.9fr)] lg:items-start">
            <div className="space-y-4">
              <TodayProgress
                stats={todayStats}
                streak={insights.streak}
                label={formatDateLabel(today)}
              />
              <TaskBoard
                title="Today's tasks"
                tasks={todayTasks}
                onAdd={openAdd}
                onToggle={toggleTask}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            </div>

            <div className="space-y-4">
              <PerformanceChart tasks={tasks} today={today} />
              <InsightsCard tasks={tasks} today={today} />
              <HistoryPanel
                tasks={tasks}
                date={historyDate}
                today={today}
                onDateChange={setHistoryDate}
                onToggle={toggleTask}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            </div>
          </div>
        )}
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        date={editing?.date ?? today}
        task={editing}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
