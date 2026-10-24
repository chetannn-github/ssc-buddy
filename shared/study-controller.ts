import { beginStudyBreak, effectiveStudySession, maxStudyBreaks } from "./study-breaks.ts";
import { creditFocusDay, emptyFocusDay, focusSlices, studyTimeZone, type FocusDay, type FocusSession } from "./study-focus.ts";
import { MAX_STUDY_WEBSITES, splitSelection } from "./study-selection.ts";
import { focusLeaderboardPatch, focusWeek } from "./focus-rewards.ts";
import { focusSettlementDue } from "./focus-sync-policy.ts";
import { assertScheduleChange, dueFocusOccurrence, focusOccurrences, normalizeFocusSchedule, scheduledFocusSession, type FocusSchedule } from "./focus-schedules.ts";
import type { collection, doc, onSnapshot, runTransaction, serverTimestamp, Firestore, Transaction } from "firebase/firestore";
export type StudySession = { id: string; lockId?: string; startedAt: number; endsAt: number; domains: string[]; timeZone?: string; paused?: boolean; pausedAt?: number; remainingMs?: number; appLimit?: number; breakLimit?: number; breaksTaken?: number; breakUntil?: number };
export type StudyControl = { version: 1; revision: string; session: StudySession | null; source: string; allowedDomains?: string[]; overlayBreakId?: string; focusSchedules?: FocusSchedule[] };
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
// In-memory, per SDK/database and account. Only successful operations are cached;
// failed/offline writes can retry, and no persisted totals are trusted as a cache.
const operations = new WeakMap<Firestore, Map<string, Promise<void>>>();
function once(db: Firestore, key: string, work: () => Promise<void | boolean>) {
  let cache = operations.get(db);
  if (!cache) { cache = new Map(); operations.set(db, cache); }
  const previous = cache.get(key);
  if (previous) return previous;
  const pending = work().then(result => { if (result === false) cache!.delete(key); }).catch(error => { cache!.delete(key); throw error; });
  cache.set(key, pending);
  if (cache.size > 512) cache.delete(cache.keys().next().value!);
  return pending;
}
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
function sessionIsActive(session: StudySession | null | undefined, time = Date.now()) { if (!session) return false; const current = effectiveStudySession(session, time); return current.paused === true || current.endsAt > time; }
async function publishStudyFocusDay(db: Firestore, uid: string, date: string, timeZone = studyTimeZone(), knownTotal?: number): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (knownTotal !== undefined) return once(db, `publish:${uid}:${date}:${timeZone}:${knownTotal}`, () => publishFocusDay(db, uid, date, timeZone));
  await publishFocusDay(db, uid, date, timeZone);
}
async function publishFocusDay(db: Firestore, uid: string, date: string, timeZone: string) {
  return runTransaction(db, async transaction => {
    const day = (await transaction.get(doc(db, ...studyFocusPath(uid, date)))).data();
    const profile = (await transaction.get(doc(db, "users", uid, "profile", "current"))).data();
    const username = typeof profile?.["username"] === "string" ? profile["username"].trim().toLowerCase() : "";
    if (!/^[a-z0-9._]{3,24}$/.test(username)) return false;
    const reference = doc(db, "publicProfiles", username);
    const published = (await transaction.get(reference)).data();
    if (published?.["uid"] !== uid) return false;
    const total = Math.max(0, Number(day?.["totalMilliseconds"]) || 0);
    const leaderboardReference = doc(db, "leaderboards", focusWeek(date), "entries", uid);
    const leaderboard = (await transaction.get(leaderboardReference)).data();
    const days = { ...published["focusDays"], [date]: total };
    const patch = focusLeaderboardPatch(uid, profile!, date, days);
    if (published["focusDays"]?.[date] !== total || published["focusTimeZone"] !== timeZone)
      transaction.set(reference, { focusDays: { [date]: total }, focusTimeZone: timeZone, updatedAt: serverTimestamp() }, { merge: true });
    if (leaderboard?.["focusXp"] !== patch.focusXp || Object.entries(patch.focusDays).some(([day, value]) => leaderboard?.["focusDays"]?.[day] !== value))
      transaction.set(leaderboardReference, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  });
}
/** Check existing projections by week, rather than run a four-read repair for
 * every historical day whenever a profile/task row mounts. Missing days still
 * use the original private-day-verified publication transaction. */
async function repairStudyFocusDays(db: Firestore, uid: string, days: Record<string, FocusDay>): Promise<void> {
  const totals = Object.entries(days).filter(([, day]) => day.totalMilliseconds > 0).map(([date, day]) => [date, day.totalMilliseconds] as const).sort(([a], [b]) => a.localeCompare(b));
  if (!totals.length) return;
  return once(db, `repair:${uid}:${JSON.stringify(totals)}`, async () => {
    const projection = await runTransaction(db, async transaction => {
      const profile = (await transaction.get(doc(db, "users", uid, "profile", "current"))).data();
      const username = String(profile?.["username"] ?? "").trim().toLowerCase();
      if (!/^[a-z0-9._]{3,24}$/.test(username)) return null;
      const value = (await transaction.get(doc(db, "publicProfiles", username))).data();
      if (value?.["uid"] !== uid) return null;
      const weeks = [...new Set(totals.map(([date]) => focusWeek(date)))];
      const weekly = Object.fromEntries(await Promise.all(weeks.map(async week => [week, (await transaction.get(doc(db, "leaderboards", week, "entries", uid))).data()])));
      return { published: value, profile, weekly };
    });
    if (!projection) return false;
    const { published, profile, weekly } = projection;
    const repairs = new Set<string>();
    for (const [date, total] of totals) {
      if (published["focusDays"]?.[date] !== total) repairs.add(date);
    }
    const daysToShare = { ...published["focusDays"], ...Object.fromEntries(totals) };
    for (const week of Object.keys(weekly)) {
      const date = totals.find(([date]) => focusWeek(date) === week)![0];
      const patch = focusLeaderboardPatch(uid, profile!, date, daysToShare);
      if (weekly[week]?.["focusXp"] !== patch.focusXp || Object.entries(patch.focusDays).some(([date, total]) => weekly[week]?.["focusDays"]?.[date] !== total)) repairs.add(date);
    }
    for (const date of repairs) {
      await publishStudyFocusDay(db, uid, date, published["focusTimeZone"] || studyTimeZone());
    }
    return true;
  });
}
async function prepareFocusCredits(transaction: Transaction, db: Firestore, uid: string, session: FocusSession | null | undefined, time: number) {
  session = session ? effectiveStudySession(session, time) : session;
  const credits = await Promise.all(focusSlices(session, time, true).map(async slice => {
    const reference = doc(db, ...studyFocusPath(uid, slice.date));
    const snapshot = await transaction.get(reference), value = snapshot.data() as FocusDay | undefined;
    const next = creditFocusDay(value, session!.id, slice.milliseconds);
    return { reference, value, next, date: slice.date };
  }));
  const changed = credits.filter(({ value, next }) => next.totalMilliseconds !== value?.totalMilliseconds);
  if (!changed.length) return () => {};
  const profile = (await transaction.get(doc(db, "users", uid, "profile", "current"))).data();
  const username = typeof profile?.["username"] === "string" ? profile["username"].trim().toLowerCase() : "";
  const publicReference = /^[a-z0-9._]{3,24}$/.test(username) ? doc(db, "publicProfiles", username) : null;
  const publicData = publicReference ? (await transaction.get(publicReference)).data() : null;
  return () => { for (const { reference, value, next, date } of credits) {
    if (next.totalMilliseconds !== value?.totalMilliseconds) transaction.set(reference, { version: 1, date, ...next, updatedAt: serverTimestamp() });
  }
    if (publicReference && publicData?.["uid"] === uid) {
      const days = { ...publicData["focusDays"], ...Object.fromEntries(credits.map(({ date, next }) => [date, next.totalMilliseconds])) };
      for (const week of new Set(changed.map(({ date }) => focusWeek(date)))) {
        const date = changed.find(entry => focusWeek(entry.date) === week)!.date;
        transaction.set(doc(db, "leaderboards", week, "entries", uid), { ...focusLeaderboardPatch(uid, profile!, date, days), updatedAt: serverTimestamp() }, { merge: true });
      }
      transaction.set(publicReference, {
      focusDays: Object.fromEntries(credits.map(({ date, next }) => [date, next.totalMilliseconds])),
      focusTimeZone: session?.timeZone || studyTimeZone(), updatedAt: serverTimestamp(),
    }, { merge: true });
    }
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
  session = effectiveStudySession(session, time);
  const slices = focusSlices(session, time, true);
  if (!slices.length) return;
  return once(db, `credit:${uid}:${session.id}:${JSON.stringify(slices)}`, () => runTransaction(db, async transaction => { const commit = await prepareFocusCredits(transaction, db, uid, session, time); commit(); }));
}
async function settleStudyFocus(db: Firestore, uid: string, session: FocusSession, time = Date.now()) {
  if (focusSettlementDue(session, time)) await recordStudyFocus(db, uid, session, time);
}
/** Same private document contract for Windows today, and web/Android controllers later. */
async function startStudySession(db: Firestore, uid: string, minutes: number, values: string[], source = "windows", appLimit = 2, breakLimit = maxStudyBreaks(minutes)) {
  if (!Number.isInteger(appLimit) || appLimit < 0 || appLimit > 2) throw Error("Choose 0, 1 or 2 allowed apps.");
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720 || (!values.length && source !== "mobile") || values.length > MAX_STUDY_WEBSITES) throw Error(`Choose 1–720 minutes and up to ${MAX_STUDY_WEBSITES} websites.`);
  if (!Number.isInteger(breakLimit) || breakLimit < 0 || breakLimit > maxStudyBreaks(minutes)) throw Error("Choose a valid number of breaks.");
  const { domains } = splitSelection(values);
  const reference = doc(db, ...studyControlPath(uid));
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data();
    if (sessionIsActive(current?.["session"])) throw Error("The current focus session is locked until its timer ends.");
    const startedAt = Date.now();
    if ((current?.["focusSchedules"] ?? []).some((schedule: FocusSchedule) => focusOccurrences(schedule, startedAt).some(window => window.startedAt < startedAt + minutes * 60000 && window.endsAt > startedAt))) throw Error("This session overlaps a focus schedule. Choose a shorter duration.");
    const creditPrevious = await prepareFocusCredits(transaction, db, uid, current?.["session"], startedAt);
    creditPrevious();
    const session: StudySession = { id: randomUUID(), startedAt, endsAt: startedAt + minutes * 60000, domains, timeZone: studyTimeZone(), breakLimit, breaksTaken: 0, ...(source === "mobile" ? { appLimit } : {}) };
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), session, allowedDomains: domains, source, updatedAt: serverTimestamp() });
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
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), session: null, allowedDomains: domains, source, updatedAt: serverTimestamp() });
  });
}
async function pauseStudySession(db: Firestore, uid: string, source = "windows") {
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, session = current?.session;
    const now = Date.now();
    const active = session ? effectiveStudySession(session, now) : null;
    if (!active || active.paused || active.endsAt <= now) throw Error("There is no running focus session to pause.");
    const next = active.breakLimit !== undefined ? beginStudyBreak(active, now) : { ...active, paused: true, pausedAt: now, remainingMs: active.endsAt - now };
    const credit = await prepareFocusCredits(transaction, db, uid, next, now); credit();
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), source, session: next, updatedAt: serverTimestamp() });
  });
}
async function resumeStudySession(db: Firestore, uid: string, source = "windows") {
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, paused = current?.session;
    if (paused?.breakUntil && Date.now() < paused.breakUntil) throw Error("Your break resumes automatically after 10 minutes.");
    const remainingMs = Number(paused?.remainingMs);
    if (!paused?.paused || !Number.isSafeInteger(remainingMs) || remainingMs < 1 || remainingMs > 720 * 60000) throw Error("There is no paused focus session to resume.");
    const startedAt = Date.now();
    if (paused.breakUntil) {
      transaction.set(reference, { ...current, revision: randomUUID(), source, session: effectiveStudySession(paused, startedAt), updatedAt: serverTimestamp() });
      return;
    }
    transaction.set(reference, { ...current, version: 1, revision: randomUUID(), source, session: { id: randomUUID(), lockId: paused.lockId ?? paused.id, startedAt, endsAt: startedAt + remainingMs, domains: paused.domains, timeZone: paused.timeZone, ...(paused.appLimit !== undefined ? { appLimit: paused.appLimit } : {}) }, updatedAt: serverTimestamp() });
  });
}

