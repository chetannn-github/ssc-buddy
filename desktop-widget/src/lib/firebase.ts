import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

export const TASK_TYPES = ["Lecture", "Revision", "Mock", "Practice Session", "Learn", "Other"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
/** Exact existing web/mobile task document contract. Do not add fields here. */
export type DailyTask = {
  id: string;
  name: string;
  subject: string;
  type: TaskType;
  createdAt: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  minutesSpent: number | null;
};
export type QuickRecallLearningStat = { askedCount: number; correctCount: number; wrongCount: number; lastAskedAt: string; lastOutcome: "correct" | "wrong" };
export type QuickRecallSeed = { subjects: unknown[]; attempts: unknown[]; favouriteQuestionIds: string[]; learningStats: Record<string, QuickRecallLearningStat> };

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const app = firebaseConfigured ? initializeApp(config) : null;
// IndexedDB persistence gives cached reads, locally queued writes, and automatic
// reconnect replay. This is Firestore's native conflict-safe offline mechanism.
const db = app ? initializeFirestore(app, { localCache: persistentLocalCache() }) : null;
const auth = app ? getAuth(app) : null;

const tasksFor = (user: User) => collection(db!, "users", user.uid, "tasks");
const taskRef = (user: User, id: string) => doc(db!, "users", user.uid, "tasks", id);
const profileRef = (user: User) => doc(db!, "users", user.uid, "profile", "current");

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentWeekKey = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return dayKey(start);
};

const overallXpSummary = (tasks: DailyTask[]) => {
  const today = dayKey(new Date());
  const completed = tasks.filter((task) => task.completed);
  const studyMinutes = completed.reduce((total, task) => total + Math.max(0, task.minutesSpent ?? 0), 0);
  const overdue = tasks.filter((task) => !task.completed && task.date < today).length;
  const firstTaskDay = tasks.filter((task) => task.date < today).map((task) => task.date).sort()[0];
  let inactiveDays = 0;
  for (const cursor = new Date(`${firstTaskDay ?? today}T00:00:00`); dayKey(cursor) < today; cursor.setDate(cursor.getDate() + 1)) {
    if (!tasks.some((task) => task.date === dayKey(cursor) && task.completed)) inactiveDays += 1;
  }
  const xp = completed.length * 10 + Math.floor(studyMinutes / 10) - overdue * 5 - inactiveDays * 50;
  if (xp < 0) return { xp, level: 0 };
  let level = 1;
  const xpForLevel = (value: number) => value <= 1 ? 0 : 500 * 2 ** (value - 2);
  while (xp >= xpForLevel(level + 1)) level += 1;
  return { xp, level };
};

