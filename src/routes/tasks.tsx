import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TodayProgress } from "../../daily-tasks/src/components/daily-tasks/TodayProgress";
import { TaskBoard } from "../../daily-tasks/src/components/daily-tasks/TaskBoard";
import { TaskDialog } from "../../daily-tasks/src/components/daily-tasks/TaskDialog";
import {
  InsightsCard,
  PerformanceChart,
} from "../../daily-tasks/src/components/daily-tasks/Performance";
import { HistoryPanel } from "../../daily-tasks/src/components/daily-tasks/HistoryPanel";
import {
  formatDateLabel,
  statsForTasks,
  toDateKey,
  useTasks,
  type Subject,
  type Task,
} from "@/lib/daily-tasks";
import { loadTrackerData } from "@/lib/tracker-store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/tasks")({ component: DailyTasks });

function DailyTasks() {
  const { tasks, hydrated, addTask, updateTask, deleteTask, toggleTask } = useTasks();
  const today = useMemo(() => toDateKey(new Date()), []);
  const [historyDate, setHistoryDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<Task | null>(null);
  const [actualMinutes, setActualMinutes] = useState("60");
  const [reportSubject, setReportSubject] = useState("all");
  const [reportRange, setReportRange] = useState("week");
  const subjects = useMemo(() => loadTrackerData().subjects.map((subject) => subject.name), []);
  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setDialogOpen(true);
  };
  const submit = (values: {
    name: string;
    subject: Subject;
    type: Task["type"];
    targetMinutes: number;
  }) => {
    if (editing) updateTask(editing.id, values);
    else addTask({ ...values, date: today });
  };
  const completeTask = (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (task && !task.completed) {
      setCompleting(task);
      setActualMinutes(String(task.targetMinutes));
    } else toggleTask(id);
  };
  const report = useMemo(() => {
    const days =
      reportRange === "today"
        ? 1
        : reportRange === "month"
          ? 30
          : reportRange === "3months"
            ? 90
            : reportRange === "year"
              ? 365
              : 7;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days + 1);
    const filtered = tasks.filter(
      (task) =>
        task.completed &&
        new Date(`${task.date}T00:00:00`) >= cutoff &&
        (reportSubject === "all" || task.subject === reportSubject),
    );
    return {
      minutes: filtered.reduce((sum, task) => sum + (task.actualMinutes ?? task.targetMinutes), 0),
      done: filtered.length,
      subjects: [...new Set(tasks.map((task) => task.subject))],
    };
  }, [tasks, reportRange, reportSubject]);
  return (
    <AppShell title="Daily Tasks">
      <div className="daily-tasks-ui mx-auto max-w-6xl py-1">
        {!hydrated ? (
          <div className="panel h-64 animate-pulse" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,.9fr)] lg:items-start">
            <div className="space-y-4">
              <TodayProgress
                stats={statsForTasks(today, tasks)}
                streak={0}
                label={formatDateLabel(today)}
              />
              <section className="panel p-4 sm:p-5">
                <p className="label-caps">Study analytics</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Select value={reportSubject} onValueChange={setReportSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subjects</SelectItem>
                      {report.subjects.map((subject) => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={reportRange} onValueChange={setReportRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This week</SelectItem>
                      <SelectItem value="month">This month</SelectItem>
                      <SelectItem value="3months">Last 3 months</SelectItem>
                      <SelectItem value="year">This year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
                  <div className="bg-surface-2 p-3">
                    <p className="label-caps">Time spent</p>
                    <p className="mt-1 text-lg font-semibold">
                      {Math.floor(report.minutes / 60)}h {report.minutes % 60}m
                    </p>
                  </div>
                  <div className="bg-surface-2 p-3">
                    <p className="label-caps">Completed tasks</p>
                    <p className="mt-1 text-lg font-semibold">{report.done}</p>
                  </div>
                </div>
              </section>
              <TaskBoard
                title="Today’s tasks"
                tasks={tasks.filter((task) => task.date === today)}
                onAdd={openAdd}
                onToggle={completeTask}
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
                onToggle={completeTask}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            </div>
          </div>
        )}
        <TaskDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          date={editing?.date ?? today}
          task={editing}
          subjects={subjects}
          onSubmit={submit}
        />
        <Dialog open={!!completing} onOpenChange={(open) => !open && setCompleting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>How long did this task take?</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              inputMode="numeric"
              value={actualMinutes}
              onChange={(e) => setActualMinutes(e.target.value.replace(/\D/g, ""))}
              placeholder="Minutes"
            />
            <DialogFooter>
              <Button
                onClick={() => {
                  if (completing) {
                    toggleTask(completing.id, Math.max(1, Number(actualMinutes) || 1));
                    setCompleting(null);
                  }
                }}
              >
                Mark complete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
