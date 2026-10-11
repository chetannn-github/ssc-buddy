import { collection, deleteDoc, doc, getDocs, setDoc, type Unsubscribe, writeBatch } from "firebase/firestore";
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

  // The website deliberately reads cloud data once per refresh. Keeping four
  // snapshot streams plus a reconciliation interval alive made navigation and
  // profile saves repeatedly re-enter the synchronisation loop.
  const [remoteSubjects, remoteAttempts, remoteFavourites, settingsSnapshot] = await Promise.all([
    getDocs(docsFor(user, "practiceSubjects")),
    getDocs(docsFor(user, "practiceAttempts")),
    getDocs(docsFor(user, "practiceFavourites")),
    getDocs(collection(getFirebaseFirestore(), "users", user.uid, "practiceSettings")),
  ]);
  let subjects = remoteSubjects.size
    ? remoteSubjects.docs.map((item) => ({ id: item.id, ...item.data() }) as Subject)
    : localSubjects;
  let attempts = remoteAttempts.size
    ? remoteAttempts.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord)
    : localAttempts;
  let favourites = remoteFavourites.size
    ? remoteFavourites.docs.map((item) => ({ id: item.id }))
    : localFavourites;
  let marking = settingsSnapshot.docs.find((item) => item.id === "current")?.data()["marking"] as MarkingScheme | undefined ?? loadMarking();
  if (remoteSubjects.size) saveSubjects(subjects);
  if (remoteAttempts.size) saveHistory(attempts);
  if (remoteFavourites.size) saveFavoriteQuestionIds(favourites.map((item) => item.id));
  if (marking) saveMarking(marking);
  const emit = () => window.dispatchEvent(new Event("ssc-study-data-changed"));
  const save = () => {
    const nextSubjects = loadSubjects(); const nextAttempts = loadHistory(); const nextFavourites = loadFavoriteQuestionIds().map((id) => ({ id })); const nextMarking = loadMarking();
    void syncCollection(user, "practiceSubjects", subjects, nextSubjects); subjects = nextSubjects;
    void syncCollection(user, "practiceAttempts", attempts, nextAttempts); attempts = nextAttempts;
    void syncCollection(user, "practiceFavourites", favourites, nextFavourites); favourites = nextFavourites;
    if (!equal(marking, nextMarking) && nextMarking) { marking = nextMarking; void setDoc(settingsRef, { marking: nextMarking }, { merge: true }); }
  };
  window.addEventListener("ssc-study-data-changed", save);
  return () => {
    window.removeEventListener("ssc-study-data-changed", save);
  };
}
