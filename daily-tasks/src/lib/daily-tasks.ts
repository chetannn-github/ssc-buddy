import { useCallback, useEffect, useState } from "react";

export const SUBJECTS = ["Maths", "GS", "Reasoning", "English", "Other"] as const;
export type Subject = (typeof SUBJECTS)[number];

export type Task = {
  id: string;
  name: string;
  subject: Subject;
  targetMinutes: number;
  /** yyyy-mm-dd */
  date: string;
  completed: boolean;
  /** ISO timestamp when marked complete */
  completedAt: string | null;
  createdAt: string;
};

export type TaskDraft = {
  name: string;
  subject: Subject;
  targetMinutes: number;
  date: string;
};

const STORAGE_KEY = "ssc-buddy.daily-tasks.v1";

/* ---------------- date helpers ---------------- */

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function shiftDateKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function formatDateLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function formatShortDate(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ---------------- stats ---------------- */

export type DayStats = {
  date: string;
  totalTasks: number;
  completedTasks: number;
  targetMinutes: number;
  completedMinutes: number;
  percent: number;
};

export function statsForTasks(date: string, tasks: Task[]): DayStats {
  const dayTasks = tasks.filter((t) => t.date === date);
  const targetMinutes = dayTasks.reduce((s, t) => s + t.targetMinutes, 0);
  const completedMinutes = dayTasks
    .filter((t) => t.completed)
    .reduce((s, t) => s + t.targetMinutes, 0);
  return {
    date,
    totalTasks: dayTasks.length,
    completedTasks: dayTasks.filter((t) => t.completed).length,
    targetMinutes,
    completedMinutes,
    percent: targetMinutes > 0 ? Math.round((completedMinutes / targetMinutes) * 100) : 0,
  };
}

export function rangeStats(tasks: Task[], days: number, endDate: string): DayStats[] {
  const out: DayStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(statsForTasks(shiftDateKey(endDate, -i), tasks));
  }
  return out;
}

export type Insights = {
  avgTarget: number;
  avgCompleted: number;
  avgPercent: number;
  totalMinutes: number;
  totalTasks: number;
  streak: number;
  bestMinutes: DayStats | null;
  bestPercent: DayStats | null;
};

const SUCCESS_THRESHOLD = 70;

export function computeInsights(tasks: Task[], today: string): Insights {
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  }
  const days = [...byDate.keys()].sort().map((d) => statsForTasks(d, tasks));
  const active = days.filter((d) => d.totalTasks > 0);

  const avg = (fn: (d: DayStats) => number) =>
    active.length ? active.reduce((s, d) => s + fn(d), 0) / active.length : 0;

  let streak = 0;
  let cursor = today;
  // today only breaks the streak once it has tasks that failed; start from today or yesterday
  for (let i = 0; i < 366; i++) {
    const s = statsForTasks(cursor, tasks);
    const success = s.totalTasks > 0 && s.percent >= SUCCESS_THRESHOLD;
    if (success) {
      streak++;
    } else if (!(i === 0)) {
      break;
    }
    cursor = shiftDateKey(cursor, -1);
  }

  const bestMinutes = active.reduce<DayStats | null>(
    (best, d) => (!best || d.completedMinutes > best.completedMinutes ? d : best),
    null,
  );
  const bestPercent = active.reduce<DayStats | null>(
    (best, d) => (!best || d.percent > best.percent ? d : best),
    null,
  );

  return {
    avgTarget: avg((d) => d.targetMinutes),
    avgCompleted: avg((d) => d.completedMinutes),
    avgPercent: avg((d) => d.percent),
    totalMinutes: tasks.filter((t) => t.completed).reduce((s, t) => s + t.targetMinutes, 0),
    totalTasks: tasks.filter((t) => t.completed).length,
    streak,
    bestMinutes: bestMinutes && bestMinutes.completedMinutes > 0 ? bestMinutes : null,
    bestPercent: bestPercent && bestPercent.completedMinutes > 0 ? bestPercent : null,
  };
}

export function dayState(stats: DayStats): "missed" | "partial" | "done" {
  if (stats.totalTasks === 0 || stats.completedMinutes === 0) return "missed";
  return stats.percent >= SUCCESS_THRESHOLD ? "done" : "partial";
}

/* ---------------- persistence hook ---------------- */

function load(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : [];
  } catch {
    return [];
  }
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTasks(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* storage unavailable */
    }
  }, [tasks, hydrated]);

  const addTask = useCallback((draft: TaskDraft) => {
    setTasks((prev) => [
      ...prev,
      {
        ...draft,
        id: crypto.randomUUID(),
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<TaskDraft>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: !t.completed,
              completedAt: !t.completed ? new Date().toISOString() : null,
            }
          : t,
      ),
    );
  }, []);

  return { tasks, hydrated, addTask, updateTask, deleteTask, toggleTask };
}
