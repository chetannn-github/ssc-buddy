import { effectiveStudySession } from "./study-breaks";
import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { createStudyController, StudySession } from "./study-controller";
import { formatFocusTime, rangeFocusMilliseconds, focusSlices, type FocusDay } from "./study-focus";
import { focusPoints, focusRewardTotal } from "./focus-rewards";

type FocusReader = Pick<ReturnType<typeof createStudyController>, "watchStudyFocusDays" | "watchStudyControl" | "watchPublicStudyFocus" | "publishStudyFocusDay">;

export function useProfileFocusData(getDatabase: () => Firestore, reader: FocusReader, uid: string | undefined, username: string | undefined, readOnly: boolean, includesDay: (date: string) => boolean) {
  const [days, setDays] = useState<Record<string, FocusDay> | null>(null);
  const [session, setSession] = useState<StudySession | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setDays(null);
    setSession(null);
    if (!uid) return;
    const stops: (() => void)[] = [];
    const failed = () => { setDays(null); setSession(null); };
    try {
      const db = getDatabase();
      if (readOnly) {
        if (username) stops.push(reader.watchPublicStudyFocus(db, uid, username, value => {
          setDays(Object.fromEntries(Object.entries(value.days).map(([date, totalMilliseconds]) => [date, { totalMilliseconds, sessionCredits: {} }])));
        }, failed));
      } else {
        stops.push(reader.watchStudyFocusDays(db, uid, setDays, failed));
        stops.push(reader.watchStudyControl(db, uid, value => setSession(value?.session ?? null), failed));
      }
    } catch { failed(); }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { stops.forEach(stop => stop()); clearInterval(timer); };
  }, [getDatabase, reader, uid, username, readOnly]);
  useEffect(() => {
    if (!uid || readOnly || !days) return;
    let disposed = false;
    void (async () => {
      for (const [date, day] of Object.entries(days)) {
        if (disposed) break;
        if (day.totalMilliseconds > 0) await reader.publishStudyFocusDay(getDatabase(), uid, date).catch(() => {});
      }
    })();
    return () => { disposed = true; };
  }, [days, uid, readOnly, reader, getDatabase]);
  const totals = Object.fromEntries(Object.entries(days ?? {}).map(([date, value]) => [date, value.totalMilliseconds]));
  const current = session ? effectiveStudySession(session, now) : null;
  if (!readOnly && current) for (const slice of focusSlices(current, now)) totals[slice.date] = (totals[slice.date] ?? 0) + Math.max(0, slice.milliseconds - (days?.[slice.date]?.sessionCredits[current.id] ?? 0));
  const milliseconds = rangeFocusMilliseconds(days ?? {}, readOnly ? null : session, includesDay, now);
  return { days: totals, text: days ? formatFocusTime(milliseconds) : "—", milliseconds, points: Object.entries(totals).reduce((sum, [date, value]) => sum + (includesDay(date) ? focusPoints(value) : 0), 0), totalPoints: focusRewardTotal(totals) };
}

export function useProfileFocus(...args: Parameters<typeof useProfileFocusData>) { return useProfileFocusData(...args).text; }
