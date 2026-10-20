import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { createFileRoute } from "@tanstack/react-router";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { RollingNumber, RollingDuration } from "@/components/ui/rolling-number";
import { LiquidProgressBar } from "@/components/profile/ProfileXpBar";
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
import { isFirebaseConfigured, observeFirebaseUser } from "@/lib/firebase-sync";
import { publishLeaderboardEntry, weeklyTaskPoints } from "@/lib/leaderboard";
import { loadPracticeProfile } from "@/lib/profile";
import { syncTaskChanges } from "@/lib/task-sync";

export const Route = createFileRoute("/tasks")({ component: DailyTasks });

const rangeLabels: Record<RangeKey, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  "3months": "Last 3 months",
  year: "This year",
};
const historyRangeOptions: RangeKey[] = ["week", "month", "3months", "year"];


function DailyTasks() {
  const [tasks, setTasks] = useState<DailyTask[]>(() => loadDailyTasks());
  const [calendarDay, setCalendarDay] = useState(() => todayKey());
  const [syncUser, setSyncUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("tasks");
  const [taskDay, setTaskDay] = useState<"today" | "tomorrow">("today");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyTask | null>(null);
  const [completing, setCompleting] = useState<DailyTask | null>(null);
  const [deleting, setDeleting] = useState<DailyTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<RangeKey>("week");
  const [range, setRange] = useState<RangeKey>("week");
  const [subject, setSubject] = useState("All subjects");
  useEffect(() => {
    const refreshTasks = () => setTasks(loadDailyTasks());
    window.addEventListener("ssc-daily-tasks-updated", refreshTasks);
    return () => window.removeEventListener("ssc-daily-tasks-updated", refreshTasks);
  }, []);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return observeFirebaseUser(setSyncUser);
  }, []);
  useEffect(() => {
    let midnightTimer: number | undefined;
    const refreshCalendarDay = () => setCalendarDay((previous) => {
      const next = todayKey();
      return previous === next ? previous : next;
    });
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 1, 0);
      midnightTimer = window.setTimeout(() => {
        refreshCalendarDay();
        scheduleMidnightRefresh();
      }, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
    };
    scheduleMidnightRefresh();
    window.addEventListener("focus", refreshCalendarDay);
    return () => {
      if (midnightTimer) window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", refreshCalendarDay);
    };
  }, []);
  const persist = async (next: DailyTask[]) => {
    const previous = tasks;
    setTasks(next);
    saveDailyTasks(next);
    const profile = loadPracticeProfile();
    await Promise.all([
      syncUser ? syncTaskChanges(syncUser, previous, next) : Promise.resolve(),
      syncUser && profile?.username
        ? publishLeaderboardEntry(syncUser, profile, next).catch(() => undefined)
        : Promise.resolve(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 160)),
    ]);
  };
  useEffect(() => {
    if (!syncUser) return;
    const profile = loadPracticeProfile();
    if (profile?.username) void publishLeaderboardEntry(syncUser, profile, tasks).catch(() => undefined);
  }, [calendarDay, syncUser?.uid]);
  const today = calendarDay;
  const tomorrowDate = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return todayKey(tomorrow);
  }, [calendarDay]);
  const tomorrowTaskCount = tasks.filter((task) => task.date === tomorrowDate).length;
  const activeTaskDate = taskDay === "today" ? today : tomorrowDate;
  const dayTasks = tasks
    .filter((task) => task.date === activeTaskDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed));
  const daySummary = summarizeTasks(dayTasks);
  const taskPoints = useMemo(() => weeklyTaskPoints(tasks), [calendarDay, tasks]);
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
    const firstTaskDay = tasks.filter((task) => task.date < today).map((task) => task.date).sort()[0];
    for (const cursor = new Date(`${firstTaskDay ?? today}T00:00:00`); todayKey(cursor) < today; cursor.setDate(cursor.getDate() + 1)) {
      const date = todayKey(cursor);
      if (date >= bounds.from && date <= bounds.to && !tasks.some((task) => task.date === date && task.completed)) grouped.set(date, grouped.get(date) ?? []);
    }
    return [...grouped.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [historyRange, tasks, today]);
  const activeHistoryDay =
    historyDays.find(([date]) => date === selectedHistoryDate) ?? historyDays[0];
  const progress = daySummary.total
    ? Math.round((daySummary.completed / daySummary.total) * 100)
    : 0;
  const createOrUpdate = async (draft: TaskDraft) => {
    if (editing)
      await persist(tasks.map((task) => (task.id === editing.id ? { ...task, ...draft } : task)));
    else {
      const now = new Date();
      await persist([
        {
          id: crypto.randomUUID(),
          ...draft,
          createdAt: now.toISOString(),
          date: draft.date,
          completed: false,
          completedAt: null,
          minutesSpent: null,
        },
        ...tasks,
      ]);
    }
  };
  const complete = async (id: string, minutesSpent: number) =>
    await persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: true, completedAt: new Date().toISOString(), minutesSpent }
          : task,
      ),
    );
  const reopen = async (id: string) =>
    await persist(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: false, completedAt: null, minutesSpent: null }
          : task,
      ),
    );
  const allSubjects = [...new Set([...tasks.map((task) => task.subject).filter(Boolean), "Other"])];

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
            <TabsList className="relative grid h-auto grid-cols-3 bg-white/5 p-1">
              <span aria-hidden="true" className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(33.333%-0.25rem)] rounded-md bg-zinc-100 shadow-sm transition-transform duration-300 ease-out ${activeTab === "analytics" ? "translate-x-full" : activeTab === "history" ? "translate-x-[200%]" : ""}`} />
              <TabsTrigger className="relative z-10 !bg-transparent !text-zinc-400 !shadow-none data-[state=active]:!bg-transparent data-[state=active]:!text-zinc-900 data-[state=active]:!shadow-none" value="tasks">Tasks</TabsTrigger>
              <TabsTrigger className="relative z-10 !bg-transparent !text-zinc-400 !shadow-none data-[state=active]:!bg-transparent data-[state=active]:!text-zinc-900 data-[state=active]:!shadow-none" value="analytics">Analytics</TabsTrigger>
              <TabsTrigger className="relative z-10 !bg-transparent !text-zinc-400 !shadow-none data-[state=active]:!bg-transparent data-[state=active]:!text-zinc-900 data-[state=active]:!shadow-none" value="history">History</TabsTrigger>
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
            {activeTab === "tasks" && tomorrowTaskCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setTaskDay((current) => (current === "today" ? "tomorrow" : "today"))
                }
                className="ml-auto h-9 rounded-md border border-white/15 bg-[#1b1b1b] px-3 text-sm text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                {taskDay === "today" ? <span>Tomorrow (<RollingNumber value={tomorrowTaskCount} />)</span> : "Today"}
              </button>
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
                )}
              </div>
            )}
          </div>
          <TabsContent value="tasks" className="mt-4 flex h-[calc(100dvh-15rem)] min-h-[22rem] flex-col overflow-hidden">
            <div className="shrink-0 space-y-3 bg-[#121212] pb-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Tasks", value: <RollingNumber value={daySummary.total} /> },
                { label: "Completed", value: <RollingNumber value={daySummary.completed} /> },
                { label: "Pending", value: <RollingNumber value={daySummary.pending} /> },
                { label: "Study time", value: <RollingDuration minutes={daySummary.minutes} /> },
              ].map(({label, value}) => (
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
                <span className="text-zinc-400">
                  {taskDay === "today" ? "Today's progress" : "Tomorrow's progress"}
                </span>
                <span>
                  <RollingNumber value={daySummary.completed} /> / <RollingNumber value={daySummary.total} suffix=" completed" />
                </span>
              </div>
              <div className="mt-2">
                <LiquidProgressBar
                  progress={progress / 100}
                  color="#3b82f6"
                  height={6}
                  label={taskDay === "today" ? "Today's task progress" : "Tomorrow's task progress"}
                />
              </div>
            </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dayTasks.length ? (
                <div className="divide-y divide-white/10 overflow-hidden rounded-lg bg-[#1b1b1b] px-3">
                {dayTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    grouped
                    points={taskPoints.get(task.id) ?? 0}
                    onComplete={setCompleting}
                    onReopen={reopen}
                    onEdit={() => {
                      setEditing(task);
                      setFormOpen(true);
                    }}
                    onDelete={() => setDeleting(task)}
                  />
                ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/15 px-4 py-10 text-center text-sm text-zinc-400">
                  No tasks for {taskDay}. Add your first study task.
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="analytics" className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Time spent", value: <RollingDuration minutes={scopedSummary.minutes} /> },
                { label: "Tasks completed", value: <RollingNumber value={scopedSummary.completed} /> },
                { label: "Pending", value: <RollingNumber value={scopedSummary.pending} /> },
              ].map(({label, value}) => (
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
                            <RollingNumber value={stats.count} suffix=" tasks" /> · <RollingDuration minutes={stats.minutes} />
                          </span>
                        </div>
                        <div className="mt-2">
                          <LiquidProgressBar
                            progress={stats.minutes > 0 ? Math.max(0.04, stats.minutes / Math.max(1, bySubject[0]?.[1].minutes ?? 1)) : 0}
                            color="#10b981"
                            height={8}
                            label={`Subject study time: ${name}`}
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
                            <RollingNumber value={stats.count} suffix=" tasks" /> · <RollingDuration minutes={stats.minutes} />
                          </span>
                        </div>
                        <div className="mt-2">
                          <LiquidProgressBar
                            progress={stats.minutes > 0 ? Math.max(0.04, stats.minutes / Math.max(1, byType[0]?.[1].minutes ?? 1)) : 0}
                            color="#3b82f6"
                            height={8}
                            label={`Task-type study time: ${name}`}
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
                  <SelectTrigger className="w-full border-white/15 bg-[#1b1b1b] text-zinc-100 lg:hidden">
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
                        <RollingDuration minutes={summarizeTasks(activeHistoryDay[1]).minutes} /> study time
                      </p>
                    </div>
                    {!activeHistoryDay[1].some((task) => task.completed) && <strong className="font-mono text-sm text-red-300">Inactive day · −50 pts</strong>}
                  </div>
                  <div className="mt-5 divide-y divide-white/10">
                    {[...activeHistoryDay[1]]
                      .sort((a, b) => Number(a.completed) - Number(b.completed))
                      .map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          points={taskPoints.get(task.id) ?? 0}
                          onComplete={setCompleting}
                          onReopen={reopen}
                          onEdit={() => {
                            setEditing(task);
                            setFormOpen(true);
                          }}
                          onDelete={() => persist(tasks.filter((item) => item.id !== task.id))}
                          readOnly
                          grouped
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
          defaultSchedule={taskDay}
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
        <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent className="border-white/10 bg-[#1b1b1b] p-5 text-zinc-100 sm:max-w-sm">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">Delete task?</DialogTitle>
              <DialogDescription className="text-sm text-zinc-400">
                “{deleting?.name}” will be removed from your task history.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2 gap-2 sm:gap-2">
              <Button variant="ghost" size="sm" disabled={isDeleting} onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isDeleting}
                onClick={async () => {
                  if (!deleting || isDeleting) return;
                  if (deleting.date === todayKey()) { setDeleting(null); return; }
                  setIsDeleting(true);
                  try {
                    await persist(tasks.filter((item) => item.id !== deleting.id));
                    setDeleting(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Delete task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function TaskRow({
  task,
  points,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  readOnly = false,
  grouped = false,
}: {
  task: DailyTask;
  points: number;
  onComplete: (task: DailyTask) => void;
  onReopen: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  grouped?: boolean;
}) {
  const menuAction = useRef(false);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const canDelete = !readOnly && task.date === todayKey(tomorrow);
  return (
    <ContextMenu modal={false} onOpenChange={(open) => { if (open) menuAction.current = false; }}>
    <ContextMenuTrigger asChild disabled={readOnly}><div
      tabIndex={readOnly ? undefined : 0}
      aria-label={readOnly ? undefined : `${task.name}; right-click for options`}
      className={`flex items-center gap-3 py-2.5 ${grouped ? "px-0" : "rounded-lg border border-white/10 bg-[#1b1b1b] px-3"}`}
    >
      <button
        type="button"
        disabled={readOnly}
        onClick={(event) => {
          event.stopPropagation();
          task.completed ? onReopen(task.id) : onComplete(task);
        }}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border disabled:cursor-default ${task.completed ? "border-emerald-400 bg-emerald-500 text-white" : readOnly ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-white/20 text-transparent hover:border-emerald-400"}`}
      >
        {task.completed && <Check className="h-4 w-4" />}
        {!task.completed && readOnly && <X className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><p className={task.completed ? "truncate text-sm text-zinc-500 line-through" : "truncate text-sm font-medium"}>{task.name}</p><span className={`shrink-0 font-mono text-[11px] font-semibold ${points > 0 ? "text-emerald-300" : points < 0 ? "text-red-300" : "text-zinc-500"}`}><RollingNumber value={points} prefix={points > 0 ? "+" : ""} suffix=" pts" /></span></div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {task.subject} · {task.type}
          {task.completed && task.minutesSpent ? <> · <RollingDuration minutes={task.minutesSpent} /></> : ""}
        </p>
      </div>
    </div></ContextMenuTrigger>
    {!readOnly && <ContextMenuContent className="w-44 rounded-xl border-white/10 bg-[#202020] p-1.5 text-zinc-100 shadow-xl" onCloseAutoFocus={(event) => { if (menuAction.current) event.preventDefault(); }}>
      <ContextMenuItem className="gap-2 rounded-lg py-2.5 focus:bg-white/10 focus:text-white" onSelect={() => { menuAction.current = true; onEdit(); }}><Pencil className="h-4 w-4" />Edit Task</ContextMenuItem>
      {canDelete && <ContextMenuItem className="gap-2 rounded-lg py-2.5 text-red-300 focus:bg-red-400/10 focus:text-red-300" onSelect={() => { menuAction.current = true; onDelete(); }}><Trash2 className="h-4 w-4" />Delete</ContextMenuItem>}
    </ContextMenuContent>}
    </ContextMenu>
  );
}
