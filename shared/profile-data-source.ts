import type { collection, doc, onSnapshot, getDoc, getDocs, Firestore, DocumentSnapshot, DocumentData, QuerySnapshot } from "firebase/firestore";
import { createSharedLiveSource } from "../mobile-tasks/src/domain/shared-live-source";

type Reader = { collection: typeof collection; doc: typeof doc; onSnapshot: typeof onSnapshot };
const runtimes = new WeakMap<object, ReturnType<typeof createSources>>();

/** Share only active listeners and concurrent reads. Settled reads and stopped
 * listener values are never retained as a successful persistent cache. */
function createSources(api: Reader) {
  const documents = createSharedLiveSource<DocumentSnapshot<DocumentData>>();
  const boards = createSharedLiveSource<QuerySnapshot<DocumentData>>();
  const pending = new WeakMap<object, Map<string, Promise<unknown>>>();
  function load<T>(db: object, key: string, read: () => Promise<T>): Promise<T> {
    let requests = pending.get(db);
    if (!requests) { requests = new Map(); pending.set(db, requests); }
    const existing = requests.get(key);
    if (existing) return existing as Promise<T>;
    const work = Promise.resolve().then(read).finally(() => { if (requests!.get(key) === work) requests!.delete(key); });
    requests.set(key, work);
    return work;
  }
  return {
    watchDocument(db: Firestore, path: string[], value: (snapshot: DocumentSnapshot<DocumentData>) => void, error: () => void = () => {}) {
      return documents(db, JSON.stringify(path), (emit, failed) => api.onSnapshot(api.doc(db, path[0]!, ...path.slice(1)), emit, failed), value, error);
    },
    watchWeek(db: Firestore, week: string, value: (snapshot: QuerySnapshot<DocumentData>) => void, error: () => void = () => {}) {
      return boards(db, week, (emit, failed) => api.onSnapshot(api.collection(db, "leaderboards", week, "entries"), emit, failed), value, error);
    },
    readWeek(db: Firestore, week: string, reader: typeof getDocs, account: string) {
      return load(db, JSON.stringify(["week", account, week]), () => reader(api.collection(db, "leaderboards", week, "entries")));
    },
    readDocument(db: Firestore, path: string[], reader: typeof getDoc) {
      return load(db, JSON.stringify(["document", ...path]), () => reader(api.doc(db, path[0]!, ...path.slice(1))));
    },
  };
}
export function profileDataSource(api: Reader) {
  let source = runtimes.get(api.onSnapshot);
  if (!source) { source = createSources(api); runtimes.set(api.onSnapshot, source); }
  return source;
}
