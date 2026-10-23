import type { User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { observeOnce } from "../../shared/read-once";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import type { DailyTask } from "@/lib/daily-tasks";
import type { PracticeProfile } from "@/lib/profile";
import { getXpSummary } from "@/lib/xp";
import { leaderboardWeek, resolveWeeklyResults } from "../../mobile-tasks/src/domain/weekly-results";

export type LeaderboardTask = { name: string; subject?: string; type?: string; minutesSpent?: number; completed: boolean; date: string; points: number };
export type LeaderboardEntry = { uid: string; username: string; name: string; avatar?: string; points: number; xp?: number; level?: number; completed: number; overdue: number; inactiveDays: number; inactiveDates?: string[]; studyMinutes: number; week: string; focusDays?: Record<string, number>; focusXp?: number; focusMilliseconds?: number; focusPoints?: number; leaderboardTasks?: LeaderboardTask[]; completedTasks?: Array<{ name: string; subject?: string }> };
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const currentWeekKey = leaderboardWeek;
export function weeklyScore(tasks: DailyTask[], week = currentWeekKey()) {
  const start = new Date(`${week}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 6); const today = day(new Date());
  const scoped = tasks.filter((task) => task.date >= week && task.date <= day(end));
  const completed = scoped.filter((task) => task.completed);
  const overdue = scoped.filter((task) => !task.completed && task.date < today).length;
  const firstTrackedDay = scoped.filter((task) => task.date < today).map((task) => task.date).sort()[0];
  const inactiveDates: string[] = [];
  for (const cursor = new Date(`${firstTrackedDay ?? today}T00:00:00`); day(cursor) < today && cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (!scoped.some((task) => task.date === day(cursor) && task.completed)) inactiveDates.push(day(cursor));
  }
  const inactiveDays = inactiveDates.length;
  const studyMinutes = completed.reduce((sum, task) => sum + Math.max(0, task.minutesSpent ?? 0), 0);
  const timePoints = Math.min(30 * 7, Math.floor(studyMinutes / 10));
  return { completed: completed.length, overdue, inactiveDays, inactiveDates, studyMinutes, points: completed.length * 10 - overdue * 5 - inactiveDays * 50 + timePoints };
}
export function weeklyTaskPoints(tasks: DailyTask[], week = currentWeekKey()) {
  const end = new Date(`${week}T00:00:00`); end.setDate(end.getDate() + 6); const today = day(new Date()); let creditedMinutes = 0;
  return new Map(tasks.filter((task) => task.date >= week && task.date <= day(end)).map((task) => {
    if (!task.completed) return [task.id, task.date < today ? -5 : 0] as const;
    const before = Math.min(210, Math.floor(creditedMinutes / 10)); creditedMinutes += Math.max(0, task.minutesSpent ?? 0);
    return [task.id, 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before] as const;
  }));
}
export async function publishLeaderboardEntry(user: User, profile: PracticeProfile, tasks: DailyTask[]) {
  if (!profile.username) return; const week = currentWeekKey(); const score = weeklyScore(tasks, week);
  const { xp, level } = getXpSummary(tasks);
  const end = new Date(`${week}T00:00:00`); end.setDate(end.getDate() + 6);
  const taskPoints = weeklyTaskPoints(tasks, week);
  const leaderboardTasks = tasks
    .filter((task) => task.date >= week && task.date <= day(end))
    .map((task) => ({ name: task.name, subject: task.subject, type: task.type, minutesSpent: task.minutesSpent, completed: task.completed, date: task.date, points: taskPoints.get(task.id) ?? 0 }));
  await setDoc(doc(getFirebaseFirestore(), "leaderboards", week, "entries", user.uid), { uid: user.uid, username: profile.username, name: profile.name, ...(profile.avatar ? { avatar: profile.avatar } : {}), week, xp, level, ...score, leaderboardTasks, updatedAt: serverTimestamp() }, { merge: true });
}
export function loadLeaderboard(week: string, callback: (entries: LeaderboardEntry[]) => void): Unsubscribe {
  const db = getFirebaseFirestore();
  return observeOnce(db, JSON.stringify(["leaderboard", week]), async () => {
    const snapshot = await getDocs(collection(db, "leaderboards", week, "entries"));
    return resolveWeeklyResults(snapshot.docs.map(item => ({ ...item.data(), uid: item.id }) as LeaderboardEntry), week);
  }, callback, () => callback([]));
}
