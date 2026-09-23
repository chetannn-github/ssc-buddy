import { createFileRoute } from "@tanstack/react-router";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompleteTaskDialog, TaskFormDialog } from "@/components/tasks/TaskDialogs";
import { AppShell } from "@/components/layout/AppShell";
import {
  formatDuration,
  loadDailyTasks,
  rangeBounds,
  saveDailyTasks,
  summarizeTasks,
  todayKey,
  type DailyTask,
  type RangeKey,
  type TaskDraft,
} from "@/lib/daily-tasks";
import { loadTrackerData } from "@/lib/tracker-store";

export const Route = createFileRoute("/tasks")({ component: DailyTasks });

const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  "3months": "Last 3 months",
  year: "This year",
};
const historyRangeOptions: RangeKey[] = ["week", "month", "3months", "year"];

function AnimatedBar({ value, tone }: { value: number; tone: string }) {
  const target = Math.max(0, Math.min(100, value));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(0);
    const frame = requestAnimationFrame(() => setDisplayValue(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <div
      className={`h-full rounded-full ${tone} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
      style={{ width: `${displayValue}%` }}
    />
  );
}

function DailyTasks() {
  const [tasks, setTasks] = useState<DailyTask[]>(() => loadDailyTasks());
  const [activeTab, setActiveTab] = useState("tasks");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyTask | null>(null);
  const [completing, setCompleting] = useState<DailyTask | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<RangeKey>("week");
  const [range, setRange] = useState<RangeKey>("week");
  const [subject, setSubject] = useState("All subjects");
  const subjects = useMemo(
    () => [...new Set(loadTrackerData().subjects.map((item) => item.name))],
    [],
  );
  const persist = (next: DailyTask[]) => {
    setTasks(next);
    saveDailyTasks(next);
  };
  const today = todayKey();
  const todayTasks = tasks
    .filter((task) => task.date === today)
    .sort((a, b) => Number(a.completed) - Number(b.completed));
  const todaySummary = summarizeTasks(todayTasks);
  const scopedTasks = useMemo(() => {
    const bounds = rangeBounds(range);
    return tasks.filter(
      (task) =>
        task.date >= bounds.from &&
        task.date <= bounds.to &&
        (subject === "All subjects" || task.subject === subject),
    );
  }, [tasks, range, subject]);
  const scopedSummary = summarizeTasks(scopedTasks);
  const bySubject = useMemo(() => {
    const totals = new Map<string, { count: number; minutes: number }>();
    scopedTasks
      .filter((task) => task.completed)
      .forEach((task) => {
        const existing = totals.get(task.subject) ?? { count: 0, minutes: 0 };
        totals.set(task.subject, {
          count: existing.count + 1,
          minutes: existing.minutes + (task.minutesSpent ?? 0),
        });
      });
    return [...totals.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  }, [scopedTasks]);
  const byType = useMemo(() => {
    const totals = new Map<string, { count: number; minutes: number }>();
    scopedTasks
      .filter((task) => task.completed)
      .forEach((task) => {
        const existing = totals.get(task.type) ?? { count: 0, minutes: 0 };
        totals.set(task.type, {
          count: existing.count + 1,
          minutes: existing.minutes + (task.minutesSpent ?? 0),
        });
      });
    return [...totals.entries()].sort((a, b) => b[1].minutes - a[1].minutes);
  }, [scopedTasks]);
  const historyDays = useMemo(() => {
    const bounds = rangeBounds(historyRange);
    const grouped = new Map<string, DailyTask[]>();
    tasks
      .filter((task) => task.date < today && task.date >= bounds.from && task.date <= bounds.to)
      .forEach((task) => grouped.set(task.date, [...(grouped.get(task.date) ?? []), task]));
    return [...grouped.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [historyRange, tasks, today]);
  const activeHistoryDay =
    historyDays.find(([date]) => date === selectedHistoryDate) ?? historyDays[0];
  const progress = todaySummary.total
    ? Math.round((todaySummary.completed / todaySummary.total) * 100)
    : 0;
  const createOrUpdate = (draft: TaskDraft) => {
    if (editing)
      persist(tasks.map((task) => (task.id === editing.id ? { ...task, ...draft } : task)));
    else {
      const now = new Date();
      persist([
        {
          id: crypto.randomUUID(),
          ...draft,
          createdAt: now.toISOString(),
          date: todayKey(now),
          completed: false,
          completedAt: null,
          minutesSpent: null,
        },
        ...tasks,
      ]);
    }
  };
  const complete = (id: string, minutesSpent: number) =>
    persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: true, completedAt: new Date().toISOString(), minutesSpent }
          : task,
      ),
    );
  const reopen = (id: string) =>
    persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: false, completedAt: null, minutesSpent: null }
          : task,
      ),
    );
  const allSubjects = [...new Set([...subjects, ...tasks.map((task) => task.subject), "Other"])];

  return (
    <AppShell title="Daily Tasks">
      <div className="mx-auto w-full max-w-5xl py-2 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-zinc-500 uppercase">
              Study planner
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Plan tasks, record time, and review subject-wise study data.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add task
          </Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-7">
          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="bg-white/5">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            {activeTab === "analytics" && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
                  <SelectTrigger className="w-36 border-white/15 bg-[#1b1b1b] text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#1b1b1b] text-zinc-100">
                    {(Object.keys(rangeLabels) as RangeKey[]).map((item) => (
                      <SelectItem
                        key={item}
                        value={item}
                        className="focus:bg-white/10 focus:text-zinc-100"
                      >
                        {rangeLabels[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger className="w-44 border-white/15 bg-[#1b1b1b] text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#1b1b1b] text-zinc-100">
                    <SelectItem
                      value="All subjects"
                      className="focus:bg-white/10 focus:text-zinc-100"
                    >
                      All subjects
                    </SelectItem>
                    {allSubjects.map((item) => (
                      <SelectItem
                        key={item}
                        value={item}
                        className="focus:bg-white/10 focus:text-zinc-100"
                      >
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {activeTab === "history" && (
              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={historyRange}
                  onValueChange={(value) => setHistoryRange(value as RangeKey)}
                >
                  <SelectTrigger className="w-40 border-white/15 bg-[#1b1b1b] text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#1b1b1b] text-zinc-100">
                    {historyRangeOptions.map((option) => (
                      <SelectItem
                        key={option}
                        value={option}
                        className="focus:bg-white/10 focus:text-zinc-100"
                      >
                        {rangeLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeHistoryDay && (
                  <Select value={activeHistoryDay[0]} onValueChange={setSelectedHistoryDate}>
                    <SelectTrigger className="hidden w-56 border-white/15 bg-[#1b1b1b] text-zinc-100 lg:flex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="task-history-scroll border-white/15 bg-[#1b1b1b] text-zinc-100">
                      {historyDays.map(([date, dayTasks]) => {
                        const summary = summarizeTasks(dayTasks);
                        const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
                        return <SelectItem key={date} value={date} className="focus:bg-white/10 focus:text-zinc-100">{label} · {summary.completed}/{summary.total} completed</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          <TabsContent value="tasks" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Today's tasks", String(todaySummary.total)],
                ["Completed", String(todaySummary.completed)],
                ["Pending", String(todaySummary.pending)],
                ["Study time", formatDuration(todaySummary.minutes)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/10 bg-[#1b1b1b] px-3 py-2"
                >
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Today's progress</span>
                <span>
                  {todaySummary.completed} / {todaySummary.total} completed
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <AnimatedBar value={progress} tone="bg-blue-500" />
              </div>
            </div>
            <div className="space-y-1.5">
              {todayTasks.length ? (
                todayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={setCompleting}
                    onReopen={reopen}
                    onEdit={() => {
                      setEditing(task);
                      setFormOpen(true);
                    }}
                    onDelete={() => persist(tasks.filter((item) => item.id !== task.id))}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-white/15 px-4 py-10 text-center text-sm text-zinc-400">
                  No tasks for today. Add your first study task.
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="analytics" className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Time spent", formatDuration(scopedSummary.minutes)],
                ["Tasks completed", String(scopedSummary.completed)],
                ["Pending", String(scopedSummary.pending)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-[#1b1b1b] px-4 py-3"
                >
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-xl border border-white/10 bg-[#1b1b1b] p-5">
                <h2 className="text-sm font-semibold">Subject-wise study time</h2>
                {bySubject.length ? (
                  <div className="mt-4 space-y-4">
                    {bySubject.map(([name, stats]) => (
                      <div key={name}>
                        <div className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className="text-zinc-400">
                            {stats.count} tasks · {formatDuration(stats.minutes)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/10">
                          <AnimatedBar
                            value={Math.max(
                              4,
                              (stats.minutes / Math.max(1, bySubject[0]?.[1].minutes ?? 1)) * 100,
                            )}
                            tone="bg-emerald-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Complete tasks to see analytics.</p>
                )}
              </section>
              <section className="rounded-xl border border-white/10 bg-[#1b1b1b] p-5">
                <h2 className="text-sm font-semibold">Task-type breakdown</h2>
                {byType.length ? (
                  <div className="mt-4 space-y-4">
                    {byType.map(([name, stats]) => (
                      <div key={name}>
                        <div className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className="text-zinc-400">
                            {stats.count} tasks · {formatDuration(stats.minutes)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/10">
                          <AnimatedBar
                            value={Math.max(
                              4,
                              (stats.minutes / Math.max(1, byType[0]?.[1].minutes ?? 1)) * 100,
                            )}
                            tone="bg-blue-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">
                    Complete tasks to see this breakdown.
                  </p>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            {historyDays.length && activeHistoryDay ? (
              <div className="space-y-4">
                <Select value={activeHistoryDay[0]} onValueChange={setSelectedHistoryDate}>
                  <SelectTrigger className="w-full border-white/15 bg-[#1b1b1b] text-zinc-100 sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="task-history-scroll border-white/15 bg-[#1b1b1b] text-zinc-100">
                    {historyDays.map(([date, dayTasks]) => {
                      const summary = summarizeTasks(dayTasks);
                      const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      });
                      return (
                        <SelectItem
                          key={date}
                          value={date}
                          className="focus:bg-white/10 focus:text-zinc-100"
                        >
                          {label} · {summary.completed}/{summary.total} completed
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <section className="rounded-xl border border-white/10 bg-[#1b1b1b] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {new Date(`${activeHistoryDay[0]}T00:00:00`).toLocaleDateString(undefined, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        {formatDuration(summarizeTasks(activeHistoryDay[1]).minutes)} study time
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {[...activeHistoryDay[1]]
                      .sort((a, b) => Number(a.completed) - Number(b.completed))
                      .map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onComplete={setCompleting}
                          onReopen={reopen}
                          onEdit={() => {
                            setEditing(task);
                            setFormOpen(true);
                          }}
                          onDelete={() => persist(tasks.filter((item) => item.id !== task.id))}
                          readOnly
                        />
                      ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 px-6 py-14 text-center text-zinc-400">
                No task history yet.
              </div>
            )}
          </TabsContent>
        </Tabs>
        <TaskFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          task={editing}
          subjects={allSubjects}
          onSubmit={createOrUpdate}
        />
        <CompleteTaskDialog
          task={completing}
          onOpenChange={(open) => !open && setCompleting(null)}
          onComplete={complete}
        />
      </div>
    </AppShell>
  );
}

function TaskRow({
  task,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  readOnly = false,
}: {
  task: DailyTask;
  onComplete: (task: DailyTask) => void;
  onReopen: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#1b1b1b] px-3 py-2.5">
      <button
        type="button"
        disabled={readOnly}
        onClick={() => (task.completed ? onReopen(task.id) : onComplete(task))}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border disabled:cursor-default ${task.completed ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-transparent hover:border-emerald-400"}`}
      >
        {task.completed && <Check className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={
            task.completed
              ? "truncate text-sm text-zinc-500 line-through"
              : "truncate text-sm font-medium"
          }
        >
          {task.name}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {task.subject} · {task.type}
          {task.completed && task.minutesSpent ? ` · ${formatDuration(task.minutesSpent)}` : ""}
        </p>
      </div>
      {!readOnly && (
        <>
          <Button size="icon" variant="ghost" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 />
          </Button>
        </>
      )}
    </div>
  );
}
