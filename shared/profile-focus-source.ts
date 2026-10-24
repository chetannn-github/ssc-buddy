import type { Firestore } from "firebase/firestore";
import type { createStudyController, StudySession } from "./study-controller";
import type { FocusDay } from "./study-focus";

export type ProfileFocusReader = Pick<ReturnType<typeof createStudyController>, "watchStudyFocusDays" | "watchStudyControl" | "watchPublicStudyFocus" | "publishStudyFocusDay"> & Partial<Pick<ReturnType<typeof createStudyController>, "settleStudyFocus" | "repairStudyFocusDays">>;
export type ProfileFocusSnapshot = { days: Record<string, FocusDay> | null; session: StudySession | null; controlReady: boolean };
export const EMPTY_PROFILE_FOCUS: ProfileFocusSnapshot = { days: null, session: null, controlReady: false };
type Entry = { value: ProfileFocusSnapshot; observers: Set<() => void>; stops: Array<() => void>; started: boolean; failed: boolean; generation: number };
const scopes = new WeakMap<object, WeakMap<object, Map<string, Entry>>>();
function entries(db: Firestore, reader: ProfileFocusReader) {
  let readers = scopes.get(db);
  if (!readers) { readers = new WeakMap(); scopes.set(db, readers); }
  let values = readers.get(reader);
  if (!values) { values = new Map(); readers.set(reader, values); }
  return values;
}
const keyFor = (uid: string, username: string | undefined, readOnly: boolean) => JSON.stringify([uid, readOnly, readOnly ? username ?? "" : ""]);

/** An active source, not a persisted XP cache. The root keeps own data live
 * between tabs; the last unsubscribe removes every retained snapshot. */
export function profileFocusSnapshot(db: Firestore, reader: ProfileFocusReader, uid: string, username?: string, readOnly = false) {
  return entries(db, reader).get(keyFor(uid, username, readOnly))?.value ?? EMPTY_PROFILE_FOCUS;
}
export function watchProfileFocus(db: Firestore, reader: ProfileFocusReader, uid: string, username: string | undefined, readOnly: boolean, notify: () => void) {
  const values = entries(db, reader), key = keyFor(uid, username, readOnly);
  let entry = values.get(key);
  if (!entry) { entry = { value: EMPTY_PROFILE_FOCUS, observers: new Set(), stops: [], started: false, failed: false, generation: 0 }; values.set(key, entry); }
  const current = entry;
  current.observers.add(notify);
  if (!current.started || current.failed) {
    current.stops.forEach(stop => stop()); current.stops = [];
    current.started = true; current.failed = false; current.value = EMPTY_PROFILE_FOCUS;
    const generation = ++current.generation;
    const valid = () => values.get(key) === current && current.generation === generation && !current.failed;
    const update = (patch: Partial<ProfileFocusSnapshot>) => {
      if (!valid()) return;
      current.value = { ...current.value, ...patch };
      for (const observer of [...current.observers]) observer();
    };
    const failed = () => {
      if (!valid()) return;
      current.failed = true; current.value = EMPTY_PROFILE_FOCUS;
      for (const observer of [...current.observers]) observer();
    };
    try {
      if (readOnly) {
        if (username) current.stops.push(reader.watchPublicStudyFocus(db, uid, username, value => update({
          days: Object.fromEntries(Object.entries(value.days).map(([date, totalMilliseconds]) => [date, { totalMilliseconds, sessionCredits: {} }])), controlReady: true,
        }), failed));
      } else {
        current.stops.push(reader.watchStudyFocusDays(db, uid, days => update({ days }), failed));
        if (!current.failed) current.stops.push(reader.watchStudyControl(db, uid, value => update({ session: value?.session ?? null, controlReady: true }), failed));
      }
    } catch { failed(); }
  }
  return () => {
    current.observers.delete(notify);
    if (!current.observers.size && values.get(key) === current) {
      values.delete(key); current.generation++; current.stops.forEach(stop => stop());
    }
  };
}
