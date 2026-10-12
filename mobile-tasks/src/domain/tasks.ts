export type TaskType = "Lecture" | "Revision" | "Mock" | "Practice Session" | "Other";

export type Task = {
  id: string;
  name: string;
  subject: string;
  type: TaskType;
  date: string;
  createdAt: string;
  completed: boolean;
  completedAt: string | null;
  minutesSpent: number | null;
};

export const TASK_STORAGE_KEY = "ssc-buddy:tasks:v2";
export const LEGACY_TASK_STORAGE_KEY = "ssc-buddy-mobile:tasks:v1";

export const TASK_TYPES: TaskType[] = ["Lecture", "Revision", "Mock", "Practice Session", "Other"];

/**
 * A scheduled task belongs to the calendar day the student sees on their
 * device. `toISOString()` is UTC, so in India it incorrectly rolls over at
 * 5:30 AM and makes yesterday appear as today. Keep task keys in local time,
 * matching the website's `todayKey` implementation.
 */
export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const dateKeyFromOffset = (offset: number, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
};

export const formatMinutes = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;

export const createTaskId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function summarizeTasks(tasks: Task[]) {
  const done = tasks.filter((task) => task.completed);
  return {
    total: tasks.length,
    done: done.length,
    minutes: done.reduce((total, task) => total + (task.minutesSpent ?? 0), 0),
    percent: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0,
  };
}

export function tasksInLastDays(tasks: Task[], days: number) {
  const result: Task[][] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    result.push(tasks.filter((task) => task.date === dateKey(day)));
  }
  return result;
}
