import { effectiveStudySession } from "./study-breaks";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Firestore } from "firebase/firestore";
import { formatFocusTime, rangeFocusMilliseconds, focusSlices } from "./study-focus";
import { focusPoints, focusRewardTotal } from "./focus-rewards";
import { EMPTY_PROFILE_FOCUS, profileFocusSnapshot, watchProfileFocus, type ProfileFocusReader } from "./profile-focus-source";

type FocusReader = ProfileFocusReader;

export function useProfileFocusData(getDatabase: () => Firestore, reader: FocusReader, uid: string | undefined, username: string | undefined, readOnly: boolean, includesDay: (date: string) => boolean) {
  let database: Firestore | null = null;
  if (uid) { try { database = getDatabase(); } catch { /* Loading stays unready. */ } }
  const source = useMemo(() => ({
    get: () => database && uid ? profileFocusSnapshot(database, reader, uid, username, readOnly) : EMPTY_PROFILE_FOCUS,
    subscribe: (notify: () => void) => database && uid ? watchProfileFocus(database, reader, uid, username, readOnly, notify) : () => {},
  }), [database, reader, uid, username, readOnly]);
  const { days, session, controlReady } = useSyncExternalStore(source.subscribe, source.get, () => EMPTY_PROFILE_FOCUS);
  const ready = days !== null && controlReady;
  const controlOwner = controlReady && !readOnly ? uid : null;
  const [now, setNow] = useState(Date.now());
  const repaired = useRef<{ uid?: string; days: Map<string, number> }>({ days: new Map() });
  const current = session ? effectiveStudySession(session, now) : null;
  const settlementDue = !!current && (current.paused || now >= current.endsAt);
  useEffect(() => {
    if (!readOnly && uid && controlOwner === uid && session && settlementDue) {
      void reader.settleStudyFocus?.(getDatabase(), uid, session).catch(() => {});
    }
  }, [uid, controlOwner, readOnly, session?.id, session?.paused, session?.breakUntil, settlementDue, Math.floor(now / 60000), reader, getDatabase]);
  useEffect(() => {
    if (!uid) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [uid]);
  useEffect(() => {
    if (!uid || readOnly || !days) return;
    if (reader.repairStudyFocusDays) {
      void reader.repairStudyFocusDays(getDatabase(), uid, days).catch(() => {});
      return;
    }
    if (repaired.current.uid !== uid) repaired.current = { uid, days: new Map() };
    const repair = repaired.current;
    let disposed = false;
    void (async () => {
      for (const [date, day] of Object.entries(days)) {
        if (disposed) break;
        if (day.totalMilliseconds > 0 && repair.days.get(date) !== day.totalMilliseconds) {
          try {
            await reader.publishStudyFocusDay(getDatabase(), uid, date, undefined, day.totalMilliseconds);
            repair.days.set(date, day.totalMilliseconds);
          } catch { /* Retry this day on the next data update/remount. */ }
        }
      }
    })();
    return () => { disposed = true; };
  }, [days, uid, readOnly, reader, getDatabase]);
  const totals = Object.fromEntries(Object.entries(days ?? {}).map(([date, value]) => [date, value.totalMilliseconds]));
  if (!readOnly && current) for (const slice of focusSlices(current, now)) totals[slice.date] = (totals[slice.date] ?? 0) + Math.max(0, slice.milliseconds - (days?.[slice.date]?.sessionCredits[current.id] ?? 0));
  const milliseconds = rangeFocusMilliseconds(days ?? {}, readOnly ? null : session, includesDay, now);
  const canLogout = !!uid && !readOnly && controlOwner === uid && !(current && (current.paused || current.endsAt > now));
  return { ready, canLogout, days: totals, text: ready ? formatFocusTime(milliseconds) : "—", milliseconds, points: Object.entries(totals).reduce((sum, [date, value]) => sum + (includesDay(date) ? focusPoints(value) : 0), 0), totalPoints: focusRewardTotal(totals) };
}

export function useProfileFocus(...args: Parameters<typeof useProfileFocusData>) { return useProfileFocusData(...args).text; }