/** Rebuilds the same weekly leaderboard entry used by the web and mobile apps. */
async function publishLeaderboardAfterTaskChange(user: User) {
  const [profileSnapshot, taskSnapshot] = await Promise.all([getDoc(profileRef(user)), getDocs(tasksFor(user))]);
  const profile = profileSnapshot.data() ?? {};
  const username = typeof profile.username === "string" ? profile.username.trim().toLowerCase() : "";
  if (!username) return;

  const week = currentWeekKey();
  const end = new Date(`${week}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const endKey = dayKey(end);
  const today = dayKey(new Date());
  const tasks = taskSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as DailyTask));
  const { xp, level } = overallXpSummary(tasks);
  const scoped = tasks.filter((task) => task.date >= week && task.date <= endKey);
  const completed = scoped.filter((task) => task.completed);
  const overdue = scoped.filter((task) => !task.completed && task.date < today).length;
  const firstTrackedDay = scoped.filter((task) => task.date < today).map((task) => task.date).sort()[0];
  const inactiveDates: string[] = [];
  for (const cursor = new Date(`${firstTrackedDay ?? today}T00:00:00`); dayKey(cursor) < today; cursor.setDate(cursor.getDate() + 1)) {
    if (!scoped.some((task) => task.date === dayKey(cursor) && task.completed)) inactiveDates.push(dayKey(cursor));
  }
  const inactiveDays = inactiveDates.length;
  const studyMinutes = completed.reduce((total, task) => total + Math.max(0, task.minutesSpent ?? 0), 0);
  let creditedMinutes = 0;
  const leaderboardTasks = scoped.map((task) => {
    if (!task.completed) return { name: task.name, subject: task.subject, type: task.type, minutesSpent: task.minutesSpent, completed: false, date: task.date, points: task.date < today ? -5 : 0 };
    const before = Math.min(210, Math.floor(creditedMinutes / 10));
    creditedMinutes += Math.max(0, task.minutesSpent ?? 0);
    return { name: task.name, subject: task.subject, type: task.type, minutesSpent: task.minutesSpent, completed: true, date: task.date, points: 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before };
  });

  await setDoc(doc(db!, "leaderboards", week, "entries", user.uid), {
    uid: user.uid,
    username,
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "Student",
    ...(typeof profile.avatar === "string" && profile.avatar ? { avatar: profile.avatar } : {}),
    week,
    xp,
    level,
    completed: completed.length,
    overdue,
    inactiveDays,
    inactiveDates,
    studyMinutes,
    points: completed.length * 10 - overdue * 5 - inactiveDays * 50 + Math.min(210, Math.floor(studyMinutes / 10)),
    leaderboardTasks,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function observeAuth(callback: (user: User | null) => void): Unsubscribe {
  if (!auth) return () => callback(null);
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured. Add .env values first.");
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createAccount(email: string, password: string) {
  if (!auth) throw new Error("Firebase is not configured. Add .env values first.");
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInGoogle() {
  if (!auth) throw new Error("Firebase is not configured. Add .env values first.");
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function logout() { if (auth) await signOut(auth); }

export function watchTasks(user: User, onChange: (tasks: DailyTask[], source: "cache" | "server") => void) {
  return onSnapshot(tasksFor(user), { includeMetadataChanges: true }, (snapshot) => {
    const unique = new Map<string, DailyTask>();
    snapshot.docs.forEach((entry) => unique.set(entry.id, { id: entry.id, ...entry.data() } as DailyTask));
    const tasks = [...unique.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    onChange(tasks, snapshot.metadata.fromCache ? "cache" : "server");
  });
}

/** Live weekly leaderboard rank for the desktop task widget header. */
export function watchLeaderboardRank(user: User, callback: (rank: number | null) => void): Unsubscribe {
  return onSnapshot(collection(db!, "leaderboards", currentWeekKey(), "entries"), (snapshot) => {
    const entries = snapshot.docs.map((entry) => entry.data()).sort((left: any, right: any) => Number(right.points) - Number(left.points) || Number(right.studyMinutes) - Number(left.studyMinutes) || Number(right.completed) - Number(left.completed));
    const index = entries.findIndex((entry: any) => entry.uid === user.uid);
    callback(index < 0 ? null : index + 1);
  }, () => callback(null));
}

export function watchWeeklyLeaderboard(callback: (entries: Record<string, unknown>[]) => void): Unsubscribe {
  return onSnapshot(collection(db!, "leaderboards", currentWeekKey(), "entries"), (snapshot) => {
    callback(snapshot.docs.map((entry) => entry.data()).sort((left: any, right: any) => Number(right.points) - Number(left.points) || Number(right.studyMinutes) - Number(left.studyMinutes) || Number(right.completed) - Number(left.completed)));
  }, () => callback([]));
}

/** Reads users/{uid}/tracker/subjects.value — the existing web/mobile syllabus contract. */
export function watchTrackerSubjects(user: User, callback: (subjects: string[]) => void): Unsubscribe {
  return onSnapshot(doc(db!, "users", user.uid, "tracker", "subjects"), (snapshot) => {
    const value = snapshot.data()?.value;
    callback(Array.isArray(value) ? [...new Set(value.map((item) => typeof item?.name === "string" ? item.name.trim() : "").filter(Boolean))] : []);
  });
}

/** Reads the same activity sources used by the Android header streak. */
export function watchStreakActivity(user: User, callback: (dates: string[]) => void): Unsubscribe {
  let practiceDates: string[] = [];
  let trackerDates: string[] = [];
  const emit = () => callback([...practiceDates, ...trackerDates]);
  const practiceStop = onSnapshot(collection(db!, "users", user.uid, "practiceAttempts"), (snapshot) => {
    practiceDates = snapshot.docs.map((entry) => entry.data().date).filter((date): date is string => typeof date === "string");
    emit();
  });
  const trackerStop = onSnapshot(doc(db!, "users", user.uid, "tracker", "activity"), (snapshot) => {
    const value = snapshot.data()?.value;
    trackerDates = Array.isArray(value) ? value.map((entry) => entry?.date).filter((date): date is string => typeof date === "string") : [];
    emit();
  });
  return () => { practiceStop(); trackerStop(); };
}

/** Reads the existing practice collections without creating any widget-only data. */
export async function loadQuickRecallSeed(user: User): Promise<QuickRecallSeed> {
  const [subjects, attempts, favourites, learning] = await Promise.all([
    getDocs(collection(db!, "users", user.uid, "practiceSubjects")),
    getDocs(collection(db!, "users", user.uid, "practiceAttempts")),
    getDocs(collection(db!, "users", user.uid, "practiceFavourites")),
    getDoc(doc(db!, "users", user.uid, "questionLearning", "current")),
  ]);
  return {
    subjects: subjects.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    attempts: attempts.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    favouriteQuestionIds: favourites.docs.map((entry) => String(entry.data().id ?? entry.id)),
    learningStats: (learning.data()?.stats && typeof learning.data()?.stats === "object" ? learning.data()?.stats : {}) as Record<string, QuickRecallLearningStat>,
  };
}

/** Atomically records a desktop Quick Recall answer in the same document used by Android. */
export async function recordQuickRecallAnswer(user: User, question: { id: string; subjectId: string; subject: string }, correct: boolean) {
  const reference = doc(db!, "users", user.uid, "questionLearning", "current");
  const key = `${question.subjectId}:${question.id}`;
  await runTransaction(db!, async (transaction) => {
    const current = transaction.get(reference);
    const snapshot = await current;
    const data = snapshot.data() ?? {};
    const stats = data.stats && typeof data.stats === "object" ? data.stats as Record<string, QuickRecallLearningStat> : {};
    const before = stats[key] ?? { askedCount: 0, correctCount: 0, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" as const };
    const next = { ...before, askedCount: Number(before.askedCount ?? 0) + 1, correctCount: Number(before.correctCount ?? 0) + (correct ? 1 : 0), wrongCount: Number(before.wrongCount ?? 0) + (correct ? 0 : 1), lastAskedAt: new Date().toISOString(), lastOutcome: correct ? "correct" as const : "wrong" as const };
    transaction.set(reference, { ...data, stats: { ...stats, [key]: next }, lastSubject: question.subject, updatedAt: serverTimestamp() });
  });
}

export type QuickRecallPracticeInput = {
  runId: string;
  date: string;
  startedAt: string;
  questions: Array<{ id: string; subjectId: string; correctAnswer: string }>;
  answers: string[];
};

/** Same daily, transaction-safe practiceAttempts write used by Android. */
export async function recordQuickRecallPractice(user: User, input: QuickRecallPracticeInput) {
  const reference = doc(db!, "users", user.uid, "practiceAttempts", `quick-recall:${input.date}`);
  await runTransaction(db!, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() ?? {};
    const runIds = Array.isArray(current.quickRecallRunIds) ? current.quickRecallRunIds.map(String) : [];
    if (runIds.includes(input.runId)) return;
    const count = Math.min(input.questions.length, input.answers.length);
    const questions = input.questions.slice(0, count);
    const answers = input.answers.slice(0, count);
    const correct = answers.reduce((total, answer, index) => total + (answer === questions[index]?.correctAnswer ? 1 : 0), 0);
    const oldAnswers = Array.isArray(current.answers) ? current.answers : [];
    const oldIds = Array.isArray(current.questionIds) ? current.questionIds : [];
    const oldKey = Array.isArray(current.answerKey) ? current.answerKey : [];
    const nextCorrect = Math.max(0, Number(current.correct) || 0) + correct;
    const nextWrong = Math.max(0, Number(current.wrong) || 0) + count - correct;
    transaction.set(reference, {
      ...current, id: `quick-recall:${input.date}`, date: input.date,
      createdAt: current.createdAt ?? input.startedAt, updatedAt: new Date().toISOString(),
      testMode: "quick-recall", subjectId: "quick-recall", subject: "Quick Recall", chapter: "", exercise: "Quick Recall",
      startNumber: 1, durationMinutes: null, timeTakenSeconds: Math.max(0, Number(current.timeTakenSeconds) || 0),
      answers: [...oldAnswers, ...answers], questionIds: [...oldIds, ...questions.map((question) => question.id)],
      answerKey: [...oldKey, ...questions.map((question) => question.correctAnswer)], correct: nextCorrect, wrong: nextWrong,
      marking: { positive: 1, negative: 0 }, score: nextCorrect, quickRecallRunIds: [...runIds, input.runId], updatedAtServer: serverTimestamp(),
    });
  });
}

/** One document per task, matching the existing web's document-level CRUD. */
export async function saveTask(user: User, task: DailyTask) {
  await setDoc(taskRef(user, task.id), task);
  await publishLeaderboardAfterTaskChange(user);
}
export async function removeTask(user: User, id: string) {
  await deleteDoc(taskRef(user, id));
  await publishLeaderboardAfterTaskChange(user);
}
export const makeTaskId = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
export const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
