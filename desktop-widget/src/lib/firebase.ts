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

export const TASK_TYPES = ["Lecture", "Revision", "Mock", "Practice Session", "Other"] as const;
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
export async function saveTask(user: User, task: DailyTask) { await setDoc(taskRef(user, task.id), task); }
export async function removeTask(user: User, id: string) { await deleteDoc(taskRef(user, id)); }
export const makeTaskId = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
export const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
