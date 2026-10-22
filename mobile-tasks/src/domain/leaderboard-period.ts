import { focusPoints } from "../../../shared/focus-rewards";

export const ALL_LEADERBOARD_DAYS = "all";

type Entry = {
  points?: number;
  completed?: number;
  studyMinutes?: number;
  inactiveDates?: string[];
  focusDays?: Record<string, number>;
};
type Task = { completed: boolean; date: string; points: number; minutesSpent?: number | null };
const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Use published task points so the weekly time-bonus cap is respected per day. */
export function leaderboardPeriodStats(entry: Entry, tasks: Task[], period: string) {
  if (period === ALL_LEADERBOARD_DAYS)
    return {
      points: number(entry.points),
      completed: number(entry.completed),
      notCompleted: tasks.filter((task) => !task.completed).length,
      studyMinutes: number(entry.studyMinutes),
      focusMilliseconds: Object.values(entry.focusDays ?? {}).reduce((sum, value) => sum + number(value), 0),
      focusPoints: Object.values(entry.focusDays ?? {}).reduce((sum, value) => sum + focusPoints(value), 0),
    };
  const selected = tasks.filter((task) => task.date === period);
  const completed = selected.filter((task) => task.completed);
  return {
    points:
      selected.reduce((total, task) => total + number(task.points), 0) -
      (entry.inactiveDates?.includes(period) ? 50 : 0) + focusPoints(entry.focusDays?.[period] ?? 0),
    focusMilliseconds: number(entry.focusDays?.[period]),
    focusPoints: focusPoints(entry.focusDays?.[period] ?? 0),
    completed: completed.length,
    notCompleted: selected.length - completed.length,
    studyMinutes: completed.reduce(
      (total, task) => total + Math.max(0, number(task.minutesSpent)),
      0,
    ),
  };
}

export function leaderboardPeriodTasks<T extends Task>(
  tasks: T[],
  inactiveDates: string[],
  period: string,
  focusDays: Record<string, number> = {},
) {
  const penalties = [...new Set(inactiveDates)]
    .filter((date) => period === ALL_LEADERBOARD_DAYS || date === period)
    .map((date) => ({
      name: "No task completed",
      subject: "",
      type: "",
      minutesSpent: 0,
      completed: false,
      date,
      points: -50,
    }));
  return [
    ...penalties,
    ...Object.entries(focusDays).filter(([date, value]) => value > 0 && (period === ALL_LEADERBOARD_DAYS || date === period)).map(([date, value]) => ({ name: "Focus time", subject: "", type: "Focus Lock", minutesSpent: Math.floor(value / 60000), completed: true, date, points: focusPoints(value), focus: true })),
    ...tasks.filter((task) => period === ALL_LEADERBOARD_DAYS || task.date === period),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
