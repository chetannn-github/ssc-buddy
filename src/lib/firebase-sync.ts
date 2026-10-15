import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { TestRecord } from "@/lib/exam";
import type { TrackerData } from "@/lib/tracker";
import type { DailyTask } from "@/lib/daily-tasks";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"],
  appId: import.meta.env["VITE_FIREBASE_APP_ID"],
};

const FIREBASE_LOCAL_KEYS = new Set(["ssc-buddy-firebase-client-id", "ssc-buddy-firebase-last-sync", "ssc-buddy-firebase-sync-enabled"]);
const CHUNK_LIMIT = 450_000;

type StorageEntry = { key: string; value: string; part?: number; total?: number };
type CloudManifest = { version: number; chunkCount: number; clientId?: string };

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export const isFirebaseConfigured = Boolean(
  FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId,
);

/** Google blocks OAuth popups in an embedded WebView. Tauri must use redirect auth. */
export function isTauriWebview() {
  if (typeof window === "undefined") return false;
  const scope = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(scope.__TAURI__ || scope.__TAURI_INTERNALS__);
}

function getClientId() {
  const existing = localStorage.getItem("ssc-buddy-firebase-client-id");
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem("ssc-buddy-firebase-client-id", next);
  return next;
}

function services() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured yet.");
  if (!app) {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { auth: auth!, db: db! };
}

export function getFirebaseFirestore() {
  return services().db;
}

