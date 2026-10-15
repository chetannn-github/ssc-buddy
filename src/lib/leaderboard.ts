import type { User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import type { DailyTask } from "@/lib/daily-tasks";
import type { PracticeProfile } from "@/lib/profile";

export type LeaderboardTask = { name: string; subject?: string; completed: boolean; date: string; points: number };
export type LeaderboardEntry = { uid: string; username: string; name: string; avatar?: string; points: number; completed: number; overdue: number; studyMinutes: number; week: string; leaderboardTasks?: LeaderboardTask[]; completedTasks?: Array<{ name: string; subject?: string }> };
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function currentWeekKey(now = new Date()) { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return day(start); }
export function weeklyScore(tasks: DailyTask[], week = currentWeekKey()) {
  const start = new Date(`${week}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 6); const today = day(new Date());
  const scoped = tasks.filter((task) => task.date >= week && task.date <= day(end));
  const completed = scoped.filter((task) => task.completed);
  const overdue = scoped.filter((task) => !task.completed && task.date < today).length;
  const studyMinutes = completed.reduce((sum, task) => sum + Math.max(0, task.minutesSpent ?? 0), 0);
  const timePoints = Math.min(30 * 7, Math.floor(studyMinutes / 10));
  return { completed: completed.length, overdue, studyMinutes, points: completed.length * 10 - overdue * 5 + timePoints };
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
  const end = new Date(`${week}T00:00:00`); end.setDate(end.getDate() + 6);
  const taskPoints = weeklyTaskPoints(tasks, week);
  const leaderboardTasks = tasks
    .filter((task) => task.date >= week && task.date <= day(end))
    .map((task) => ({ name: task.name, subject: task.subject, completed: task.completed, date: task.date, points: taskPoints.get(task.id) ?? 0 }));
  await setDoc(doc(getFirebaseFirestore(), "leaderboards", week, "entries", user.uid), { uid: user.uid, username: profile.username, name: profile.name, ...(profile.avatar ? { avatar: profile.avatar } : {}), week, ...score, leaderboardTasks, updatedAt: serverTimestamp() }, { merge: true });
}
export function watchLeaderboard(week: string, callback: (entries: LeaderboardEntry[]) => void): Unsubscribe {
  return onSnapshot(collection(getFirebaseFirestore(), "leaderboards", week, "entries"), (snapshot) => callback(snapshot.docs.map((item) => item.data() as LeaderboardEntry).sort((a,b) => b.points-a.points || b.studyMinutes-a.studyMinutes || b.completed-a.completed)));
}
