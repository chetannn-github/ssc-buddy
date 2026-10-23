import { useEffect, useState } from "react";
import { watchLeaderboard } from "@/lib/leaderboard";
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
  const current = useLeaderboardWeek();
  const first = completedLeaderboardWeeks(dates, current)[0]!;
  const scope = `${uid ?? ""}:${first}:${current}`;
  const [result, setResult] = useState<{ scope: string; awards: Record<string, WeeklyAward | null> }>({ scope: "", awards: {} });
  useEffect(() => {
    setResult({ scope, awards: {} });
    if (!uid) return;
    let active = true;
    const stops = completedLeaderboardWeeks([first], current).map((week) => watchLeaderboard(week, (entries) => {
      if (active) setResult((previous) => ({ scope, awards: { ...previous.awards, [week]: weeklyAward(entries, uid, week) } }));
    }));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [uid, first, current, scope]);
  return countWeeklyMedals(result.scope === scope ? Object.values(result.awards) : []);
}