/** Shared per-question recall stats. This is the same document used by Android. */
export async function writeQuestionLearning(user: User, value: Record<string, unknown>) {
  const reference = doc(getFirebaseFirestore(), "users", user.uid, "questionLearning", "current");
  await runTransaction(getFirebaseFirestore(), async (transaction) => {
    const remote = (await transaction.get(reference)).data() ?? {};
    const incoming = value["stats"] && typeof value["stats"] === "object"
      ? value["stats"] as Record<string, Record<string, unknown>>
      : {};
    const current = remote["stats"] && typeof remote["stats"] === "object"
      ? remote["stats"] as Record<string, Record<string, unknown>>
      : {};
    const stats = { ...current };
    Object.entries(incoming).forEach(([key, local]) => {
      const cloud = current[key] ?? {};
      const localIsNewer = String(local["lastAskedAt"] ?? "") >= String(cloud["lastAskedAt"] ?? "");
      stats[key] = {
        ...cloud,
        ...local,
        askedCount: Math.max(Number(cloud["askedCount"] ?? 0), Number(local["askedCount"] ?? 0)),
        correctCount: Math.max(Number(cloud["correctCount"] ?? 0), Number(local["correctCount"] ?? 0)),
        wrongCount: Math.max(Number(cloud["wrongCount"] ?? 0), Number(local["wrongCount"] ?? 0)),
        lastAskedAt: localIsNewer ? local["lastAskedAt"] : cloud["lastAskedAt"],
        lastOutcome: localIsNewer ? local["lastOutcome"] : cloud["lastOutcome"],
      };
    });
    transaction.set(reference, { ...remote, ...value, stats, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export type QuickRecallSeed = {
  subjects: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  favouriteQuestionIds: string[];
  learningStats: Record<string, Record<string, unknown>>;
};

/** Uses the exact seed sources used by the Windows and Android Quick Recall widgets. */
export async function loadQuickRecallSeed(user: User): Promise<QuickRecallSeed> {
  const database = getFirebaseFirestore();
  const [subjects, attempts, favourites, learning] = await Promise.all([
    getDocs(collection(database, "users", user.uid, "practiceSubjects")),
    getDocs(collection(database, "users", user.uid, "practiceAttempts")),
    getDocs(collection(database, "users", user.uid, "practiceFavourites")),
    getDoc(doc(database, "users", user.uid, "questionLearning", "current")),
  ]);
  const rawStats = learning.data()?.["stats"];
  return {
    subjects: subjects.docs.map((item) => ({ id: item.id, ...item.data() })),
    attempts: attempts.docs.map((item) => ({ id: item.id, ...item.data() })),
    favouriteQuestionIds: favourites.docs.map((item) => String(item.data()["id"] ?? item.id)),
    learningStats: rawStats && typeof rawStats === "object" ? rawStats as Record<string, Record<string, unknown>> : {},
  };
}

/**
 * Live, feature-scoped Quick Recall data. This deliberately watches only the
 * question-bank sources rather than the old global snapshot, so a practice
 * change updates recall without causing app-wide reloads or render loops.
 */
export function watchQuickRecallSeed(user: User, callback: (seed: QuickRecallSeed) => void): Unsubscribe {
  const database = getFirebaseFirestore();
  let subjects: Array<Record<string, unknown>> = [];
  let attempts: Array<Record<string, unknown>> = [];
  let favouriteQuestionIds: string[] = [];
  let learningStats: Record<string, Record<string, unknown>> = {};
  let queued = false;
  const emit = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      callback({ subjects, attempts, favouriteQuestionIds, learningStats });
    });
  };
  const stopSubjects = onSnapshot(collection(database, "users", user.uid, "practiceSubjects"), (snapshot) => {
    subjects = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    emit();
  });
  const stopAttempts = onSnapshot(collection(database, "users", user.uid, "practiceAttempts"), (snapshot) => {
    attempts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    emit();
  });
  const stopFavourites = onSnapshot(collection(database, "users", user.uid, "practiceFavourites"), (snapshot) => {
    favouriteQuestionIds = snapshot.docs.map((item) => String(item.data()["id"] ?? item.id));
    emit();
  });
  const stopLearning = onSnapshot(doc(database, "users", user.uid, "questionLearning", "current"), (snapshot) => {
    const stats = snapshot.data()?.["stats"];
    learningStats = stats && typeof stats === "object" ? stats as Record<string, Record<string, unknown>> : {};
    emit();
  });
  return () => { stopSubjects(); stopAttempts(); stopFavourites(); stopLearning(); };
}

/** Atomic, per-answer learning update shared by web, Android and the desktop widget. */
export async function recordQuickRecallAnswer(user: User, question: { id: string; subjectId: string; subject: string }, correct: boolean) {
  const database = getFirebaseFirestore();
  const reference = doc(database, "users", user.uid, "questionLearning", "current");
  const key = `${question.subjectId}:${question.id}`;
  await runTransaction(database, async (transaction) => {
    const data = (await transaction.get(reference)).data() ?? {};
    const stats = data["stats"] && typeof data["stats"] === "object" ? data["stats"] as Record<string, Record<string, unknown>> : {};
    const before = stats[key] ?? {};
    transaction.set(reference, {
      ...data,
      stats: {
        ...stats,
        [key]: {
          ...before,
          askedCount: Number(before["askedCount"] ?? 0) + 1,
          correctCount: Number(before["correctCount"] ?? 0) + Number(correct),
          wrongCount: Number(before["wrongCount"] ?? 0) + Number(!correct),
          lastAskedAt: new Date().toISOString(),
          lastOutcome: correct ? "correct" : "wrong",
        },
      },
      lastSubject: question.subject,
      updatedAt: serverTimestamp(),
    });
  });
}

/** One daily practice-attempt document, deduplicated by run ID, matching Android/widget behavior. */
export async function recordQuickRecallPractice(user: User, input: { runId: string; date: string; startedAt: string; questions: Array<{ id: string; correctAnswer: string }>; answers: string[] }) {
  const database = getFirebaseFirestore();
  const reference = doc(database, "users", user.uid, "practiceAttempts", `quick-recall:${input.date}`);
  await runTransaction(database, async (transaction) => {
    const current = (await transaction.get(reference)).data() ?? {};
    const runIds = Array.isArray(current["quickRecallRunIds"]) ? current["quickRecallRunIds"].map(String) : [];
    if (runIds.includes(input.runId)) return;
    const count = Math.min(input.questions.length, input.answers.length);
    const questions = input.questions.slice(0, count);
    const answers = input.answers.slice(0, count);
    const correct = answers.reduce((total, answer, index) => total + Number(answer === questions[index]?.correctAnswer), 0);
    transaction.set(reference, {
      ...current,
      id: `quick-recall:${input.date}`,
      date: input.date,
      createdAt: current["createdAt"] ?? input.startedAt,
      updatedAt: new Date().toISOString(),
      testMode: "quick-recall",
      subjectId: "quick-recall",
      subject: "Quick Recall",
      chapter: "",
      exercise: "Quick Recall",
      startNumber: 1,
      durationMinutes: null,
      timeTakenSeconds: Number(current["timeTakenSeconds"] ?? 0),
      answers: [...(Array.isArray(current["answers"]) ? current["answers"] : []), ...answers],
      questionIds: [...(Array.isArray(current["questionIds"]) ? current["questionIds"] : []), ...questions.map((question) => question.id)],
      answerKey: [...(Array.isArray(current["answerKey"]) ? current["answerKey"] : []), ...questions.map((question) => question.correctAnswer)],
      correct: Number(current["correct"] ?? 0) + correct,
      wrong: Number(current["wrong"] ?? 0) + count - correct,
      marking: { positive: 1, negative: 0 },
      score: Number(current["score"] ?? 0) + correct,
      quickRecallRunIds: [...runIds, input.runId],
      updatedAtServer: serverTimestamp(),
    });
  });
}

function snapshotLocalStorage(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    // Firebase Auth/Firestore keep browser-specific tokens and caches in localStorage.
    // Syncing them across devices causes an auth/cache write loop and repeated reloads.
    if (
      key &&
      !FIREBASE_LOCAL_KEYS.has(key) &&
      key !== "ssc-buddy-jsonbin-config" &&
      // Daily tasks live in users/{uid}/tasks as independent documents.
      // Keeping this out of the legacy snapshot prevents full-data uploads on every toggle.
      key !== "ssc-buddy:tasks:v2" &&
      // Practice has entity collections (subjects, attempts and favourites), not a monolithic backup.
      key !== "cbt-subjects" &&
      key !== "cbt-history" &&
      key !== "cbt-favorite-questions" &&
      key !== "cbt-marking" &&
      // Tracker is split into section documents under users/{uid}/tracker.
      key !== "ssc-cgl-2027-tracker-v1" &&
      key !== "ssc-buddy-liked-videos" &&
      key !== "ssc-buddy-liked-music" &&
      key !== "ssc-buddy-manifestation-completed" &&
      key !== "cbt-test-dark-mode" &&
      !key.startsWith("firebase:") &&
      !key.startsWith("firestore_")
    ) {
      snapshot[key] = localStorage.getItem(key) ?? "";
    }
  }
  return snapshot;
}

/** True only when this browser already contains actual study content. */
export function hasMeaningfulLocalData() {
  const keys = ["practice-profile", "cbt-history", "cbt-subjects", "ssc-buddy-tracker"];
  return keys.some((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    } catch { return true; }
  });
}

