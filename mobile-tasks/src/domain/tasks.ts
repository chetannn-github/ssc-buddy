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
  targetMinutes: number;
  minutesSpent: number | null;
};

export const TASK_TYPES: TaskType[] = ["Lecture", "Revision", "Mock", "Practice Session", "Other"];

export const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);

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
    targetMinutes: tasks.reduce((total, task) => total + task.targetMinutes, 0),
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
