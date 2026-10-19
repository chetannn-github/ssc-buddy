const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function leaderboardWeek(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return dateKey(start);
}

export function shiftLeaderboardWeek(week: string, offset: number) {
  const date = new Date(`${week}T12:00:00`);
  date.setDate(date.getDate() + offset * 7);
  return dateKey(date);
}

export function validLeaderboardWeek(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value && date.getDay() === 1 && value <= leaderboardWeek() ? value : undefined;
}

export function leaderboardWeekLabel(week: string) {
  const start = new Date(`${week}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${format(start)} – ${format(end)}`;
}

type RankedEntry = { uid: string; points?: number; studyMinutes?: number; completed?: number };
type WeeklyTask = { date: string; completed: boolean; minutesSpent?: number | null; points?: number };
type ResultEntry = RankedEntry & { leaderboardTasks?: WeeklyTask[] };

/** Close a saved week at next Monday, even when its last upload happened on Sunday. */
export function finalizeWeeklyEntry<T extends ResultEntry>(entry: T, week: string, now = new Date()): T {
  if (week >= leaderboardWeek(now) || !Array.isArray(entry.leaderboardTasks)) return entry;
  const cutoff = shiftLeaderboardWeek(week, 1);
  const scoped = entry.leaderboardTasks.filter((task) => task.date >= week && task.date < cutoff);
  let creditedMinutes = 0;
  const leaderboardTasks = scoped.map((task) => {
    if (!task.completed) return { ...task, points: -5 };
    const before = Math.min(210, Math.floor(creditedMinutes / 10));
    creditedMinutes += Math.max(0, Number(task.minutesSpent) || 0);
    return { ...task, points: 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before };
  });
  const first = scoped.map((task) => task.date).sort()[0];
  const inactiveDates: string[] = [];
  if (first) {
    for (const date = new Date(`${first}T12:00:00`); dateKey(date) < cutoff; date.setDate(date.getDate() + 1)) {
      if (!scoped.some((task) => task.date === dateKey(date) && task.completed)) inactiveDates.push(dateKey(date));
    }
  }
  const completed = scoped.filter((task) => task.completed);
  return {
    ...entry, leaderboardTasks, completed: completed.length,
    overdue: scoped.length - completed.length,
    inactiveDates, inactiveDays: inactiveDates.length,
    studyMinutes: creditedMinutes,
    points: leaderboardTasks.reduce((total, task) => total + task.points, 0) - inactiveDates.length * 50,
  };
}

export function resolveWeeklyResults<T extends ResultEntry>(entries: T[], week: string, now = new Date()): T[] {
  return rankWeeklyEntries(entries.map((entry) => finalizeWeeklyEntry(entry, week, now)));
}

export function rankWeeklyEntries<T extends RankedEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0)
    || (Number(b.studyMinutes) || 0) - (Number(a.studyMinutes) || 0)
    || (Number(b.completed) || 0) - (Number(a.completed) || 0)
    || a.uid.localeCompare(b.uid));
}

export type WeeklyAward = { week: string; rank: number; points: number };
export function weeklyAward(entries: ResultEntry[], uid: string, week: string, now = new Date()): WeeklyAward | null {
  if (week >= leaderboardWeek(now)) return null;
  const ranked = resolveWeeklyResults(entries, week, now);
  const index = ranked.findIndex((entry) => entry.uid === uid);
  const entry = ranked[index];
  if (!entry || index > 2 || !(Number(entry.completed) > 0 || Number(entry.studyMinutes) > 0)) return null;
  return { week, rank: index + 1, points: Number(entry.points) || 0 };
}

export const weeklyAwardSeenKey = (uid: string, week: string) => `ssc-buddy:weekly-award-seen:${uid}:${week}`;

/** Include every completed week since tracking began, including weeks with no surviving tasks. */
export function completedLeaderboardWeeks(dates: string[], current = leaderboardWeek()): string[] {
  const previous = shiftLeaderboardWeek(current, -1);
  const validDates = dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(new Date(`${date}T12:00:00`).getTime()) && date < current).sort();
  const first = validDates[0] ? leaderboardWeek(new Date(`${validDates[0]}T12:00:00`)) : previous;
  const weeks: string[] = [];
  for (let week = first; week < current; week = shiftLeaderboardWeek(week, 1)) weeks.push(week);
  return weeks;
}

export function countWeeklyMedals(awards: Array<WeeklyAward | null>) {
  const counts = { gold: 0, silver: 0, bronze: 0 };
  const weeks = new Set<string>();
  for (const award of awards) {
    if (!award || weeks.has(award.week)) continue;
    weeks.add(award.week);
    if (award.rank === 1) counts.gold += 1;
    if (award.rank === 2) counts.silver += 1;
    if (award.rank === 3) counts.bronze += 1;
  }
  return counts;
}
