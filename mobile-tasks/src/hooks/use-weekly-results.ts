import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { getFirebaseFirestore } from "../lib/firebase";
import { completedLeaderboardWeeks, countWeeklyMedals, leaderboardWeek, shiftLeaderboardWeek, weeklyAward, type WeeklyAward } from "../domain/weekly-results";

export function useLeaderboardWeek() {
  const [week, setWeek] = useState(() => leaderboardWeek());
  useEffect(() => {
    const refresh = () => setWeek(leaderboardWeek());
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  return week;
}

export function usePreviousWeeklyAward(uid?: string) {
  const current = useLeaderboardWeek();
  const week = shiftLeaderboardWeek(current, -1);
  const [result, setResult] = useState<{ uid: string; award: WeeklyAward | null }>({ uid: "", award: null });
  useEffect(() => {
    setResult({ uid: uid ?? "", award: null });
    if (!uid) return;
    return onSnapshot(collection(getFirebaseFirestore(), "leaderboards", week, "entries"), (snapshot) => {
      const entries = snapshot.docs.map((doc) => ({ ...doc.data(), uid: doc.id }));
      setResult({ uid, award: weeklyAward(entries, uid, week) });
    }, () => setResult({ uid, award: null }));
  }, [uid, week]);
  return result.uid === uid && result.award?.week === week ? result.award : null;
}

export function useWeeklyMedalCounts(uid: string | undefined, dates: string[]) {
  const current = useLeaderboardWeek();
  const first = completedLeaderboardWeeks(dates, current)[0]!;
  const scope = `${uid ?? ""}:${first}:${current}`;
  const [result, setResult] = useState<{ scope: string; awards: Record<string, WeeklyAward | null> }>({ scope: "", awards: {} });
  useEffect(() => {
    setResult({ scope, awards: {} });
    if (!uid) return;
    let active = true;
    const stops = completedLeaderboardWeeks([first], current).map((week) => onSnapshot(collection(getFirebaseFirestore(), "leaderboards", week, "entries"), (snapshot) => {
      const entries = snapshot.docs.map((doc) => ({ ...doc.data(), uid: doc.id }));
      if (active) setResult((previous) => ({ scope, awards: { ...previous.awards, [week]: weeklyAward(entries, uid, week) } }));
    }, () => { if (active) setResult((previous) => ({ scope, awards: { ...previous.awards, [week]: null } })); }));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [uid, first, current, scope]);
  return countWeeklyMedals(result.scope === scope ? Object.values(result.awards) : []);
}
