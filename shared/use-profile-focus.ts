import { effectiveStudySession } from "./study-breaks";
import { useEffect, useRef, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { createStudyController, StudySession } from "./study-controller";
import { formatFocusTime, rangeFocusMilliseconds, focusSlices, type FocusDay } from "./study-focus";
import { focusPoints, focusRewardTotal } from "./focus-rewards";

type FocusReader = Pick<ReturnType<typeof createStudyController>, "watchStudyFocusDays" | "watchStudyControl" | "watchPublicStudyFocus" | "publishStudyFocusDay"> & Partial<Pick<ReturnType<typeof createStudyController>, "settleStudyFocus" | "repairStudyFocusDays">>;

export function useProfileFocusData(getDatabase: () => Firestore, reader: FocusReader, uid: string | undefined, username: string | undefined, readOnly: boolean, includesDay: (date: string) => boolean) {
  const [days, setDays] = useState<Record<string, FocusDay> | null>(null);
  const [session, setSession] = useState<StudySession | null>(null);
  const [controlOwner, setControlOwner] = useState<string | null>(null);
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
    let active = true;
    setDays(null);
    setSession(null);
    setControlOwner(null);
    if (!uid) return;
    const stops: (() => void)[] = [];
    const failed = () => { if (active) { setDays(null); setSession(null); setControlOwner(null); } };
    try {
      const db = getDatabase();
      if (readOnly) {
        if (username) stops.push(reader.watchPublicStudyFocus(db, uid, username, value => {
          setDays(Object.fromEntries(Object.entries(value.days).map(([date, totalMilliseconds]) => [date, { totalMilliseconds, sessionCredits: {} }])));
        }, failed));
      } else {
        stops.push(reader.watchStudyFocusDays(db, uid, setDays, failed));
        stops.push(reader.watchStudyControl(db, uid, value => {
          if (!active) return;
          setSession(value?.session ?? null);
          setControlOwner(uid);
        }, failed));
      }
    } catch { failed(); }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; stops.forEach(stop => stop()); clearInterval(timer); };
  }, [getDatabase, reader, uid, username, readOnly]);
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
  return { canLogout, days: totals, text: days ? formatFocusTime(milliseconds) : "—", milliseconds, points: Object.entries(totals).reduce((sum, [date, value]) => sum + (includesDay(date) ? focusPoints(value) : 0), 0), totalPoints: focusRewardTotal(totals) };
}

export function useProfileFocus(...args: Parameters<typeof useProfileFocusData>) { return useProfileFocusData(...args).text; }
