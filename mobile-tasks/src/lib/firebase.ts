import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, onSnapshot, runTransaction, serverTimestamp, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import * as FirebaseAuth from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { Platform } from "react-native";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let auth: Auth | null = null;
let firestore: Firestore | null = null;

function getFirebaseApp() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured on this device.");
  return getApps().length ? getApp() : initializeApp(config);
}

export function getFirebaseAuth() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured on this device.");
  if (auth) return auth;

  const app = getFirebaseApp();
  try {
    if (Platform.OS === "web") {
      auth = getAuth(app);
    } else {
      // Metro resolves `firebase/auth` to Firebase's React-Native bundle at runtime.
      // Its RN-only helper is intentionally not exposed in the web TypeScript declarations.
      const getReactNativePersistence = (
        FirebaseAuth as unknown as {
          getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
        }
      ).getReactNativePersistence;
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage) as NonNullable<
          Parameters<typeof initializeAuth>[1]
        >["persistence"],
      });
    }
  } catch {
    // Fast Refresh may have already initialized Auth in this JavaScript runtime.
    auth = getAuth(app);
  }
  return auth;
}

export function getFirebaseFirestore() {
  if (!firestore) firestore = getFirestore(getFirebaseApp());
  return firestore;
}

const cloudProfileDoc = (user: User) => doc(getFirebaseFirestore(), "users", user.uid, "profile", "current");

export async function readCloudProfile(user: User) {
  return (await getDoc(cloudProfileDoc(user))).data() ?? null;
}

/** Field-level merge: an edit never replaces unrelated profile fields. */
export async function patchCloudProfile(user: User, fields: Record<string, unknown>) {
  await setDoc(cloudProfileDoc(user), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
}

export function watchCloudProfile(user: User, callback: (profile: Record<string, unknown> | null) => void) {
  return onSnapshot(cloudProfileDoc(user), (snapshot) => callback(snapshot.data() ?? null));
}

const cloudPreferencesDoc = (user: User) => doc(getFirebaseFirestore(), "users", user.uid, "preferences", "current");
export async function patchCloudPreferences(user: User, fields: Record<string, unknown>) {
  await setDoc(cloudPreferencesDoc(user), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
}
export function watchCloudPreferences(user: User, callback: (value: Record<string, unknown> | null) => void) {
  return onSnapshot(cloudPreferencesDoc(user), (snapshot) => callback(snapshot.data() ?? null));
}

type CloudTask = { id: string; [key: string]: unknown };
const taskCollection = (user: User) => collection(getFirebaseFirestore(), "users", user.uid, "tasks");

export async function migrateTasksIfEmpty(user: User, tasks: CloudTask[]) {
  const remote = await getDocs(taskCollection(user));
  if (remote.size || !tasks.length) return;
  const batch = writeBatch(getFirebaseFirestore());
  tasks.forEach((task) => batch.set(doc(taskCollection(user), task.id), task));
  await batch.commit();
}

export function watchTasks(user: User, callback: (tasks: CloudTask[]) => void) {
  return onSnapshot(taskCollection(user), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CloudTask)).sort((a, b) => String(b["createdAt"]).localeCompare(String(a["createdAt"])))));
}

/** Document-level task sync: only created, changed, or removed tasks are written. */
export async function syncTaskChanges(user: User, previous: CloudTask[], next: CloudTask[]) {
  const same = (left: CloudTask, right: CloudTask) => JSON.stringify(left) === JSON.stringify(right);
  const before = new Map(previous.map((task) => [task.id, task]));
  const after = new Map(next.map((task) => [task.id, task]));
  await Promise.all([
    ...next.filter((task) => !before.has(task.id) || !same(before.get(task.id)!, task)).map((task) => setDoc(doc(taskCollection(user), task.id), task)),
    ...previous.filter((task) => !after.has(task.id)).map((task) => deleteDoc(doc(taskCollection(user), task.id))),
  ]);
}

type PracticeEntity = { id: string; [key: string]: unknown };
const practiceCollection = (user: User, name: string) => collection(getFirebaseFirestore(), "users", user.uid, name);
const practiceWriteQueues = new Map<string, Promise<void>>();

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)])) as T;
  }
  return value;
}

