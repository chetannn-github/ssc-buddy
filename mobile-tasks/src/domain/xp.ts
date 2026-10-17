import type { Task } from "./tasks";

export type XpSummary = { xp: number; level: number; levelStart: number; nextLevelXp: number; progress: number };

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Cumulative level thresholds double after level 1:
 * 0, 500, 1000, 2000, 4000… Negative XP stays at level 0.
 */
export const xpForLevel = (level: number) => {
  if (level <= 1) return 0;
  return 500 * 2 ** (level - 2);
};

export const levelName = (level: number) => {
  const names = ["Rookie", "Rookie", "Grinder", "Striker", "Slayer", "Apex", "Legend"];
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

export function getXpSummary(tasks: Pick<Task, "completed" | "date" | "minutesSpent" | "createdAt">[]): XpSummary {
  const today = todayKey();
  const completed = tasks.filter((task) => task.completed);
  const minutes = completed.reduce((total, task) => total + Math.max(0, Number(task.minutesSpent) || 0), 0);
  const overdue = tasks.filter((task) => !task.completed && task.date < today).length;
  const inactiveDays = inactiveCalendarDays(tasks, today);
  const xp = completed.length * 10 + Math.floor(minutes / 10) - overdue * 5 - inactiveDays * 50;
  // Level 0 is the recovery band: its line should still advance as a negative
  // XP total moves toward Level 1 rather than appearing permanently locked.
  if (xp < 0) return { xp, level: 0, levelStart: -500, nextLevelXp: 0, progress: Math.max(0, Math.min(1, (xp + 500) / 500)) };
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  const levelStart = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return { xp, level, levelStart, nextLevelXp, progress: Math.max(0, Math.min(1, (xp - levelStart) / (nextLevelXp - levelStart))) };
}
