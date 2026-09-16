import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TodayProgress } from "../../daily-tasks/src/components/daily-tasks/TodayProgress";
import { TaskBoard } from "../../daily-tasks/src/components/daily-tasks/TaskBoard";
import { TaskDialog } from "../../daily-tasks/src/components/daily-tasks/TaskDialog";
import { InsightsCard, PerformanceChart } from "../../daily-tasks/src/components/daily-tasks/Performance";
import { HistoryPanel } from "../../daily-tasks/src/components/daily-tasks/HistoryPanel";
import { formatDateLabel, statsForTasks, toDateKey, useTasks, type Subject, type Task } from "@/lib/daily-tasks";

export const Route = createFileRoute("/tasks")({ component: DailyTasks });

function DailyTasks() {
  const { tasks, hydrated, addTask, updateTask, deleteTask, toggleTask } = useTasks();
  const today = useMemo(() => toDateKey(new Date()), []);
  const [historyDate, setHistoryDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (task: Task) => { setEditing(task); setDialogOpen(true); };
  const submit = (values: { name: string; subject: Subject; targetMinutes: number }) => {
    if (editing) updateTask(editing.id, values); else addTask({ ...values, date: today });
  };
  return <AppShell title="Daily Tasks"><div className="daily-tasks-ui mx-auto max-w-6xl py-1">{!hydrated ? <div className="panel h-64 animate-pulse" /> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(22rem,.9fr)] lg:items-start"><div className="space-y-4"><TodayProgress stats={statsForTasks(today,tasks)} streak={0} label={formatDateLabel(today)} /><TaskBoard title="Today’s tasks" tasks={tasks.filter(task=>task.date===today)} onAdd={openAdd} onToggle={toggleTask} onEdit={openEdit} onDelete={deleteTask} /></div><div className="space-y-4"><PerformanceChart tasks={tasks} today={today}/><InsightsCard tasks={tasks} today={today}/><HistoryPanel tasks={tasks} date={historyDate} today={today} onDateChange={setHistoryDate} onToggle={toggleTask} onEdit={openEdit} onDelete={deleteTask}/></div></div>}<TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} date={editing?.date??today} task={editing} onSubmit={submit}/></div></AppShell>;
}
