import { creditFocusDay, emptyFocusDay, focusSlices, studyTimeZone, type FocusDay, type FocusSession } from "./study-focus.ts";
import { splitSelection } from "./study-selection.ts";
import type { collection, doc, onSnapshot, runTransaction, serverTimestamp, Firestore, Transaction } from "firebase/firestore";
export type StudySession = { id: string; startedAt: number; endsAt: number; domains: string[]; timeZone?: string };
export type StudyControl = { version: 1; revision: string; session: StudySession | null; source: string; allowedDomains?: string[] };
export type StudyDevice = { id: string; label: string; sessionId: string | null; lastSeenAt: number; error: string };
export const studyControlPath = (uid: string) => ["users", uid, "studyLock", "current"] as const;
export const studyFocusPath = (uid: string, date: string) => ["users", uid, "studyFocusDays", date] as const;
export const studyDevicesPath = (uid: string) => ["users", uid, "studyLockDevices"] as const;
export function normalizeStudyDomain(value: string) {
  const selection = splitSelection([value]); return selection.domains[0]!;
}
export function createStudyController(api: { collection: typeof collection; doc: typeof doc; onSnapshot: typeof onSnapshot; runTransaction: typeof runTransaction; serverTimestamp: typeof serverTimestamp }, randomUUID: () => string = () => crypto.randomUUID()) {
const { collection, doc, onSnapshot, runTransaction, serverTimestamp } = api;
function watchStudyControl(db: Firestore, uid: string, callback: (value: StudyControl | null, pending: boolean) => void, error: (error: Error) => void) {
  return onSnapshot(doc(db, ...studyControlPath(uid)), { includeMetadataChanges: true }, snapshot => callback(snapshot.exists() ? snapshot.data() as StudyControl : null, snapshot.metadata.hasPendingWrites), error);
}
function watchStudyDevices(db: Firestore, uid: string, callback: (devices: StudyDevice[]) => void, error: (error: Error) => void) {
  return onSnapshot(collection(db, ...studyDevicesPath(uid)), snapshot => callback(snapshot.docs.map(entry => {
    const data = entry.data(); return { id: entry.id, label: String(data["label"] ?? "Browser"), sessionId: data["sessionId"] ?? null, lastSeenAt: data["lastSeenAt"]?.toMillis?.() ?? 0, error: String(data["error"] ?? "") };
  })), error);
}
function watchStudyFocusDay(db: Firestore, uid: string, date: string, callback: (value: FocusDay) => void, error: (error: Error) => void) {
  return onSnapshot(doc(db, ...studyFocusPath(uid, date)), snapshot => {
    const value = snapshot.data();
    callback(value ? { totalMilliseconds: Number(value["totalMilliseconds"]) || 0, sessionCredits: value["sessionCredits"] ?? {} } : emptyFocusDay());
  }, error);
}
async function prepareFocusCredits(transaction: Transaction, db: Firestore, uid: string, session: FocusSession | null | undefined, time: number) {
  const credits = await Promise.all(focusSlices(session, time, true).map(async slice => {
    const reference = doc(db, ...studyFocusPath(uid, slice.date));
    const snapshot = await transaction.get(reference), value = snapshot.data() as FocusDay | undefined;
    const next = creditFocusDay(value, session!.id, slice.milliseconds);
    return { reference, value, next, date: slice.date };
  }));
  return () => { for (const { reference, value, next, date } of credits) {
    if (next.totalMilliseconds !== value?.totalMilliseconds) transaction.set(reference, { version: 1, date, ...next, updatedAt: serverTimestamp() });
  } };
}
async function recordStudyFocus(db: Firestore, uid: string, session: FocusSession, time = Date.now()) {
  if (!focusSlices(session, time, true).length) return;
  await runTransaction(db, async transaction => { const commit = await prepareFocusCredits(transaction, db, uid, session, time); commit(); });
}
/** Same private document contract for Windows today, and web/Android controllers later. */
async function startStudySession(db: Firestore, uid: string, minutes: number, values: string[], source = "windows") {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720 || !values.length || values.length > 3) throw Error("Choose 1–720 minutes and up to 3 websites.");
  const { domains } = splitSelection(values);
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data();
    if (current?.["session"]?.endsAt > Date.now()) throw Error("The current study session is locked until its timer ends.");
    const startedAt = Date.now();
    const creditPrevious = await prepareFocusCredits(transaction, db, uid, current?.["session"], startedAt);
    creditPrevious();
    transaction.set(reference, { version: 1, revision: randomUUID(), session: { id: randomUUID(), startedAt, endsAt: startedAt + minutes * 60000, domains, timeZone: studyTimeZone() }, allowedDomains: domains, source, updatedAt: serverTimestamp() });
  });
}
async function saveStudyWebsites(db: Firestore, uid: string, values: string[], source = "windows") {
  const { domains } = splitSelection(values);
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data();
    if (current?.["session"]?.endsAt > Date.now()) throw Error("Websites are locked during your session.");
    const creditPrevious = await prepareFocusCredits(transaction, db, uid, current?.["session"], Date.now());
    creditPrevious();
    transaction.set(reference, { version: 1, revision: randomUUID(), session: null, allowedDomains: domains, source, updatedAt: serverTimestamp() });
  });
}

return { watchStudyControl, watchStudyDevices, watchStudyFocusDay, recordStudyFocus, startStudySession, saveStudyWebsites };
}
