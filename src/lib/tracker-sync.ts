import { collection, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { defaultData, type TrackerData } from "@/lib/tracker";

type Section = "meta" | "subjects" | "revision" | "tests" | "activity" | "pinned";
const sections: Section[] = ["meta", "subjects", "revision", "tests", "activity", "pinned"];
const sectionValue = (data: TrackerData, section: Section) => ({
  meta: data.meta, subjects: data.subjects, revision: data.revision, tests: data.tests, activity: data.activity, pinned: data.pinnedChapterIds,
}[section]);
const collectionFor = (user: User) => collection(getFirebaseFirestore(), "users", user.uid, "tracker");
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export async function migrateTrackerIfEmpty(user: User, data: TrackerData) {
  const current = await getDocs(collectionFor(user));
  if (current.size) return;
  const batch = writeBatch(getFirebaseFirestore());
  sections.forEach((section) => batch.set(doc(collectionFor(user), section), { value: sectionValue(data, section) }));
  await batch.commit();
}

/** Writes only tracker sections whose value actually changed. */
export async function syncTrackerSections(user: User, before: TrackerData, next: TrackerData) {
  await Promise.all(sections.filter((section) => !equal(sectionValue(before, section), sectionValue(next, section))).map((section) =>
    setDoc(doc(collectionFor(user), section), { value: sectionValue(next, section) }, { merge: true }),
  ));
}

/** One-time Firestore read used during page load; no live subscription is kept open. */
export async function readTrackerSections(user: User): Promise<TrackerData> {
  const snapshot = await getDocs(collectionFor(user));
  const values = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()["value"]])) as Partial<Record<Section, unknown>>;
  const base = defaultData();
  return {
    ...base,
    ...(values.meta && typeof values.meta === "object" ? { meta: { ...base.meta, ...(values.meta as TrackerData["meta"]) } } : {}),
    ...(Array.isArray(values.subjects) ? { subjects: values.subjects as TrackerData["subjects"] } : {}),
    ...(values.revision && typeof values.revision === "object" ? { revision: values.revision as TrackerData["revision"] } : {}),
    ...(values.tests && typeof values.tests === "object" ? { tests: values.tests as TrackerData["tests"] } : {}),
    ...(Array.isArray(values.activity) ? { activity: values.activity as TrackerData["activity"] } : {}),
    ...(Array.isArray(values.pinned) ? { pinnedChapterIds: values.pinned as string[] } : {}),
  };
}
