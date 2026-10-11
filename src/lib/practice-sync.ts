import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, type Unsubscribe, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { loadFavoriteQuestionIds, loadHistory, loadMarking, loadSubjects, saveFavoriteQuestionIds, saveHistory, saveMarking, saveSubjects, type MarkingScheme, type Subject, type TestRecord } from "@/lib/exam";

type Item = { id: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const docsFor = (user: User, name: string) => collection(getFirebaseFirestore(), "users", user.uid, name);

async function migrateCollection<T extends Item>(user: User, name: string, items: T[]) {
  const remote = await getDocs(docsFor(user, name));
  if (remote.size || !items.length) return;
  const batch = writeBatch(getFirebaseFirestore());
  items.forEach((item) => batch.set(doc(docsFor(user, name), item.id), item));
  await batch.commit();
}

async function syncCollection<T extends Item>(user: User, name: string, before: T[], after: T[]) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  await Promise.all([
    ...after.filter((item) => !previous.has(item.id) || !equal(previous.get(item.id), item)).map((item) => setDoc(doc(docsFor(user, name), item.id), item)),
    ...before.filter((item) => !next.has(item.id)).map((item) => deleteDoc(doc(docsFor(user, name), item.id))),
  ]);
}

/** Starts the entity-level practice backend. Legacy local storage is only an offline cache/migration source. */
export async function startPracticeSync(user: User): Promise<Unsubscribe> {
  const localSubjects = loadSubjects();
  const localAttempts = loadHistory();
  const localFavourites = loadFavoriteQuestionIds().map((id) => ({ id }));
  await Promise.all([
    migrateCollection(user, "practiceSubjects", localSubjects),
    migrateCollection(user, "practiceAttempts", localAttempts),
    migrateCollection(user, "practiceFavourites", localFavourites),
  ]);
  const settingsRef = doc(getFirebaseFirestore(), "users", user.uid, "practiceSettings", "current");
  const settings = await getDocs(collection(getFirebaseFirestore(), "users", user.uid, "practiceSettings"));
  if (!settings.size && loadMarking()) await setDoc(settingsRef, { marking: loadMarking() });

  let applyingRemote = false;
  let subjects = localSubjects;
  let attempts = localAttempts;
  let favourites = localFavourites;
  let marking = loadMarking();
  const emit = () => window.dispatchEvent(new Event("ssc-study-data-changed"));
  const stops = [
    onSnapshot(docsFor(user, "practiceSubjects"), (snapshot) => { const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Subject); applyingRemote = true; subjects = next; saveSubjects(next); emit(); applyingRemote = false; }),
    onSnapshot(docsFor(user, "practiceAttempts"), (snapshot) => { const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord); applyingRemote = true; attempts = next; saveHistory(next); emit(); applyingRemote = false; }),
    onSnapshot(docsFor(user, "practiceFavourites"), (snapshot) => { const next = snapshot.docs.map((item) => item.id); applyingRemote = true; favourites = next.map((id) => ({ id })); saveFavoriteQuestionIds(next); emit(); applyingRemote = false; }),
    onSnapshot(settingsRef, (snapshot) => { const next = snapshot.data()?.["marking"] as MarkingScheme | undefined; if (next) { applyingRemote = true; marking = next; saveMarking(next); emit(); applyingRemote = false; } }),
  ];
  const save = () => {
    if (applyingRemote) return;
    const nextSubjects = loadSubjects(); const nextAttempts = loadHistory(); const nextFavourites = loadFavoriteQuestionIds().map((id) => ({ id })); const nextMarking = loadMarking();
    void syncCollection(user, "practiceSubjects", subjects, nextSubjects); subjects = nextSubjects;
    void syncCollection(user, "practiceAttempts", attempts, nextAttempts); attempts = nextAttempts;
    void syncCollection(user, "practiceFavourites", favourites, nextFavourites); favourites = nextFavourites;
    if (!equal(marking, nextMarking) && nextMarking) { marking = nextMarking; void setDoc(settingsRef, { marking: nextMarking }, { merge: true }); }
  };
  window.addEventListener("ssc-study-data-changed", save);
  // A key edit can occur while the initial Firestore listeners are still
  // attaching (for example immediately after opening /test). Reconcile the
  // entity-level cache as a safety net so that update cannot be missed.
  const reconciliationTimer = window.setInterval(save, 1_200);
  return () => {
    window.clearInterval(reconciliationTimer);
    stops.forEach((stop) => stop());
    window.removeEventListener("ssc-study-data-changed", save);
  };
}
