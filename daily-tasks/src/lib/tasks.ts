import type { Subject } from "./syllabus";

export const TASK_TYPES = [
  "Lecture",
  "Revision",
  "Mock",
  "Practice Session",
  "Other",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type Task = {
  id: string;
  name: string;
  subject: Subject;
  type: TaskType;
  /** ISO datetime the record was created */
  createdAt: string;
  /** yyyy-mm-dd the task belongs to */
  date: string;
  completed: boolean;
  /** ISO datetime of completion */
  completedAt: string | null;
  /** minutes spent, only for completed tasks */
  minutesSpent: number | null;
  notes?: string;
};

export const todayKey = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const formatDuration = (minutes: number) => {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const formatDayLabel = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));
  const pretty = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  if (dateKey === today) return `Today — ${pretty.split(", ").slice(1).join(", ")}`;
  if (dateKey === yesterday) return `Yesterday — ${pretty.split(", ").slice(1).join(", ")}`;
  return pretty.replace(", ", " — ");
};

export type RangeKey = "today" | "week" | "month" | "3months" | "year" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "3months", label: "Last 3 Months" },
  { key: "year", label: "This Year" },
];

export function rangeBounds(
  key: RangeKey,
  custom?: { from: string; to: string },
): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: todayKey(start), to: todayKey(start) };
    case "week": {
      const day = (start.getDay() + 6) % 7; // Monday start
      const from = new Date(start);
      from.setDate(start.getDate() - day);
      return { from: todayKey(from), to: todayKey(start) };
    }
    case "month":
      return {
        from: todayKey(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: todayKey(start),
      };
    case "3months": {
      const from = new Date(start);
      from.setMonth(start.getMonth() - 3);
      return { from: todayKey(from), to: todayKey(start) };
    }
    case "year":
      return { from: todayKey(new Date(now.getFullYear(), 0, 1)), to: todayKey(start) };
    case "custom":
      return {
        from: custom?.from || todayKey(start),
        to: custom?.to || todayKey(start),
      };
  }
}

export function filterTasks(
  tasks: Task[],
  bounds: { from: string; to: string },
  subject: string,
) {
  return tasks.filter(
    (t) =>
      t.date >= bounds.from &&
      t.date <= bounds.to &&
      (subject === "All Subjects" || t.subject === subject),
  );
}

export function summarize(tasks: Task[]) {
  const completed = tasks.filter((t) => t.completed);
  const totalMinutes = completed.reduce((s, t) => s + (t.minutesSpent ?? 0), 0);
  return {
    total: tasks.length,
    completed: completed.length,
    pending: tasks.length - completed.length,
    totalMinutes,
    avgMinutes: completed.length ? Math.round(totalMinutes / completed.length) : 0,
    completionRate: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
  };
}

export function groupBy<K extends string>(tasks: Task[], pick: (t: Task) => K) {
  const map = new Map<K, { key: K; tasks: number; minutes: number }>();
  for (const t of tasks.filter((x) => x.completed)) {
    const k = pick(t);
    const cur = map.get(k) ?? { key: k, tasks: 0, minutes: 0 };
    cur.tasks += 1;
    cur.minutes += t.minutesSpent ?? 0;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}
