import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, type Unsubscribe, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { loadFavoriteQuestionIds, loadHistory, loadMarking, loadSubjects, onPracticePersist, saveFavoriteQuestionIds, saveHistory, saveMarking, saveSubjects, type MarkingScheme, type Subject, type TestRecord } from "@/lib/exam";

type Item = { id: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const docsFor = (user: User, name: string) => collection(getFirebaseFirestore(), "users", user.uid, name);
// Full question-bank documents are intentionally cached only after a Practice
// screen asks for them. This gives the global writer a lightweight baseline
// without parsing that bank on unrelated routes.
const subjectBaselines = new Map<string, Subject[]>();

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

/**
 * Hydrates practice data once on browser load, then keeps local CRUD writes in
 * sync. We intentionally do not keep Firestore snapshot listeners open on the
 * website: a large question bank can otherwise repeatedly serialize on the
 * main thread and freeze unrelated routes.
 */
type PracticeSyncOptions = {
  /** Question-bank documents can be very large; only hydrate them on a Practice route. */
  includeSubjects?: boolean;
};

/** Loads the potentially large question bank only when it is actually needed. */
export async function hydratePracticeSubjects(user: User) {
  const localSubjects = loadSubjects();
  await migrateCollection(user, "practiceSubjects", localSubjects);
  const remoteSubjects = await getDocs(docsFor(user, "practiceSubjects"));
  if (!remoteSubjects.size) return localSubjects;
  const subjects = remoteSubjects.docs.map(
    (item) => ({ id: item.id, ...item.data() }) as Subject,
  );
  subjectBaselines.set(user.uid, subjects);
  saveSubjects(subjects, { notify: false });
  return subjects;
}

export async function startPracticeSync(
  user: User,
  { includeSubjects = false }: PracticeSyncOptions = {},
): Promise<Unsubscribe> {
  const localSubjects = includeSubjects ? loadSubjects() : (subjectBaselines.get(user.uid) ?? []);
  const localAttempts = loadHistory();
  const localFavourites = loadFavoriteQuestionIds().map((id) => ({ id }));
  await Promise.all([
    ...(includeSubjects ? [migrateCollection(user, "practiceSubjects", localSubjects)] : []),
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
    includeSubjects ? getDocs(docsFor(user, "practiceSubjects")) : Promise.resolve(null),
    getDocs(docsFor(user, "practiceAttempts")),
    getDocs(docsFor(user, "practiceFavourites")),
    getDocs(collection(getFirebaseFirestore(), "users", user.uid, "practiceSettings")),
  ]);
  let subjects = remoteSubjects?.size
    ? remoteSubjects.docs.map((item) => ({ id: item.id, ...item.data() }) as Subject)
    : localSubjects;
  let attempts = remoteAttempts.size
    ? remoteAttempts.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord)
    : localAttempts;
  let favourites = remoteFavourites.size
    ? remoteFavourites.docs.map((item) => ({ id: item.id }))
    : localFavourites;
  let marking = settingsSnapshot.docs.find((item) => item.id === "current")?.data()["marking"] as MarkingScheme | undefined ?? loadMarking();
  if (remoteSubjects?.size) {
    subjectBaselines.set(user.uid, subjects);
    saveSubjects(subjects, { notify: false });
  }
  if (remoteAttempts.size) saveHistory(attempts);
  if (remoteFavourites.size) saveFavoriteQuestionIds(favourites.map((item) => item.id));
  if (marking) saveMarking(marking);
  let applyingRemote = false;
  const save = (key: string) => {
    if (applyingRemote) return;
    // Persist only the collection that actually changed. Loading/stringifying all
    // question-bank data for every answer or preference write was the source of
    // the cross-route UI stalls.
    if (key === "cbt-subjects") {
      const baseline = subjectBaselines.get(user.uid);
      // A subject edit only happens in Practice. Until that screen has hydrated
      // its bank, do not parse or upload a large cached collection globally.
      if (!includeSubjects && !baseline) return;
      const next = loadSubjects();
      const previous = baseline ?? subjects;
      void syncCollection(user, "practiceSubjects", previous, next);
      subjectBaselines.set(user.uid, next);
      subjects = next;
      return;
    }
    if (key === "cbt-history") {
      const next = loadHistory();
      void syncCollection(user, "practiceAttempts", attempts, next);
      attempts = next;
      return;
    }
    if (key === "cbt-favorite-questions") {
      const next = loadFavoriteQuestionIds().map((id) => ({ id }));
      void syncCollection(user, "practiceFavourites", favourites, next);
      favourites = next;
      return;
    }
    if (key === "cbt-marking") {
      const next = loadMarking();
      if (!equal(marking, next) && next) {
        marking = next;
        void setDoc(settingsRef, { marking: next }, { merge: true });
      }
    }
  };
  const stopPersistObserver = onPracticePersist(save);
  const stopLiveListeners: Unsubscribe[] = [];
  const applyRemote = (fn: () => void) => {
    applyingRemote = true;
    try {
      fn();
    } finally {
      queueMicrotask(() => {
        applyingRemote = false;
      });
    }
  };
  if (includeSubjects) {
    stopLiveListeners.push(onSnapshot(docsFor(user, "practiceSubjects"), (snapshot) => {
      const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Subject);
      if (equal(subjects, next)) return;
      applyRemote(() => {
        subjects = next;
        subjectBaselines.set(user.uid, next);
        saveSubjects(next);
      });
    }));
  }
  stopLiveListeners.push(onSnapshot(docsFor(user, "practiceAttempts"), (snapshot) => {
    const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord);
    if (equal(attempts, next)) return;
    applyRemote(() => {
      attempts = next;
      saveHistory(next);
    });
  }));
  stopLiveListeners.push(onSnapshot(docsFor(user, "practiceFavourites"), (snapshot) => {
    const next = snapshot.docs.map((item) => ({ id: item.id }));
    if (equal(favourites, next)) return;
    applyRemote(() => {
      favourites = next;
      saveFavoriteQuestionIds(next.map((item) => item.id));
    });
  }));
  stopLiveListeners.push(onSnapshot(settingsRef, (snapshot) => {
    const next = snapshot.data()?.["marking"] as MarkingScheme | undefined;
    if (!next || equal(marking, next)) return;
    applyRemote(() => {
      marking = next;
      saveMarking(next);
    });
  }));
  return () => {
    stopPersistObserver();
    stopLiveListeners.forEach((stop) => stop());
  };
}
