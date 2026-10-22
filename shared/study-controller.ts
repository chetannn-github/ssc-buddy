import { creditFocusDay, emptyFocusDay, focusSlices, studyTimeZone, type FocusDay, type FocusSession } from "./study-focus.ts";
import { splitSelection } from "./study-selection.ts";
import type { collection, doc, onSnapshot, runTransaction, serverTimestamp, Firestore, Transaction } from "firebase/firestore";
export type StudySession = { id: string; lockId?: string; startedAt: number; endsAt: number; domains: string[]; timeZone?: string; paused?: boolean; pausedAt?: number; remainingMs?: number };
export type StudyControl = { version: 1; revision: string; session: StudySession | null; source: string; allowedDomains?: string[]; overlayBreakId?: string };
export type OverlayBreak = { id: string; lockId: string; at: number; paused: boolean };
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
function watchStudyFocusDays(db: Firestore, uid: string, callback: (value: Record<string, FocusDay>) => void, error: (error: Error) => void) {
  return onSnapshot(collection(db, "users", uid, "studyFocusDays"), snapshot => {
    callback(Object.fromEntries(snapshot.docs.map(entry => {
      const value = entry.data();
      return [entry.id, { totalMilliseconds: Math.max(0, Number(value["totalMilliseconds"]) || 0), sessionCredits: value["sessionCredits"] ?? {} }];
    })));
  }, error);
}
function sessionIsActive(session: StudySession | null | undefined, time = Date.now()) { return !!session && (session.paused === true || session.endsAt > time); }
async function publishStudyFocusDay(db: Firestore, uid: string, date: string, timeZone = studyTimeZone()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await runTransaction(db, async transaction => {
    const day = (await transaction.get(doc(db, ...studyFocusPath(uid, date)))).data();
    const profile = (await transaction.get(doc(db, "users", uid, "profile", "current"))).data();
    const username = typeof profile?.["username"] === "string" ? profile["username"].trim().toLowerCase() : "";
    if (!/^[a-z0-9._]{3,24}$/.test(username)) return;
    const reference = doc(db, "publicProfiles", username);
    const published = (await transaction.get(reference)).data();
    if (published?.["uid"] !== uid) return;
    const total = Math.max(0, Number(day?.["totalMilliseconds"]) || 0);
    if (published["focusDays"]?.[date] === total && published["focusTimeZone"] === timeZone) return;
    transaction.set(reference, { focusDays: { [date]: total }, focusTimeZone: timeZone, updatedAt: serverTimestamp() }, { merge: true });
  });
}
async function prepareFocusCredits(transaction: Transaction, db: Firestore, uid: string, session: FocusSession | null | undefined, time: number) {
  const credits = await Promise.all(focusSlices(session, time, true).map(async slice => {
    const reference = doc(db, ...studyFocusPath(uid, slice.date));
    const snapshot = await transaction.get(reference), value = snapshot.data() as FocusDay | undefined;
    const next = creditFocusDay(value, session!.id, slice.milliseconds);
    return { reference, value, next, date: slice.date };
  }));
  const profile = credits.length ? (await transaction.get(doc(db, "users", uid, "profile", "current"))).data() : null;
  const username = typeof profile?.["username"] === "string" ? profile["username"].trim().toLowerCase() : "";
  const publicReference = /^[a-z0-9._]{3,24}$/.test(username) ? doc(db, "publicProfiles", username) : null;
  const publicData = publicReference ? (await transaction.get(publicReference)).data() : null;
  return () => { for (const { reference, value, next, date } of credits) {
    if (next.totalMilliseconds !== value?.totalMilliseconds) transaction.set(reference, { version: 1, date, ...next, updatedAt: serverTimestamp() });
  }
    if (publicReference && publicData?.["uid"] === uid) transaction.set(publicReference, {
      focusDays: Object.fromEntries(credits.map(({ date, next }) => [date, next.totalMilliseconds])),
      focusTimeZone: session?.timeZone || studyTimeZone(), updatedAt: serverTimestamp(),
    }, { merge: true });
  };
}
function watchPublicStudyFocus(db: Firestore, uid: string, username: string, callback: (value: { days: Record<string, number>; timeZone: string }) => void, error: (error: Error) => void) {
  if (!/^[a-z0-9._]{3,24}$/.test(username.trim().toLowerCase())) { callback({ days: {}, timeZone: studyTimeZone() }); return () => {}; }
  return onSnapshot(doc(db, "publicProfiles", username.trim().toLowerCase()), snapshot => {
    const value = snapshot.data();
    let timeZone = value?.["uid"] === uid ? value?.["focusTimeZone"] || studyTimeZone() : studyTimeZone();
    try { new Intl.DateTimeFormat("en-US", { timeZone }); } catch { timeZone = studyTimeZone(); }
    callback({ days: value?.["uid"] === uid ? Object.fromEntries(Object.entries(value["focusDays"] ?? {}).filter(([date, total]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof total === "number" && Number.isFinite(total) && total >= 0)) as Record<string, number> : {}, timeZone });
  }, error);
}
async function recordStudyFocus(db: Firestore, uid: string, session: FocusSession, time = Date.now()) {
  if (!focusSlices(session, time, true).length) return;
  await runTransaction(db, async transaction => { const commit = await prepareFocusCredits(transaction, db, uid, session, time); commit(); });
}
/** Same private document contract for Windows today, and web/Android controllers later. */
async function startStudySession(db: Firestore, uid: string, minutes: number, values: string[], source = "windows") {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720 || (!values.length && source !== "mobile") || values.length > 3) throw Error("Choose 1–720 minutes and up to 3 websites.");
  const { domains } = splitSelection(values);
  const reference = doc(db, ...studyControlPath(uid));
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data();
    if (sessionIsActive(current?.["session"])) throw Error("The current focus session is locked until its timer ends.");
    const startedAt = Date.now();
    const creditPrevious = await prepareFocusCredits(transaction, db, uid, current?.["session"], startedAt);
    creditPrevious();
    const session: StudySession = { id: randomUUID(), startedAt, endsAt: startedAt + minutes * 60000, domains, timeZone: studyTimeZone() };
    transaction.set(reference, { version: 1, revision: randomUUID(), session, allowedDomains: domains, source, updatedAt: serverTimestamp() });
    return session;
  });
}
async function saveStudyWebsites(db: Firestore, uid: string, values: string[], source = "windows") {
  const { domains } = splitSelection(values);
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data();
    if (sessionIsActive(current?.["session"])) throw Error("Websites are locked during your session.");
    const creditPrevious = await prepareFocusCredits(transaction, db, uid, current?.["session"], Date.now());
    creditPrevious();
    transaction.set(reference, { version: 1, revision: randomUUID(), session: null, allowedDomains: domains, source, updatedAt: serverTimestamp() });
  });
}
async function pauseStudySession(db: Firestore, uid: string, source = "windows") {
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, session = current?.session;
    const now = Date.now();
    if (!session || session.paused || session.endsAt <= now) throw Error("There is no running focus session to pause.");
    const credit = await prepareFocusCredits(transaction, db, uid, { ...session, paused: true, pausedAt: now }, now); credit();
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), source, session: { ...session, paused: true, pausedAt: now, remainingMs: session.endsAt - now }, updatedAt: serverTimestamp() });
  });
}
async function resumeStudySession(db: Firestore, uid: string, source = "windows") {
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, paused = current?.session;
    const remainingMs = Number(paused?.remainingMs);
    if (!paused?.paused || !Number.isSafeInteger(remainingMs) || remainingMs < 1 || remainingMs > 720 * 60000) throw Error("There is no paused focus session to resume.");
    const startedAt = Date.now();
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), source, session: { id: randomUUID(), lockId: paused.lockId ?? paused.id, startedAt, endsAt: startedAt + remainingMs, domains: paused.domains, timeZone: paused.timeZone }, updatedAt: serverTimestamp() });
  });
}