async function applyOverlayBreak(db: Firestore, uid: string, action: OverlayBreak) {
  if (!action.id || !action.lockId || !Number.isSafeInteger(action.at) || action.at > Date.now() + 5000 || typeof action.paused !== "boolean") throw Error("Invalid break request.");
  const reference = doc(db, ...studyControlPath(uid));
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined, session = current?.session;
    if (!session || (session.lockId ?? session.id) !== action.lockId) throw Error("This break belongs to a different focus session.");
    if (current?.overlayBreakId === action.id) return session;
    if (action.at < session.startedAt) return session;
    let next = effectiveStudySession(session, action.at);
    if (action.paused && !next.paused) {
      if (action.at >= next.endsAt) throw Error("Your focus session already ended.");
      next = next.breakLimit !== undefined ? beginStudyBreak(next, action.at) : { ...next, paused: true, pausedAt: action.at, remainingMs: next.endsAt - action.at };
      const credit = await prepareFocusCredits(transaction, db, uid, next, action.at); credit();
    } else if (!action.paused && session.paused && !session.breakUntil) {
      const remainingMs = session.remainingMs ?? 0;
      if (remainingMs < 1 || action.at < (session.pausedAt ?? session.startedAt)) throw Error("Invalid resume time.");
      next = { id: randomUUID(), lockId: session.lockId ?? session.id, startedAt: action.at, endsAt: action.at + remainingMs, domains: session.domains, timeZone: session.timeZone ?? studyTimeZone(), ...(session.appLimit !== undefined ? { appLimit: session.appLimit } : {}) };
    }
    transaction.set(reference, { ...current, session: next, overlayBreakId: action.id, revision: randomUUID(), source: "mobile-overlay", updatedAt: serverTimestamp() });
    return next;
  });
}
async function reconcileStudySession(db: Firestore, uid: string) {
  const reference = doc(db, ...studyControlPath(uid));
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(reference)).data() as StudyControl | undefined;
    if (!current?.session) return;
    const next = effectiveStudySession(current.session);
    if (next !== current.session) transaction.set(reference, { ...current, session: next, revision: randomUUID(), updatedAt: serverTimestamp() });
  });
}
async function saveFocusSchedule(db: Firestore, uid: string, draft: FocusSchedule | null, id: string) {
  const reference=doc(db,...studyControlPath(uid));
  await runTransaction(db,async transaction=>{
    const current=(await transaction.get(reference)).data() as StudyControl|undefined;
    const existing=current?.focusSchedules??[],now=Date.now();
    const previous=existing.find(item=>item.id===id);
    const next=draft?normalizeFocusSchedule({...draft,id,createdAt:previous?.createdAt??now}):null;
    assertScheduleChange(existing,next,id,now);
    if(next&&sessionIsActive(current?.session,now)&&focusOccurrences(next,now).some(window=>window.startedAt<effectiveStudySession(current!.session!,now).endsAt&&window.endsAt>now))throw Error("This schedule overlaps your running focus session.");
    transaction.set(reference,{...current,version:1,session:current?.session??null,source:"focus-schedule",revision:randomUUID(),focusSchedules:[...existing.filter(item=>item.id!==id),...(next?[next]:[])],updatedAt:serverTimestamp()});
  });
}
async function activateDueFocusSchedule(db: Firestore, uid: string) {
  const reference=doc(db,...studyControlPath(uid));
  return runTransaction(db,async transaction=>{
    const current=(await transaction.get(reference)).data() as StudyControl|undefined,now=Date.now();
    const occurrence=dueFocusOccurrence(current?.focusSchedules??[],now);
    if(!occurrence||sessionIsActive(current?.session,now))return current?.session??null;
    const session=scheduledFocusSession(occurrence,current?.session?effectiveStudySession(current.session,now).endsAt:0);
    if(session.startedAt>=session.endsAt)return null;
    const creditPrevious=await prepareFocusCredits(transaction,db,uid,current?.session,now);creditPrevious();
    transaction.set(reference,{...current,version:1,session,source:"focus-schedule",revision:randomUUID(),updatedAt:serverTimestamp()});
    return session;
  });
}
return { saveFocusSchedule, activateDueFocusSchedule, repairStudyFocusDays, settleStudyFocus, reconcileStudySession, watchStudyControl, watchStudyDevices, watchStudyFocusDay, watchStudyFocusDays, watchPublicStudyFocus, publishStudyFocusDay, recordStudyFocus, startStudySession, saveStudyWebsites, pauseStudySession, resumeStudySession, applyOverlayBreak };
}
