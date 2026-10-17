import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthUser } from "@/lib/auth-context";
import { currentWeekKey, publishLeaderboardEntry, watchLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import { loadDailyTasks } from "@/lib/daily-tasks";
import { loadPracticeProfile } from "@/lib/profile";

export const Route = createFileRoute("/leaderboard")({ component: Leaderboard });

function xpMeta(entry: LeaderboardEntry) {
  const xp = Number(entry.xp) || 0;
  const level = Number.isFinite(Number(entry.level)) ? Number(entry.level) : xp < 0 ? 0 : 1;
  return { xp, level };
}

function Leaderboard() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const week = currentWeekKey();

  useEffect(() => {
    if (!user) return;
    const profile = loadPracticeProfile();
    if (profile?.username) void publishLeaderboardEntry(user, profile, loadDailyTasks()).catch(() => undefined);
  }, [user]);
  useEffect(() => {
    setIsSyncing(true);
    return watchLeaderboard(week, (nextEntries) => { setEntries(nextEntries); setIsSyncing(false); });
  }, [week]);

  return <AppShell title="Weekly leaderboard"><div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-2">
    {isSyncing ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" /><span>Syncing leaderboard...</span></div> : <>{entries.map((entry, index) => {
      const medal = ["/gold-medal.png", "/silver-medal.png", "/bronze-medal.png"][index];
      const points = Number(entry.points) || 0;
      const { xp, level } = xpMeta(entry);
      return <button key={entry.uid} onClick={() => void navigate({ to: "/weekly-stats/$username", params: { username: entry.username } })} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.07]">
        <span className="grid w-7 place-items-center">{medal ? <img src={medal} alt={`Rank ${index + 1}`} className="h-6 w-6 object-contain" /> : <span className="font-mono text-sm text-zinc-500">#{index + 1}</span>}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold text-zinc-300">{entry.avatar ? <img src={`/avatars/${encodeURIComponent(entry.avatar)}`} className="h-full w-full object-cover" /> : entry.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-medium">{entry.uid === user?.uid ? "You" : entry.name}</p><p className="truncate text-xs text-zinc-500">Lv. {level} · {xp > 0 ? "+" : ""}{xp} XP</p></div>
        <strong className={`font-mono ${points > 0 ? "text-emerald-300" : points < 0 ? "text-red-300" : "text-zinc-500"}`}>{points > 0 ? "+" : points < 0 ? "-" : ""}{Math.abs(points)} pts</strong>
      </button>;
    })}{!entries.length && <p className="py-12 text-center text-sm text-zinc-500">No activity this week yet.</p>}</>}
  </div></div></AppShell>;
}
