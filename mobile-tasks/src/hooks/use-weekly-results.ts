import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { profileDataSource } from "../../../shared/profile-data-source";
import { loadMedalHistory } from "../../../shared/load-medal-history";
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
    return profileDataSource({ collection, doc, onSnapshot }).watchWeek(getFirebaseFirestore(), week, (snapshot) => {
      const entries = snapshot.docs.map((doc) => ({ ...doc.data(), uid: doc.id }));
      setResult({ uid, award: weeklyAward(entries, uid, week) });
    }, () => setResult({ uid, award: null }));
  }, [uid, week]);
  return result.uid === uid && result.award?.week === week ? result.award : null;
}

export function useWeeklyMedalCounts(uid: string | undefined, dates: string[]) {
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state === "active") setRefresh(value => value + 1); });
    return () => subscription.remove();
  }, []);
  const current = useLeaderboardWeek();
  const first = completedLeaderboardWeeks(dates, current)[0]!;
  const scope = `${uid ?? ""}:${first}:${current}`;
  const [result, setResult] = useState<{ scope: string; awards: Record<string, WeeklyAward | null> }>({ scope: "", awards: {} });
  useEffect(() => {
    setResult(previous => previous.scope === scope ? previous : { scope, awards: {} });
    if (!uid) return;
    let active = true;
    const database = getFirebaseFirestore();
    void loadMedalHistory(completedLeaderboardWeeks([first], current),
      week => profileDataSource({ collection, doc, onSnapshot }).readWeek(database, week, getDocs, uid),
      (week, snapshot) => setResult(previous => ({ scope, awards: { ...(previous.scope === scope ? previous.awards : {}), [week]: weeklyAward(snapshot.docs.map(item => ({ ...item.data(), uid: item.id })), uid, week) } })),
      () => active);
    return () => { active = false; };
  }, [uid, first, current, scope, refresh]);
  return countWeeklyMedals(result.scope === scope ? Object.values(result.awards) : []);
}
