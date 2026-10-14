import type { User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import type { DailyTask } from "@/lib/daily-tasks";
import type { PracticeProfile } from "@/lib/profile";

export type LeaderboardEntry = { uid: string; username: string; name: string; avatar?: string; points: number; completed: number; overdue: number; studyMinutes: number; week: string; completedTasks?: Array<{ name: string; subject?: string }> };
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
export async function publishLeaderboardEntry(user: User, profile: PracticeProfile, tasks: DailyTask[]) {
  if (!profile.username) return; const week = currentWeekKey(); const score = weeklyScore(tasks, week);
  const completedTasks = tasks
    .filter((task) => task.completed && task.date >= week && task.date <= day(new Date(new Date(`${week}T00:00:00`).setDate(new Date(`${week}T00:00:00`).getDate() + 6))))
    .map((task) => ({ name: task.name, subject: task.subject }));
  await setDoc(doc(getFirebaseFirestore(), "leaderboards", week, "entries", user.uid), { uid: user.uid, username: profile.username, name: profile.name, ...(profile.avatar ? { avatar: profile.avatar } : {}), week, ...score, completedTasks, updatedAt: serverTimestamp() }, { merge: true });
}
export function watchLeaderboard(week: string, callback: (entries: LeaderboardEntry[]) => void): Unsubscribe {
  return onSnapshot(collection(getFirebaseFirestore(), "leaderboards", week, "entries"), (snapshot) => callback(snapshot.docs.map((item) => item.data() as LeaderboardEntry).sort((a,b) => b.points-a.points || b.studyMinutes-a.studyMinutes || b.completed-a.completed)));
}
