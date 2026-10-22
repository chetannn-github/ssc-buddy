import { summarizeXp } from "./xp-levels";
export { xpForLevel, xpSegmentProgress } from "./xp-levels";
import type { Task } from "./tasks";

export type XpSummary = { xp: number; level: number; levelStart: number; nextLevelXp: number; progress: number };

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};


export const levelName = (level: number) => {
  const names = ["Noob", "Rookie", "Grinder", "Striker", "Slayer", "Apex", "Legend"];
  return names[level] ?? "Legend";
};

/** Every past calendar day after the first task day counts, even with no task planned. */
const inactiveCalendarDays = (tasks: Pick<Task, "completed" | "date" | "createdAt">[], today: string) => {
  const startedOn = tasks
    .map((task) => task.date)
    .filter((date) => date <= today)
    .sort()[0];
  if (!startedOn || startedOn >= today) return 0;
  const activeDays = new Set(tasks.filter((task) => task.completed).map((task) => task.date));
  const cursor = new Date(`${startedOn}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  let inactiveDays = 0;
  while (cursor < end) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (!activeDays.has(date)) inactiveDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return inactiveDays;
};

export function getXpSummary(tasks: Pick<Task, "completed" | "date" | "minutesSpent" | "createdAt">[], focusXp = 0): XpSummary {
  const today = todayKey();
  const completed = tasks.filter((task) => task.completed);
  const minutes = completed.reduce((total, task) => total + Math.max(0, Number(task.minutesSpent) || 0), 0);
  const overdue = tasks.filter((task) => !task.completed && task.date < today).length;
  const inactiveDays = inactiveCalendarDays(tasks, today);
  const xp = completed.length * 10 + Math.floor(minutes / 10) - overdue * 5 - inactiveDays * 50;
  return summarizeXp(xp + Math.max(0, focusXp));
}