export async function migratePracticeEntities(user: User, name: string, entities: PracticeEntity[]) {
  const remote = await getDocs(practiceCollection(user, name));
  if (remote.size || !entities.length) return;
  const batch = writeBatch(getFirebaseFirestore());
  entities.forEach((entity) => batch.set(doc(practiceCollection(user, name), entity.id), entity));
  await batch.commit();
}

export async function syncPracticeEntities(user: User, name: string, before: PracticeEntity[], next: PracticeEntity[]) {
  const queueKey = `${user.uid}:${name}`;
  const previousJob = practiceWriteQueues.get(queueKey) ?? Promise.resolve();
  const job = previousJob.catch(() => undefined).then(async () => {
    const cleanBefore = before.map(withoutUndefined);
    const cleanNext = next.map(withoutUndefined);
    const same = (left: PracticeEntity, right: PracticeEntity) => JSON.stringify(left) === JSON.stringify(right);
    const previous = new Map(cleanBefore.map((entity) => [entity.id, entity]));
    const after = new Map(cleanNext.map((entity) => [entity.id, entity]));
    await Promise.all([
      ...cleanNext.filter((entity) => !previous.has(entity.id) || !same(previous.get(entity.id)!, entity)).map((entity) => setDoc(doc(practiceCollection(user, name), entity.id), entity)),
      ...cleanBefore.filter((entity) => !after.has(entity.id)).map((entity) => deleteDoc(doc(practiceCollection(user, name), entity.id))),
    ]);
  });
  practiceWriteQueues.set(queueKey, job);
  try {
    await job;
  } finally {
    if (practiceWriteQueues.get(queueKey) === job) practiceWriteQueues.delete(queueKey);
  }
}

/** Deletes one canonical practice entity without relying on a list snapshot. */
export async function deletePracticeEntity(user: User, name: string, id: string) {
  const queueKey = `${user.uid}:${name}`;
  const previousJob = practiceWriteQueues.get(queueKey) ?? Promise.resolve();
  const job = previousJob.catch(() => undefined).then(() =>
    deleteDoc(doc(practiceCollection(user, name), id)),
  );
  practiceWriteQueues.set(queueKey, job);
  try {
    await job;
  } finally {
    if (practiceWriteQueues.get(queueKey) === job) practiceWriteQueues.delete(queueKey);
  }
}

export function watchPracticeEntities(user: User, name: string, callback: (entities: PracticeEntity[]) => void) {
  return onSnapshot(practiceCollection(user, name), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PracticeEntity))));
}

export async function readPracticeSettings(user: User) {
  return (await getDoc(doc(getFirebaseFirestore(), "users", user.uid, "practiceSettings", "current"))).data() ?? null;
}

export async function patchPracticeSettings(user: User, fields: Record<string, unknown>) {
  await setDoc(doc(getFirebaseFirestore(), "users", user.uid, "practiceSettings", "current"), fields, { merge: true });
}

export function watchPracticeSettings(user: User, callback: (value: Record<string, unknown> | null) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "users", user.uid, "practiceSettings", "current"), (snapshot) => callback(snapshot.data() ?? null));
}

const trackerCollection = (user: User) => collection(getFirebaseFirestore(), "users", user.uid, "tracker");
export async function migrateTrackerSections(user: User, sections: Record<string, unknown>) {
  const remote = await getDocs(trackerCollection(user));
  if (remote.size) return;
  const batch = writeBatch(getFirebaseFirestore());
  Object.entries(sections).forEach(([key, value]) => batch.set(doc(trackerCollection(user), key), { value }));
  await batch.commit();
}
export async function syncTrackerSections(user: User, before: Record<string, unknown>, next: Record<string, unknown>) {
  await Promise.all(Object.keys(next).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(next[key])).map((key) => setDoc(doc(trackerCollection(user), key), { value: next[key] }, { merge: true })));
}
export function watchTrackerSections(user: User, callback: (sections: Record<string, unknown>) => void) {
  return onSnapshot(trackerCollection(user), (snapshot) => callback(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data().value]))));
}

