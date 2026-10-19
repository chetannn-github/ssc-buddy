import { ChevronLeft, ChevronRight } from "lucide-react";
import { leaderboardWeekLabel, shiftLeaderboardWeek } from "@/lib/weekly-results";

export function WeeklyResultControls({ week, currentWeek, onChange }: { week: string; currentWeek: string; onChange: (week: string) => void }) {
  return <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
    <button type="button" aria-label="Previous week" onClick={() => onChange(shiftLeaderboardWeek(week, -1))} className="rounded-lg p-2 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
    <div className="text-center"><p className="text-sm font-semibold">{week === currentWeek ? "This week · Live" : "Weekly results"}</p><p className="text-xs text-zinc-400">{leaderboardWeekLabel(week)}</p>{week !== currentWeek && <button type="button" onClick={() => onChange(currentWeek)} className="mt-1 text-xs text-emerald-300">Back to this week</button>}</div>
    <button type="button" aria-label="Next week" disabled={week >= currentWeek} onClick={() => onChange(shiftLeaderboardWeek(week, 1))} className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
  </div>;
}
