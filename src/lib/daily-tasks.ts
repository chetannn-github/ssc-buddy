export type DailyTask = {
  id: string;
  title: string;
  subject: string;
  targetMinutes: number;
  date: string;
  completedAt: string | null;
};

const KEY = "ssc-buddy-daily-tasks";

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function loadDailyTasks(): DailyTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((task): task is DailyTask => !!task && typeof task === "object" && typeof (task as DailyTask).id === "string" && typeof (task as DailyTask).title === "string" && typeof (task as DailyTask).date === "string");
  } catch { return []; }
}

export function saveDailyTasks(tasks: DailyTask[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
  window.dispatchEvent(new Event("ssc-daily-tasks-updated"));
}

export function taskStats(tasks: DailyTask[]) {
  const target = tasks.reduce((sum, task) => sum + task.targetMinutes, 0);
  const completed = tasks.filter((task) => task.completedAt).reduce((sum, task) => sum + task.targetMinutes, 0);
  const done = tasks.filter((task) => task.completedAt).length;
  return { target, completed, done, total: tasks.length, percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}
