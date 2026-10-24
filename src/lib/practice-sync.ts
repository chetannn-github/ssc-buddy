import { mergeQuestionDeletions } from "../../mobile-tasks/src/domain/question-deletion";
import { practiceSnapshots, type PracticeCollectionSnapshot } from "../../mobile-tasks/src/domain/practice-live-source";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, type Unsubscribe, writeBatch } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { loadFavoriteQuestionIds, loadHistory, loadMarking, loadSubjects, onPracticePersist, saveFavoriteQuestionIds, saveHistory, saveMarking, saveSubjects, type MarkingScheme, type Subject, type TestRecord } from "@/lib/exam";

type Item = { id: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const docsFor = (user: User, name: string) => collection(getFirebaseFirestore(), "users", user.uid, name);
function watchCollection(user: User, name: string, callback: (snapshot: PracticeCollectionSnapshot) => void) {
  return practiceSnapshots(getFirebaseFirestore(), JSON.stringify([user.uid, name]),
    (next, error) => onSnapshot(docsFor(user, name), { includeMetadataChanges: name === "practiceSubjects" }, next, error),
    callback, () => console.warn("Could not load practice data."));
}
// Account-scoped baselines let the global writer diff changed subjects.
const subjectBaselines = new Map<string, Subject[]>();

async function migrateCollection<T extends Item>(user: User, name: string, items: T[]) {
  if (!items.length) return;
  const remote = await getDocs(query(docsFor(user, name), limit(1)));
  if (remote.size) return;
  const batch = writeBatch(getFirebaseFirestore());
  items.forEach((item) => batch.set(doc(docsFor(user, name), item.id), item));
  await batch.commit();
}

async function syncCollection<T extends Item>(user: User, name: string, before: T[], after: T[]) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  await Promise.all([
    ...after.filter((item) => !previous.has(item.id) || !equal(previous.get(item.id), item)).map((item) => {
      const ref = doc(docsFor(user, name), item.id);
      return name === "practiceSubjects" ? runTransaction(getFirebaseFirestore(), async (transaction) => {
        const remote = await transaction.get(ref);
        transaction.set(ref, mergeQuestionDeletions(item as unknown as Subject, remote.data() as Subject | undefined));
      }) : setDoc(ref, item);
    }),
    ...before.filter((item) => !next.has(item.id)).map((item) => deleteDoc(doc(docsFor(user, name), item.id))),
  ]);
}

/**
 * Hydrates practice data on browser load, then retains live synchronization and
 * document-level CRUD. Startup migration checks are bounded existence queries.
 */
type PracticeSyncOptions = {
  /** Include the bank in hydration/live sync. The root currently enables this. */
  includeSubjects?: boolean;
};

/** Loads the potentially large question bank only when it is actually needed. */
export async function hydratePracticeSubjects(user: User) {
  const localSubjects = loadSubjects();
  await migrateCollection(user, "practiceSubjects", localSubjects);
  const remoteSubjects = await getDocs(docsFor(user, "practiceSubjects"));
  if (!remoteSubjects.size) return localSubjects;
  const remote = remoteSubjects.docs.map((item) => ({ ...item.data(), id: item.id }) as Subject);
  const subjects = remote.map((subject) => mergeQuestionDeletions(subject, localSubjects.find((local) => local.id === subject.id)));
  if (!equal(remote, subjects)) void syncCollection(user, "practiceSubjects", remote, subjects).catch(() => undefined);
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
  const settings = await getDoc(settingsRef);
  if (!settings.exists() && loadMarking()) await setDoc(settingsRef, { marking: loadMarking() });

  // Reuse the settings read above; subsequent edits arrive through its listener.
  const [remoteSubjects, remoteAttempts, remoteFavourites] = await Promise.all([
    includeSubjects ? getDocs(docsFor(user, "practiceSubjects")) : Promise.resolve(null),
    getDocs(docsFor(user, "practiceAttempts")),
    getDocs(docsFor(user, "practiceFavourites")),
  ]);
  let subjects = remoteSubjects?.size
    ? remoteSubjects.docs.map((item) => mergeQuestionDeletions({ ...item.data(), id: item.id } as Subject, localSubjects.find((local) => local.id === item.id)))
    : localSubjects;
  let attempts = remoteAttempts.size
    ? remoteAttempts.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord)
    : localAttempts;
  let favourites = remoteFavourites.size
    ? remoteFavourites.docs.map((item) => ({ id: item.id }))
    : localFavourites;
  let marking = settings.data()?.["marking"] as MarkingScheme | undefined ?? loadMarking();
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
      void syncCollection(user, "practiceSubjects", previous, next).catch(() => undefined);
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
    stopLiveListeners.push(watchCollection(user, "practiceSubjects", (snapshot) => {
      const local = loadSubjects();
      const next = snapshot.docs.map((item) => mergeQuestionDeletions({ ...item.data(), id: item.id } as Subject, local.find((subject) => subject.id === item.id)));
      const remote = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Subject);
      if (next.some((subject) => subject.deletedQuestionIds?.some((id) => !remote.find((item) => item.id === subject.id)?.deletedQuestionIds?.includes(id)))) {
        void syncCollection(user, "practiceSubjects", remote, next).catch(() => undefined);
      }
      if (equal(subjects, next)) return;
      applyRemote(() => {
        subjects = next;
        subjectBaselines.set(user.uid, next);
        saveSubjects(next);
      });
    }));
  }
  stopLiveListeners.push(watchCollection(user, "practiceAttempts", (snapshot) => {
    const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TestRecord);
    if (equal(attempts, next)) return;
    applyRemote(() => {
      attempts = next;
      saveHistory(next);
    });
  }));
  stopLiveListeners.push(watchCollection(user, "practiceFavourites", (snapshot) => {
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
