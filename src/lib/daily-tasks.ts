import { useCallback, useEffect, useState } from "react";

export const SUBJECTS = ["Other"] as const;
export type Subject = string;
export type TaskType = "lecture" | "revision" | "mock" | "practice session" | "other";
export type Task = {
  id: string;
  name: string;
  subject: Subject;
  type: TaskType;
  targetMinutes: number;
  actualMinutes: number | null;
  date: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
};
export type TaskDraft = Pick<Task, "name" | "subject" | "type" | "targetMinutes" | "date">;
const KEY = "ssc-buddy.daily-tasks.v1";
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const dayKey = toDateKey;
export function fromDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}
export function shiftDateKey(key: string, amount: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}
export function formatDateLabel(key: string) {
  return fromDateKey(key).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}
export function formatShortDate(key: string) {
  return fromDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function formatDuration(minutes: number) {
  const value = Math.max(0, Math.round(minutes));
  return value >= 60
    ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`
    : `${value}m`;
}
export function formatTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
}
export function loadDailyTasks(): Task[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (task): task is Partial<Task> & { id: string } =>
          !!task && typeof task === "object" && typeof (task as Task).id === "string",
      )
      .map((task) => ({
        id: task.id,
        name: task.name ?? "Task",
        subject: task.subject ?? "Other",
        type: task.type ?? "other",
        targetMinutes: task.targetMinutes ?? 60,
        actualMinutes: task.actualMinutes ?? null,
        date: task.date ?? toDateKey(),
        completed: Boolean(task.completed),
        completedAt: task.completedAt ?? null,
        createdAt: task.createdAt ?? new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export function saveDailyTasks(tasks: Task[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
  window.dispatchEvent(new Event("ssc-daily-tasks-updated"));
}

export type DayStats = {
  date: string;
  totalTasks: number;
  completedTasks: number;
  targetMinutes: number;
  completedMinutes: number;
  percent: number;
};
export function statsForTasks(date: string, tasks: Task[]): DayStats {
  const current = tasks.filter((task) => task.date === date);
  const targetMinutes = current.reduce((sum, task) => sum + task.targetMinutes, 0);
  const completedMinutes = current
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + (task.actualMinutes ?? task.targetMinutes), 0);
  return {
    date,
    totalTasks: current.length,
    completedTasks: current.filter((task) => task.completed).length,
    targetMinutes,
    completedMinutes,
    percent: targetMinutes ? Math.round((completedMinutes / targetMinutes) * 100) : 0,
  };
}
export function rangeStats(tasks: Task[], days: number, endDate: string) {
  return Array.from({ length: days }, (_, index) =>
    statsForTasks(shiftDateKey(endDate, index - days + 1), tasks),
  );
}
export function dayState(stats: DayStats): "missed" | "partial" | "done" {
  return stats.totalTasks === 0 || stats.completedMinutes === 0
    ? "missed"
    : stats.percent >= 70
      ? "done"
      : "partial";
}
export function computeInsights(tasks: Task[], today: string) {
  const dates = [...new Set(tasks.map((task) => task.date))];
  const active = dates.map((date) => statsForTasks(date, tasks)).filter((day) => day.totalTasks);
  const average = (fn: (day: DayStats) => number) =>
    active.length ? active.reduce((sum, day) => sum + fn(day), 0) / active.length : 0;
  let streak = 0;
  for (let date = today; ; date = shiftDateKey(date, -1)) {
    const day = statsForTasks(date, tasks);
    if (day.totalTasks && day.percent >= 70) streak++;
    else break;
  }
  const bestMinutes = active.reduce<DayStats | null>(
    (best, day) => (!best || day.completedMinutes > best.completedMinutes ? day : best),
    null,
  );
  const bestPercent = active.reduce<DayStats | null>(
    (best, day) => (!best || day.percent > best.percent ? day : best),
    null,
  );
  return {
    avgTarget: average((day) => day.targetMinutes),
    avgCompleted: average((day) => day.completedMinutes),
    avgPercent: average((day) => day.percent),
    totalMinutes: tasks
      .filter((task) => task.completed)
      .reduce((sum, task) => sum + task.targetMinutes, 0),
    totalTasks: tasks.filter((task) => task.completed).length,
    streak,
    bestMinutes,
    bestPercent,
  };
}
export function taskStats(tasks: Task[]) {
  const target = tasks.reduce((sum, task) => sum + task.targetMinutes, 0);
  const completed = tasks
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + task.targetMinutes, 0);
  const done = tasks.filter((task) => task.completed).length;
  return {
    target,
    completed,
    done,
    total: tasks.length,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setTasks(loadDailyTasks());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveDailyTasks(tasks);
  }, [tasks, hydrated]);
  const addTask = useCallback(
    (draft: TaskDraft) =>
      setTasks((prev) => [
        ...prev,
        {
          ...draft,
          id: crypto.randomUUID(),
          completed: false,
          completedAt: null,
          actualMinutes: null,
          createdAt: new Date().toISOString(),
        },
      ]),
    [],
  );
  const updateTask = useCallback(
    (id: string, patch: Partial<TaskDraft>) =>
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task))),
    [],
  );
  const deleteTask = useCallback(
    (id: string) => setTasks((prev) => prev.filter((task) => task.id !== id)),
    [],
  );
  const toggleTask = useCallback(
    (id: string, actualMinutes?: number) =>
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? {
                ...task,
                completed: !task.completed,
                completedAt: !task.completed ? new Date().toISOString() : null,
                actualMinutes: !task.completed ? (actualMinutes ?? task.targetMinutes) : null,
              }
            : task,
        ),
      ),
    [],
  );
  return { tasks, hydrated, addTask, updateTask, deleteTask, toggleTask };
}
