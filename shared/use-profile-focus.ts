import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { createStudyController, StudySession } from "./study-controller";
import { formatFocusTime, rangeFocusMilliseconds, type FocusDay } from "./study-focus";

type FocusReader = Pick<ReturnType<typeof createStudyController>, "watchStudyFocusDays" | "watchStudyControl" | "watchPublicStudyFocus">;

export function useProfileFocus(getDatabase: () => Firestore, reader: FocusReader, uid: string | undefined, username: string | undefined, readOnly: boolean, includesDay: (date: string) => boolean) {
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
  return days ? formatFocusTime(rangeFocusMilliseconds(days, readOnly ? null : session, includesDay, now)) : "—";
}
