import { useEffect, useState } from "react";
import { leaderboardWeekLabel, usePreviousWeeklyAward, weeklyAwardSeenKey } from "@/lib/weekly-results";
import { CelebrationFireworks } from "./CelebrationFireworks";
import { CELEBRATION_PREVIEW, CELEBRATION_PREVIEW_ID, CELEBRATION_PREVIEW_RANK } from "../../mobile-tasks/src/domain/celebration-preview";
import { leaderboardWeek, shiftLeaderboardWeek } from "../../mobile-tasks/src/domain/weekly-results";

export function WeeklyAwardCelebration({ uid }: { uid: string }) {
  const earnedAward = usePreviousWeeklyAward(uid);
  const award = CELEBRATION_PREVIEW ? { rank: CELEBRATION_PREVIEW_RANK, points: 0, week: shiftLeaderboardWeek(leaderboardWeek(), -1) } : earnedAward;
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const key = CELEBRATION_PREVIEW ? `${CELEBRATION_PREVIEW_ID}:${uid}` : award ? weeklyAwardSeenKey(uid, award.week) : null;
  useEffect(() => {
    if (!key) { setVisibleKey(null); return; }
    try { setVisibleKey(localStorage.getItem(key) ? null : key); } catch { setVisibleKey(key); }
  }, [key]);
  if (!award || key !== visibleKey) return null;
  const close = () => { if (key) { try { localStorage.setItem(key, "1"); } catch {} } setVisibleKey(null); };
  return <div className="fixed inset-0 z-[85] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"><CelebrationFireworks /><section role="dialog" aria-modal="true" aria-labelledby="weekly-award-title" className="relative w-full max-w-sm rounded-2xl border border-amber-300/25 bg-[#121212] p-7 text-center text-zinc-100 shadow-2xl">
    <img src={["/gold-medal.png", "/silver-medal.png", "/bronze-medal.png"][award.rank - 1]} alt="" className="mx-auto h-24 w-24 animate-in zoom-in duration-700 object-contain" />
    <p className="mt-4 text-xs font-semibold tracking-widest text-amber-300 uppercase">{CELEBRATION_PREVIEW ? "Silver celebration preview" : "Weekly podium"}</p><h2 id="weekly-award-title" className="mt-2 text-2xl font-bold">You finished #{award.rank}!</h2>
    <p className="mt-2 text-sm text-zinc-400">{leaderboardWeekLabel(award.week)}</p><p className="mt-2 text-sm text-zinc-300">{CELEBRATION_PREVIEW ? "Preview only · Your actual rank is unchanged." : `${award.points} points · Your weekly medal is on your profile.`}</p>
    <button type="button" onClick={close} className="mt-6 w-full rounded-lg bg-amber-200 px-4 py-3 font-semibold text-zinc-900">Celebrate & continue</button>
  </section></div>;
}
