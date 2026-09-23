import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Analytics } from "@/components/tasks/analytics";
import { TaskCard } from "@/components/tasks/task-card";
import { CompleteTaskDialog, TaskFormDialog } from "@/components/tasks/task-dialogs";
import { useTasks } from "@/hooks/use-tasks";
import {
  formatDayLabel,
  formatDuration,
  summarize,
  todayKey,
  type Task,
} from "@/lib/tasks";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Daily Tasks — SSC Buddy" },
      {
        name: "description",
        content:
          "Plan, complete and time your SSC study tasks, then see subject-wise study analytics.",
      },
      { property: "og:title", content: "Daily Tasks — SSC Buddy" },
      {
        property: "og:description",
        content: "Track daily study tasks and analyse time spent per subject.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

const tabAnimate =
  "data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300";

function TasksPage() {
  const { tasks, hydrated, addTask, updateTask, completeTask, reopenTask, deleteTask } =
    useTasks();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<Task | null>(null);

  const today = todayKey();
  const todayStats = summarize(tasks.filter((t) => t.date === today));
  const progress = todayStats.total
    ? Math.round((todayStats.completed / todayStats.total) * 100)
    : 0;

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.date === today)
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [tasks, today],
  );

  const historyGroups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, list]) => [
        day,
        [...list].sort((a, b) => Number(a.completed) - Number(b.completed)),
      ]) as [string, Task[]][];
  }, [tasks]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              SSC Buddy
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Daily Tasks
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Plan, complete and record how you spend your study time.
            </p>
          </div>
          <Button onClick={openNew} className="shadow-[var(--shadow-glow)]">
            <Plus className="size-4" /> Add Task
          </Button>
        </header>

        <Tabs defaultValue="today" className="mt-8">
          <TabsList>
            <TabsTrigger value="today">Tasks</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className={`mt-6 space-y-6 ${tabAnimate}`}>
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Today's Tasks" value={String(todayStats.total)} />
                <StatCard label="Completed" value={String(todayStats.completed)} accent />
                <StatCard label="Pending" value={String(todayStats.pending)} />
                <StatCard label="Studied" value={formatDuration(todayStats.totalMinutes)} />
              </div>

              <div className="surface-card p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Today's Progress</span>
                  <span className="font-medium">
                    {todayStats.completed} / {todayStats.total} Tasks Completed
                  </span>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </section>

            {hydrated && tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
                <p className="text-lg font-medium text-foreground">No tasks yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first study task and start tracking your progress.
                </p>
                <Button className="mt-5" onClick={openNew}>
                  <Plus className="size-4" /> Add Task
                </Button>
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center">
                <p className="text-lg font-medium text-foreground">No tasks for today</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a task to get started — purane tasks History tab me hain.
                </p>
                <Button className="mt-5" onClick={openNew}>
                  <Plus className="size-4" /> Add Task
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onRequestComplete={setCompleting}
                    onReopen={reopenTask}
                    onEdit={(t) => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className={`mt-6 ${tabAnimate}`}>
            <Analytics tasks={tasks} />
          </TabsContent>
        </Tabs>
      </div>

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        onSubmit={(draft) => (editing ? updateTask(editing.id, draft) : addTask(draft))}
      />
      <CompleteTaskDialog
        task={completing}
        onOpenChange={(v) => !v && setCompleting(null)}
        onComplete={completeTask}
      />
    </div>
  );
}