async function applyOverlayBreak(db: Firestore, uid: string, action: OverlayBreak) {
  if (!action.id || !action.lockId || !Number.isSafeInteger(action.at) || action.at > Date.now() + 5000 || typeof action.paused !== "boolean") throw Error("Invalid break request.");
  const reference = doc(db, ...studyControlPath(uid));
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, session = current?.session;
    if (!session || (session.lockId ?? session.id) !== action.lockId) throw Error("This break belongs to a different focus session.");
    if (current?.overlayBreakId === action.id) return session;
    if (action.at < session.startedAt) throw Error("This break is older than your current timer.");
    let next = session;
    if (action.paused && !session.paused) {
      if (action.at >= session.endsAt) throw Error("Your focus session already ended.");
      const credit = await prepareFocusCredits(transaction, db, uid, { ...session, paused: true, pausedAt: action.at }, action.at); credit();
      next = { ...session, paused: true, pausedAt: action.at, remainingMs: session.endsAt - action.at };
    } else if (!action.paused && session.paused) {
      const remainingMs = session.remainingMs ?? 0;
      if (remainingMs < 1 || action.at < (session.pausedAt ?? session.startedAt)) throw Error("Invalid resume time.");
      next = { id: randomUUID(), lockId: session.lockId ?? session.id, startedAt: action.at, endsAt: action.at + remainingMs, domains: session.domains, timeZone: session.timeZone ?? studyTimeZone() };
    }
    transaction.set(reference, { ...current, session: next, overlayBreakId: action.id, revision: randomUUID(), source: "mobile-overlay", updatedAt: serverTimestamp() });
    return next;
  });
}
return { watchStudyControl, watchStudyDevices, watchStudyFocusDay, watchStudyFocusDays, watchPublicStudyFocus, publishStudyFocusDay, recordStudyFocus, startStudySession, saveStudyWebsites, pauseStudySession, resumeStudySession, applyOverlayBreak };
}
