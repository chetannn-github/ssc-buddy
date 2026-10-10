import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
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
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

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
      !key.startsWith("firebase:") &&
      !key.startsWith("firestore_")
    ) {
      snapshot[key] = localStorage.getItem(key) ?? "";
    }
  }
  return snapshot;
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
  return (await signInWithPopup(authValue, provider)).user;
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
  const timer = window.setInterval(async () => {
    const current = JSON.stringify(snapshotLocalStorage());
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
  }, 2_000);
  return () => window.clearInterval(timer);
}

export async function deleteFirebaseCloudData(user: User) {
  const { db: dbValue } = services();
  const root = rootDoc(dbValue, user.uid);
  const chunks = await getDocs(collection(root, "chunks"));
  await Promise.all(chunks.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(root);
}
