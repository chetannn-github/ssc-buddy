import { workspaceDates, workspaceSummary } from "@/lib/daily-workspace";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Gauge,
  ListTodo,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { HabitsPanel } from "./HabitsPanel";
import { Button } from "@/components/ui/button";
import { RollingNumber, RollingDuration } from "@/components/ui/rolling-number";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompleteTaskDialog, TaskFormDialog } from "./TaskDialogs";
import { useAuthUser } from "@/lib/auth-context";
import { useHabits, useHabitToday } from "@/lib/habits";
import { loadPracticeProfile } from "@/lib/profile";
import {
  loadDailyTasks,
  saveDailyTasks,
  todayKey,
  type DailyTask,
  type TaskDraft,
} from "@/lib/daily-tasks";
import { syncTaskChanges } from "@/lib/task-sync";
import { currentWeekKey, publishLeaderboardEntry, weeklyTaskPoints } from "@/lib/leaderboard";

export function TasksWorkspace({
  initialSection = "tasks",
}: {
  initialSection?: "tasks" | "habits";
}) {
  const user = useAuthUser(),
    today = useHabitToday(),
    habitsApi = useHabits(user?.uid);
  const [section, setSection] = useState(initialSection);
  const [tasks, setTasks] = useState<DailyTask[]>(loadDailyTasks);
  const [selected, setSelected] = useState(today),
    [weekEnd, setWeekEnd] = useState(today);
  const [dueOnly, setDueOnly] = useState(false);
  const [enabled, setEnabled] = useState(() => loadPracticeProfile()?.habitsEnabled !== false);
  const [addHabit, setAddHabit] = useState(0);
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<DailyTask | null>(null);
  const [completing, setCompleting] = useState<DailyTask | null>(null),
    [deleting, setDeleting] = useState<DailyTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false),
    [error, setError] = useState("");
  const [wideDates, setWideDates] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWideDates(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const previousToday = useRef(today),
    revision = useRef(0);
  const tomorrow = todayKey(new Date(new Date(today + "T12:00:00").getTime() + 86400000));
  const latest = tasks.some((task) => task.date === tomorrow) ? tomorrow : today;
  const previousLatest = useRef(latest);
  useEffect(() => {
    const refresh = () => setTasks(loadDailyTasks());
    const settings = () => setEnabled(loadPracticeProfile()?.habitsEnabled !== false);
    window.addEventListener("ssc-daily-tasks-updated", refresh);
    window.addEventListener("cbt-profile-updated", settings);
    return () => {
      window.removeEventListener("ssc-daily-tasks-updated", refresh);
      window.removeEventListener("cbt-profile-updated", settings);
    };
  }, []);
  useEffect(() => {
    const previous = previousToday.current;
    setSelected((value) => (value === previous ? today : value));
    previousToday.current = today;
  }, [today]);
  useEffect(() => {
    const previous = previousLatest.current;
    setWeekEnd((value) => (value === previous || value > latest ? latest : value));
    setSelected((value) => (value > latest ? today : value));
    previousLatest.current = latest;
  }, [latest, today]);
  useEffect(() => {
    if (!enabled) setSection("tasks");
  }, [enabled]);
  const persist = async (next: DailyTask[]) => {
    const previous = tasks,
      version = ++revision.current;
    setError("");
    setTasks(next);
    saveDailyTasks(next);
    try {
      if (user) await syncTaskChanges(user, previous, next);
      const profile = loadPracticeProfile();
      if (user && profile?.username)
        void publishLeaderboardEntry(user, profile, next).catch(() => undefined);
    } catch (cause) {
      if (version === revision.current) {
        setTasks(previous);
        saveDailyTasks(previous);
      }
      setError("Could not save your task. Please try again.");
      throw cause;
    }
  };
  const isHabits = section === "habits",
    history = selected < today;
  const model = workspaceSummary(tasks, habitsApi.habits, selected, section, dueOnly);
  const { daily, total, due, percent, visibleTasks: visible } = model;
  const progressFor = (day: string) =>
    workspaceSummary(tasks, habitsApi.habits, day, section).percent / 100;
  const points = weeklyTaskPoints(tasks, currentWeekKey(new Date(selected + "T12:00:00")));
  const subjects = useMemo(
    () => [...new Set([...tasks.map((task) => task.subject).filter(Boolean), "Other"])],
    [tasks],
  );
  const newTask = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const moveWeek = (offset: number) => {
    const value = new Date(weekEnd + "T12:00:00");
    value.setDate(value.getDate() + offset);
    const key = todayKey(value);
    setWeekEnd(key > latest ? latest : key);
  };
  return (
    <AppShell title="Tasks & Habits">
      <div className="mx-auto w-full max-w-5xl space-y-5 text-zinc-100">
        <section className="rounded-2xl border border-white/10 bg-[#121212] overflow-hidden p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">
              {selected === today
                ? "Today"
                : new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
              <span className="text-zinc-500">
                ,{" "}
                <RollingNumber
                  value={new Date(selected + "T12:00:00").getDate()}
                  suffix={
                    " " +
                    new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                      month: "short",
                    })
                  }
                />
              </span>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {enabled && (
                <Button
                  variant="outline"
                  className="w-24 gap-2 border-white/10 bg-transparent"
                  onClick={() => setSection(isHabits ? "tasks" : "habits")}
                >
                  {isHabits ? <ListTodo /> : <Flame />}
                  {isHabits ? "Tasks" : "Habits"}
                </Button>
              )}
              <Button
                size="icon"
                aria-label={isHabits ? "Add habit" : "Add task"}
                disabled={isHabits && !user}
                onClick={() => (isHabits ? setAddHabit((value) => value + 1) : newTask())}
              >
                <Plus />
              </Button>
            </div>
          </div>
          <div className="mt-5 flex justify-between text-zinc-500">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => moveWeek(wideDates ? -14 : -7)}
              className="rounded-md p-1 hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              {selected !== today && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(today);
                    setWeekEnd(latest);
                  }}
                  className="text-xs text-primary"
                >
                  Today
                </button>
              )}
              <button
                type="button"
                aria-label="Next week"
                disabled={weekEnd >= latest}
                onClick={() => moveWeek(wideDates ? 14 : 7)}
                className="rounded-md p-1 hover:bg-white/5 disabled:opacity-20"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-4 lg:grid-cols-[repeat(14,minmax(0,1fr))] lg:gap-2">
            {workspaceDates(weekEnd).map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                aria-label={day}
                aria-pressed={selected === day}
                className={`${index < 7 ? "hidden lg:flex" : "flex"} flex-col items-center gap-2 py-1 sm:gap-3`}
              >
                <span
                  className={selected === day ? "text-xs font-semibold" : "text-xs text-zinc-500"}
                >
                  {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <DateRing day={day} progress={progressFor(day)} selected={selected === day} />
              </button>
            ))}
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs text-zinc-500">Filter</p>
              <div className="relative isolate flex h-8 w-40 overflow-hidden rounded-lg border border-white/10 sm:w-44">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-md bg-primary transition-transform duration-[260ms] ease-in-out motion-reduce:transition-none"
                  style={{ transform: dueOnly ? "translateX(100%)" : "translateX(0)" }}
                />
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={dueOnly === value}
                    onClick={() => setDueOnly(value)}
                    className={`relative z-10 flex-1 text-xs ${dueOnly === value ? "text-primary-foreground" : "text-zinc-300"}`}
                  >
                    {value ? "Due" : "All"} ({value ? due : total})
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-28 text-right">
              <p className="mb-2 text-xs text-zinc-500">
                {isHabits ? "Habit Score" : "Task Meter"}
              </p>
              <p className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 px-3 text-base font-semibold">
                <Gauge className="h-4 w-4" />
                <RollingNumber value={percent} suffix="%" />
              </p>
            </div>
          </div>
          <div className="mt-3 flex h-4 items-center justify-end gap-2 text-xs text-zinc-500">
            {!isHabits && (
              <>
                <Clock3 className="h-3.5 w-3.5" />
                Study time <RollingDuration minutes={model.studyMinutes} />
              </>
            )}
          </div>
          {!isHabits && (
            <>
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <div
                aria-label="Tasks"
                className="-mx-4 -mb-4 mt-3 divide-y divide-white/10 border-t border-white/10 bg-[#121212] sm:-mx-6 sm:-mb-6"
              >
                {visible.length ? (
                  visible.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      grouped
                      points={points.get(task.id) ?? 0}
                      readOnly={history}
                      onComplete={setCompleting}
                      onReopen={(id) => {
                        void persist(
                          tasks.map((item) =>
                            item.id === id
                              ? { ...item, completed: false, completedAt: null, minutesSpent: null }
                              : item,
                          ),
                        ).catch(() => undefined);
                      }}
                      onEdit={() => {
                        setEditing(task);
                        setFormOpen(true);
                      }}
                      onDelete={() => setDeleting(task)}
                    />
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-zinc-500">
                    {daily.length ? "All tasks complete for this day." : "No tasks for this day."}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
        {isHabits && (
          <HabitsPanel
            user={user}
            api={habitsApi}
            today={today}
            selected={selected}
            dueOnly={dueOnly}
            enabled={enabled}
            addRequest={addHabit}
          />
        )}
        <TaskFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          task={editing}
          subjects={subjects}
          defaultSchedule={selected === tomorrow ? "tomorrow" : "today"}
          onSubmit={async (draft: TaskDraft) => {
            if (editing)
              await persist(
                tasks.map((task) => (task.id === editing.id ? { ...task, ...draft } : task)),
              );
            else
              await persist([
                ...tasks,
                {
                  id: crypto.randomUUID(),
                  ...draft,
                  createdAt: new Date().toISOString(),
                  completed: false,
                  completedAt: null,
                  minutesSpent: null,
                },
              ]);
          }}
        />
        <CompleteTaskDialog
          task={completing}
          onOpenChange={(open) => {
            if (!open) setCompleting(null);
          }}
          onComplete={async (id, minutesSpent) =>
            persist(
              tasks.map((task) =>
                task.id === id
                  ? {
                      ...task,
                      completed: true,
                      completedAt: new Date().toISOString(),
                      minutesSpent,
                    }
                  : task,
              ),
            )
          }
        />
        <Dialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open && !isDeleting) setDeleting(null);
          }}
        >
          <DialogContent className="border-white/10 bg-[#121212] text-zinc-100 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete task?</DialogTitle>
              <DialogDescription>Remove “{deleting?.name}” from tomorrow?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={isDeleting} onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={async () => {
                  if (!deleting || deleting.date !== tomorrow || isDeleting) return;
                  setIsDeleting(true);
                  try {
                    await persist(tasks.filter((task) => task.id !== deleting.id));
                    setDeleting(null);
                  } catch {
                    // persist already restores the list and exposes the error.
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting && <LoaderCircle className="h-4 w-4 animate-spin" />}Delete task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
function DateRing({
  day,
  progress,
  selected,
}: {
  day: string;
  progress: number;
  selected: boolean;
}) {
  const id = "daily-ring-" + useId().replace(/:/g, ""),
    length = 125.66;
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const target = Math.max(selected ? 0.02 : 0, progress);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFill(target);
      return;
    }
    const frame = requestAnimationFrame(() => setFill(target));
    return () => cancelAnimationFrame(frame);
  }, [progress, selected]);
  return (
    <span className="relative grid h-10 w-10 place-items-center sm:h-14 sm:w-14">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <mask id={id}>
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={length}
              strokeDashoffset={length * (1 - fill)}
              transform="rotate(-90 24 24)"
              className="daily-ring-mask"
            />
          </mask>
        </defs>
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={selected ? "#555" : "#292929"}
          strokeWidth="3"
        />
        <g mask={`url(#${id})`}>
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--app-accent)" strokeWidth="3" />
          {progress > 0 && (
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="white"
              strokeWidth="1.4"
              opacity=".4"
              strokeDasharray="8 117.66"
              className="daily-ring-flow"
            />
          )}
        </g>
      </svg>
      <span className="text-sm sm:text-base">{new Date(day + "T12:00:00").getDate()}</span>
    </span>
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
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) menuAction.current = false;
      }}
    >
      <ContextMenuTrigger asChild disabled={readOnly}>
        <div
          tabIndex={readOnly ? undefined : 0}
          aria-label={readOnly ? undefined : `${task.name}; right-click for options`}
          className={`flex items-center gap-3 py-3 transition-colors hover:bg-white/[.035] ${grouped ? "px-4 sm:px-6" : "rounded-lg border border-white/10 bg-[#121212] px-3"}`}
        >
          <button
            type="button"
            disabled={readOnly}
            onClick={(event) => {
              event.stopPropagation();
              if (task.completed) onReopen(task.id);
              else onComplete(task);
            }}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border disabled:cursor-default ${task.completed ? "border-primary bg-primary text-primary-foreground" : readOnly ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-white/20 text-transparent hover:border-primary"}`}
          >
            {task.completed && <Check className="h-4 w-4" />}
            {!task.completed && readOnly && <X className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={
                  task.completed
                    ? "truncate text-sm text-zinc-500 line-through"
                    : "truncate text-sm font-medium"
                }
              >
                {task.name}
              </p>
              {points !== 0 && (
                <span
                  className={`ml-auto shrink-0 font-mono text-[11px] font-semibold ${points > 0 ? "text-emerald-300" : points < 0 ? "text-red-300" : "text-zinc-500"}`}
                >
                  <RollingNumber value={points} prefix={points > 0 ? "+" : ""} suffix=" pts" />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {task.subject} · {task.type}
              {task.completed && task.minutesSpent ? (
                <>
                  {" "}
                  · <RollingDuration minutes={task.minutesSpent} />
                </>
              ) : (
                ""
              )}
            </p>
          </div>
        </div>
      </ContextMenuTrigger>
      {!readOnly && (
        <ContextMenuContent
          className="w-44 rounded-xl border-white/10 bg-[#121212] p-1.5 text-zinc-100 shadow-xl"
          onCloseAutoFocus={(event) => {
            if (menuAction.current) event.preventDefault();
          }}
        >
          <ContextMenuItem
            className="gap-2 rounded-lg py-2.5 focus:bg-white/10 focus:text-white"
            onSelect={() => {
              menuAction.current = true;
              onEdit();
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit Task
          </ContextMenuItem>
          {canDelete && (
            <ContextMenuItem
              className="gap-2 rounded-lg py-2.5 text-red-300 focus:bg-red-400/10 focus:text-red-300"
              onSelect={() => {
                menuAction.current = true;
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