/** Canonical web tracker test-log API: users/{uid}/tracker/tests.value.log. */
export type TrackerTestLog = { id: string; date: string; createdAt: string; subjectId: string; type: string; score: number | null; total: number | null; accuracy: number | null; notes: string };
const trackerTestsDoc = (user: User) => doc(trackerCollection(user), "tests");
const normaliseTrackerTest = (value: unknown): TrackerTestLog | null => {
  const test = value as Partial<TrackerTestLog>;
  if (!test?.id || !test.date) return null;
  return { id: String(test.id), date: String(test.date), createdAt: String(test.createdAt ?? test.date), subjectId: String(test.subjectId ?? ""), type: String(test.type ?? ""), score: test.score == null ? null : Number(test.score), total: test.total == null ? null : Number(test.total), accuracy: test.accuracy == null ? null : Number(test.accuracy), notes: String(test.notes ?? "") };
};
export function watchTrackerTests(user: User, callback: (tests: TrackerTestLog[]) => void) {
  return onSnapshot(trackerTestsDoc(user), (snapshot) => {
    const raw = snapshot.data()?.value as { log?: unknown[] } | undefined;
    callback((Array.isArray(raw?.log) ? raw.log : []).map(normaliseTrackerTest).filter((item): item is TrackerTestLog => item !== null));
  });
}
export async function appendTrackerTest(user: User, test: TrackerTestLog, subjectName?: string) {
  const reference = trackerTestsDoc(user); const current = (await getDoc(reference)).data()?.value as Record<string, unknown> | undefined;
  const log = Array.isArray(current?.log) ? current.log.filter((item) => (item as { id?: unknown })?.id !== test.id) : [];
  const subjectRows = (await getDoc(doc(trackerCollection(user), "subjects"))).data()?.value;
  const subject = Array.isArray(subjectRows) ? subjectRows.find((item) => String((item as { name?: unknown }).name ?? "").toLowerCase() === String(subjectName ?? "").toLowerCase()) as { id?: unknown } | undefined : undefined;
  await setDoc(reference, { value: {
    targets: current?.targets && typeof current.targets === "object" ? current.targets : {},
    mocks: current?.mocks && typeof current.mocks === "object" ? current.mocks : { pre: { target: 0, done: 0 }, mains: { target: 0, done: 0 } },
    ...(current ?? {}),
    log: [...log, { ...test, subjectId: String(subject?.id ?? test.subjectId ?? "") }],
  } }, { merge: true });
}
export async function deleteTrackerTest(user: User, id: string) {
  const reference = trackerTestsDoc(user);
  // A transaction prevents an outdated foreground snapshot from putting a
  // deleted test back into the canonical `tracker/tests` document.
  await runTransaction(getFirebaseFirestore(), async (transaction) => {
    const current = await transaction.get(reference);
    const value = current.exists() ? current.data()?.value as Record<string, unknown> | undefined : undefined;
    const log = Array.isArray(value?.log)
      ? value.log.filter((item) => String((item as { id?: unknown })?.id ?? "") !== String(id))
      : [];
    transaction.set(reference, { value: { ...(value ?? {}), log } }, { merge: true });
  });
}

/** Same Firestore contract as the web app: users/{uid}/sharedData/{storageKey}. */
export async function readSharedData(user: User, key: string) {
  const snapshot = await getDoc(doc(getFirebaseFirestore(), "users", user.uid, "sharedData", key));
  const value = snapshot.data()?.value;
  return typeof value === "string" ? value : null;
}

export async function writeSharedData(user: User, key: string, value: string) {
  await setDoc(doc(getFirebaseFirestore(), "users", user.uid, "sharedData", key), {
    value,
    updatedAt: serverTimestamp(),
  });
}

export function watchSharedData(user: User, key: string, callback: (value: string | null) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "users", user.uid, "sharedData", key), (snapshot) => {
    const value = snapshot.data()?.value;
    callback(typeof value === "string" ? value : null);
  });
}

/** Dedicated per-question learning stats; separate from question-bank content and attempts. */
const questionLearningDoc = (user: User) => doc(getFirebaseFirestore(), "users", user.uid, "questionLearning", "current");
export async function writeQuestionLearning(user: User, value: Record<string, unknown>) {
  await setDoc(questionLearningDoc(user), { ...value, updatedAt: serverTimestamp() }, { merge: true });
}
export async function readQuestionLearning(user: User) {
  return (await getDoc(questionLearningDoc(user))).data() ?? null;
}

export function observeSession(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function continueWithEmail(email: string, password: string, createAccount: boolean) {
  const firebaseAuth = getFirebaseAuth();
  const result = createAccount
    ? await createUserWithEmailAndPassword(firebaseAuth, email, password)
    : await signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export async function logout() {
  await signOut(getFirebaseAuth());
}
