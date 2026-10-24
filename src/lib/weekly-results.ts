import { useEffect, useState } from "react";
import { watchLeaderboard } from "@/lib/leaderboard";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { profileDataSource } from "../../shared/profile-data-source";
import { loadMedalHistory } from "../../shared/load-medal-history";
import { completedLeaderboardWeeks, countWeeklyMedals, leaderboardWeek, shiftLeaderboardWeek, weeklyAward, type WeeklyAward } from "../../mobile-tasks/src/domain/weekly-results";
export { leaderboardWeekLabel, shiftLeaderboardWeek, validLeaderboardWeek, weeklyAwardSeenKey } from "../../mobile-tasks/src/domain/weekly-results";

export function useLeaderboardWeek() {
  const [week, setWeek] = useState(() => leaderboardWeek());
  useEffect(() => {
    const refresh = () => setWeek(leaderboardWeek());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return week;
}

export function usePreviousWeeklyAward(uid?: string) {
  const current = useLeaderboardWeek();
  const [result, setResult] = useState<{ uid: string; award: WeeklyAward | null }>({ uid: "", award: null });
  const week = shiftLeaderboardWeek(current, -1);
  useEffect(() => {
    setResult({ uid: uid ?? "", award: null });
    if (!uid) return;
    return watchLeaderboard(week, (entries) => setResult({ uid, award: weeklyAward(entries, uid, week) }));
  }, [uid, week]);
  return result.uid === uid && result.award?.week === week ? result.award : null;
}

export function useWeeklyMedalCounts(uid: string | undefined, dates: string[]) {
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
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