function restoreSnapshot(snapshot: Record<string, string>) {
  const retained: Array<readonly [string, string | null]> = [...FIREBASE_LOCAL_KEYS].map((key) => [key, localStorage.getItem(key)] as const);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("firebase:") || key?.startsWith("firestore_")) retained.push([key, localStorage.getItem(key)] as const);
  }
  localStorage.clear();
  retained.forEach(([key, value]) => {
    if (value) localStorage.setItem(key, value);
  });
  Object.entries(snapshot).forEach(([key, value]) => localStorage.setItem(key, value));
  window.dispatchEvent(new Event("cbt-backup-restored"));
  window.dispatchEvent(new Event("cbt-profile-updated"));
  window.dispatchEvent(new Event("cbt-tracker-updated"));
  window.dispatchEvent(new Event("ssc-daily-tasks-updated"));
}

function splitSnapshot(snapshot: Record<string, string>) {
  const chunks: StorageEntry[][] = [];
  let current: StorageEntry[] = [];
  const append = (entry: StorageEntry) => {
    if (current.length && JSON.stringify([...current, entry]).length > CHUNK_LIMIT) {
      chunks.push(current);
      current = [entry];
    } else current.push(entry);
  };
  Object.entries(snapshot).forEach(([key, value]) => {
    const partSize = CHUNK_LIMIT - 2_000;
    const total = Math.max(1, Math.ceil(value.length / partSize));
    for (let part = 0; part < total; part += 1) {
      append({ key, value: value.slice(part * partSize, (part + 1) * partSize), ...(total > 1 ? { part, total } : {}) });
    }
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function joinChunks(chunks: StorageEntry[][]) {
  const grouped = new Map<string, StorageEntry[]>();
  chunks.flat().forEach((entry) => grouped.set(entry.key, [...(grouped.get(entry.key) ?? []), entry]));
  return Object.fromEntries(
    [...grouped.entries()].map(([key, entries]) => [
      key,
      entries.sort((a, b) => (a.part ?? 0) - (b.part ?? 0)).map((entry) => entry.value).join(""),
    ]),
  );
}

function rootDoc(dbValue: Firestore, uid: string) {
  return doc(dbValue, "users", uid, "appData", "current");
}

/** A per-feature record shared by browser and React Native without replacing the full backup snapshot. */
function sharedDataDoc(dbValue: Firestore, uid: string, key: string) {
  return doc(dbValue, "users", uid, "sharedData", key);
}

function profileDoc(dbValue: Firestore, uid: string) {
  return doc(dbValue, "users", uid, "profile", "current");
}

function preferencesDoc(dbValue: Firestore, uid: string) {
  return doc(dbValue, "users", uid, "preferences", "current");
}

export async function readCloudPreferences(user: User) {
  const { db: dbValue } = services();
  return (await getDoc(preferencesDoc(dbValue, user.uid))).data() ?? null;
}

export async function patchCloudPreferences(user: User, fields: Record<string, unknown>) {
  const { db: dbValue } = services();
  await setDoc(preferencesDoc(dbValue, user.uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
}

export function watchCloudPreferences(user: User, callback: (value: Record<string, unknown> | null) => void) {
  const { db: dbValue } = services();
  return onSnapshot(preferencesDoc(dbValue, user.uid), (snapshot) => callback(snapshot.data() ?? null));
}

export async function readCloudProfile(user: User) {
  const { db: dbValue } = services();
  const data = (await getDoc(profileDoc(dbValue, user.uid))).data();
  return data ?? null;
}

/** Field-level merge: an edit never replaces unrelated profile fields. */
export async function patchCloudProfile(user: User, fields: Record<string, unknown>) {
  const { db: dbValue } = services();
  await setDoc(profileDoc(dbValue, user.uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
}

export function watchCloudProfile(user: User, callback: (profile: Record<string, unknown> | null) => void) {
  const { db: dbValue } = services();
  return onSnapshot(profileDoc(dbValue, user.uid), (snapshot) => callback(snapshot.data() ?? null));
}

const USERNAME_PATTERN = /^[a-z0-9._]{3,24}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameValidationMessage(value: string) {
  const username = normalizeUsername(value);
  if (!username) return "Choose a username.";
  if (!USERNAME_PATTERN.test(username)) return "Use 3–24 lowercase letters, numbers, dots, or underscores.";
  return "";
}

function usernameDoc(dbValue: Firestore, username: string) {
  return doc(dbValue, "usernames", username);
}

export type PublicProfileDashboard = {
  records: TestRecord[];
  tracker: TrackerData | null;
  dailyTasks: DailyTask[];
};

export type PublicProfile = {
  uid: string;
  username: string;
  name: string;
  questionGoal: number;
  avatar?: string;
  examName?: string;
  practiceSessionEnabled?: boolean;
  trackProgressEnabled?: boolean;
  /** Aggregated per-day counts only; no questions, answers, or task details. */
  activity?: Record<string, number>;
  dashboard?: PublicProfileDashboard;
};

function publicProfileDoc(dbValue: Firestore, username: string) {
  return doc(dbValue, "publicProfiles", username);
}

function publicProfileFields(user: User, username: string, fields: Record<string, unknown>): PublicProfile {
  const name = typeof fields["name"] === "string" ? fields["name"].trim() : "Student";
  const questionGoal = Math.max(1, Math.round(Number(fields["questionGoal"]) || 100));
  return {
    uid: user.uid, username, name, questionGoal,
    ...(typeof fields["avatar"] === "string" && fields["avatar"] ? { avatar: fields["avatar"] } : {}),
    ...(typeof fields["examName"] === "string" && fields["examName"].trim() ? { examName: fields["examName"].trim() } : {}),
    ...(typeof fields["practiceSessionEnabled"] === "boolean" ? { practiceSessionEnabled: fields["practiceSessionEnabled"] } : {}),
    ...(typeof fields["trackProgressEnabled"] === "boolean" ? { trackProgressEnabled: fields["trackProgressEnabled"] } : {}),
  };
}

export async function readPublicProfile(value: string): Promise<PublicProfile | null> {
  const username = normalizeUsername(value.replace(/^@/, ""));
  if (usernameValidationMessage(username)) return null;
  const { db: dbValue } = services();
  const data = (await getDoc(publicProfileDoc(dbValue, username))).data();
  if (!data || typeof data["uid"] !== "string" || typeof data["name"] !== "string") return null;
  return {
    uid: data["uid"], username,
    name: data["name"], questionGoal: Math.max(1, Math.round(Number(data["questionGoal"]) || 100)),
    ...(typeof data["avatar"] === "string" && data["avatar"] ? { avatar: data["avatar"] } : {}),
    ...(typeof data["examName"] === "string" && data["examName"].trim() ? { examName: data["examName"].trim() } : {}),
    ...(typeof data["practiceSessionEnabled"] === "boolean" ? { practiceSessionEnabled: data["practiceSessionEnabled"] } : {}),
    ...(typeof data["trackProgressEnabled"] === "boolean" ? { trackProgressEnabled: data["trackProgressEnabled"] } : {}),
    ...(data["activity"] && typeof data["activity"] === "object" ? {
      activity: Object.fromEntries(
        Object.entries(data["activity"] as Record<string, unknown>).flatMap(([date, count]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(count)) && Number(count) > 0
            ? [[date, Math.max(1, Math.round(Number(count)))]]
            : [],
        ),
      ),
    } : {}),
    ...(data["dashboard"] && typeof data["dashboard"] === "object" ? { dashboard: data["dashboard"] as PublicProfileDashboard } : {}),
  };
}

/** Publishes only daily activity totals needed for a public heatmap. */
export async function savePublicProfileActivity(
  user: User,
  profile: Record<string, unknown>,
  activity: Record<string, number>,
  dashboard: PublicProfileDashboard,
) {
  const username = normalizeUsername(String(profile["username"] ?? ""));
  if (usernameValidationMessage(username)) return;
  const sanitizedActivity = Object.fromEntries(
    Object.entries(activity).flatMap(([date, count]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(count) && count > 0
        ? [[date, Math.max(1, Math.round(count))]]
        : [],
    ),
  );
  const { db: dbValue } = services();
  await setDoc(
    publicProfileDoc(dbValue, username),
    { ...publicProfileFields(user, username, profile), activity: sanitizedActivity, dashboard, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function checkUsernameAvailability(user: User, value: string) {
  const username = normalizeUsername(value);
  const validationError = usernameValidationMessage(username);
  if (validationError) return { username, available: false, reason: validationError };
  const { db: dbValue } = services();
  const claimed = await getDoc(usernameDoc(dbValue, username));
  const ownerId = typeof claimed.data()?.["uid"] === "string" ? claimed.data()!["uid"] : "";
  return { username, available: !claimed.exists() || ownerId === user.uid, reason: claimed.exists() && ownerId !== user.uid ? "This username is already taken." : "" };
}

/** Atomically reserves the username and persists the corresponding profile. */
export async function saveProfileWithUsername(user: User, fields: Record<string, unknown>) {
  const username = normalizeUsername(String(fields["username"] ?? ""));
  const validationError = usernameValidationMessage(username);
  if (validationError) throw new Error(validationError);
  const { db: dbValue } = services();
  const profileRef = profileDoc(dbValue, user.uid);
  const nextUsernameRef = usernameDoc(dbValue, username);
  const nextPublicProfileRef = publicProfileDoc(dbValue, username);
  await runTransaction(dbValue, async (transaction) => {
    const currentProfile = await transaction.get(profileRef);
    const previousUsername = normalizeUsername(String(currentProfile.data()?.["username"] ?? ""));
    const previousUsernameRef = previousUsername && previousUsername !== username ? usernameDoc(dbValue, previousUsername) : null;
    const previousPublicProfileRef = previousUsername && previousUsername !== username ? publicProfileDoc(dbValue, previousUsername) : null;
    const [claimed, previousClaim] = await Promise.all([
      transaction.get(nextUsernameRef),
      previousUsernameRef ? transaction.get(previousUsernameRef) : Promise.resolve(null),
    ]);
    const claimedBy = typeof claimed.data()?.["uid"] === "string" ? claimed.data()!["uid"] : "";
    if (claimed.exists() && claimedBy !== user.uid) throw new Error("This username is already taken.");
    transaction.set(nextUsernameRef, { uid: user.uid, username, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(profileRef, { ...fields, username, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(nextPublicProfileRef, { ...publicProfileFields(user, username, fields), updatedAt: serverTimestamp() }, { merge: true });
    if (previousUsernameRef && previousClaim?.data()?.["uid"] === user.uid) transaction.delete(previousUsernameRef);
    if (previousPublicProfileRef) transaction.delete(previousPublicProfileRef);
  });
}

export async function readSharedData(user: User, key: string) {
  const { db: dbValue } = services();
  const snapshot = await getDoc(sharedDataDoc(dbValue, user.uid, key));
  const value = snapshot.data()?.["value"];
  return typeof value === "string" ? value : null;
}

export async function writeSharedData(user: User, key: string, value: string) {
  const { db: dbValue } = services();
  await setDoc(sharedDataDoc(dbValue, user.uid, key), { value, clientId: getClientId(), updatedAt: serverTimestamp() });
}

export function watchSharedData(user: User, key: string, callback: (value: string | null) => void) {
  const { db: dbValue } = services();
  return onSnapshot(sharedDataDoc(dbValue, user.uid, key), (snapshot) => {
    const value = snapshot.data()?.["value"];
    callback(typeof value === "string" ? value : null);
  });
}

export function observeFirebaseUser(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(services().auth, callback);
}

export async function signInFirebase(email: string, password: string, createAccount = false) {
  const { auth: authValue } = services();
  const result = createAccount
    ? await createUserWithEmailAndPassword(authValue, email, password)
    : await signInWithEmailAndPassword(authValue, email, password);
  return result.user;
}

export async function signInWithGoogleFirebase() {
  const { auth: authValue } = services();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if (isTauriWebview()) {
    await signInWithRedirect(authValue, provider);
    return null;
  }
  return (await signInWithPopup(authValue, provider)).user;
}

/** Reads Google redirect sign-in once the Tauri webview returns to the app. */
export async function completeGoogleRedirectSignIn() {
  if (!isTauriWebview()) return null;
  return (await getRedirectResult(services().auth))?.user ?? null;
}

export async function signOutFirebase() {
  await signOut(services().auth);
}

export async function hasCloudSnapshot(user: User) {
  const { db: dbValue } = services();
  return (await getDoc(rootDoc(dbValue, user.uid))).exists();
}

export async function uploadLocalSnapshot(user: User) {
  const { db: dbValue } = services();
  const root = rootDoc(dbValue, user.uid);
  const chunks = splitSnapshot(snapshotLocalStorage());
  const existing = await getDocs(collection(root, "chunks"));
  const batch = writeBatch(dbValue);
  existing.docs.forEach((item) => batch.delete(item.ref));
  chunks.forEach((entries, index) => batch.set(doc(root, "chunks", String(index)), { entries }));
  batch.set(root, { version: 1, chunkCount: chunks.length, clientId: getClientId(), updatedAt: serverTimestamp() });
  await batch.commit();
  localStorage.setItem("ssc-buddy-firebase-last-sync", JSON.stringify(snapshotLocalStorage()));
}

export async function downloadCloudSnapshot(user: User) {
  const { db: dbValue } = services();
  const root = rootDoc(dbValue, user.uid);
  const manifest = (await getDoc(root)).data() as CloudManifest | undefined;
  if (!manifest?.chunkCount && manifest?.chunkCount !== 0) throw new Error("No cloud data found for this account.");
  const snapshotDocs = await getDocs(collection(root, "chunks"));
  const chunks = snapshotDocs.docs
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((item) => (item.data()["entries"] ?? []) as StorageEntry[]);
  restoreSnapshot(joinChunks(chunks));
  localStorage.setItem("ssc-buddy-firebase-last-sync", JSON.stringify(snapshotLocalStorage()));
}

export function watchCloudSnapshot(user: User, onRemoteChange: () => void) {
  const { db: dbValue } = services();
  const clientId = getClientId();
  let initialized = false;
  return onSnapshot(rootDoc(dbValue, user.uid), (snapshot) => {
    const data = snapshot.data() as CloudManifest | undefined;
    if (!initialized) {
      initialized = true;
      return;
    }
    if (data && data.clientId !== clientId) onRemoteChange();
  });
}

export function startLocalSync(user: User) {
  let previous = localStorage.getItem("ssc-buddy-firebase-last-sync") ?? "";
  let busy = false;
  const sync = async () => {
    const current = JSON.stringify(snapshotLocalStorage());
    const restoredSnapshot = localStorage.getItem("ssc-buddy-firebase-last-sync") ?? "";
    // A remote update changed localStorage outside this closure. Treat it as already synced.
    if (restoredSnapshot !== previous) previous = restoredSnapshot;
    if (busy || current === previous) return;
    busy = true;
    try {
      await uploadLocalSnapshot(user);
      previous = JSON.stringify(snapshotLocalStorage());
    } catch {
      // Keep local data untouched; the next interval retries when connection returns.
    } finally {
      busy = false;
    }
  };
  const onDataChange = () => { void sync(); };
  const timer = window.setInterval(() => { void sync(); }, 2_000);
  window.addEventListener("ssc-study-data-changed", onDataChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("ssc-study-data-changed", onDataChange);
  };
}

/** Restore the last successfully-uploaded browser snapshot after an accidental empty restore. */
export function recoverLastLocalSnapshot() {
  if (hasMeaningfulLocalData()) return false;
  try {
    const value = JSON.parse(localStorage.getItem("ssc-buddy-firebase-last-sync") ?? "null") as unknown;
    if (!value || typeof value !== "object") return false;
    const snapshot = value as Record<string, string>;
    if (!Object.keys(snapshot).some((key) => ["practice-profile", "cbt-history", "cbt-subjects", "ssc-buddy-tracker"].includes(key))) return false;
    restoreSnapshot(snapshot);
    return true;
  } catch { return false; }
}

export async function deleteFirebaseCloudData(user: User) {
  const { db: dbValue } = services();
  const root = rootDoc(dbValue, user.uid);
  const chunks = await getDocs(collection(root, "chunks"));
  await Promise.all(chunks.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(root);
}
