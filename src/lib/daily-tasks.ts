export const TASK_TYPES = ["Lecture", "Revision", "Mock", "Practice Session", "Other"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export type DailyTask = {
  id: string;
  name: string;
  subject: string;
  type: TaskType;
  createdAt: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  minutesSpent: number | null;
};

export type TaskDraft = Pick<DailyTask, "name" | "subject" | "type">;
export type RangeKey = "today" | "week" | "month" | "3months" | "year";

const STORAGE_KEY = "ssc-buddy:tasks:v2";

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours && remainder ? `${hours}h ${remainder}m` : hours ? `${hours}h` : `${remainder}m`;
}

export function rangeBounds(range: RangeKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === "today") return { from: todayKey(today), to: todayKey(today) };
  if (range === "week") {
    const from = new Date(today);
    from.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return { from: todayKey(from), to: todayKey(today) };
  }
  if (range === "month") return { from: todayKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayKey(today) };
  if (range === "3months") {
    const from = new Date(today);
    from.setMonth(today.getMonth() - 3);
    return { from: todayKey(from), to: todayKey(today) };
  }
  return { from: todayKey(new Date(today.getFullYear(), 0, 1)), to: todayKey(today) };
}

export function summarizeTasks(tasks: DailyTask[]) {
  const completed = tasks.filter((task) => task.completed);
  const minutes = completed.reduce((sum, task) => sum + (task.minutesSpent ?? 0), 0);
  return { total: tasks.length, completed: completed.length, pending: tasks.length - completed.length, minutes };
}

function readTasks(): DailyTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DailyTask[]) : [];
  } catch {
    return [];
  }
}

export function loadDailyTasks() {
  if (typeof window === "undefined") return [];
  return readTasks();
}

export function saveDailyTasks(tasks: DailyTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
