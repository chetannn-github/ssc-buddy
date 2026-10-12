import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import type { DailyTask } from "@/lib/daily-tasks";
import { WEB_CLOUD_SYNC_ENABLED } from "@/lib/web-cloud-sync";

const collectionFor = (user: User) => collection(getFirebaseFirestore(), "users", user.uid, "tasks");
const same = (left: DailyTask, right: DailyTask) => JSON.stringify(left) === JSON.stringify(right);

export async function migrateTasksIfEmpty(user: User, localTasks: DailyTask[]) {
  const remote = await getDocs(collectionFor(user));
  if (remote.size || !localTasks.length) return;
  const batch = writeBatch(getFirebaseFirestore());
  localTasks.forEach((task) => batch.set(doc(collectionFor(user), task.id), task));
  await batch.commit();
}

/** One-time hydration on page load. The website intentionally has no live listener. */
export async function readTasks(user: User): Promise<DailyTask[]> {
  const snapshot = await getDocs(collectionFor(user));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }) as DailyTask)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function watchTasks(user: User, onChange: (tasks: DailyTask[]) => void) {
  return onSnapshot(collectionFor(user), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DailyTask).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  });
}

/** Performs document-level writes only; unchanged tasks never reach Firestore. */
export async function syncTaskChanges(user: User, previous: DailyTask[], next: DailyTask[]) {
  if (!WEB_CLOUD_SYNC_ENABLED) return;
  const before = new Map(previous.map((task) => [task.id, task]));
  const after = new Map(next.map((task) => [task.id, task]));
  await Promise.all([
    ...next.filter((task) => !before.has(task.id) || !same(before.get(task.id)!, task)).map((task) => setDoc(doc(collectionFor(user), task.id), task)),
    ...previous.filter((task) => !after.has(task.id)).map((task) => deleteDoc(doc(collectionFor(user), task.id))),
  ]);
}
