import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RollingNumber, RollingDuration } from "@/components/ui/rolling-number";
import { AppShell } from "@/components/layout/AppShell";
import { loadLeaderboard, type LeaderboardEntry, type LeaderboardTask } from "@/lib/leaderboard";
import { todayKey, loadDailyTasks } from "@/lib/daily-tasks";
import { useLeaderboardXp } from "../../shared/use-leaderboard-xp";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { useAuthUser } from "@/lib/auth-context";
import { useLeaderboardWeek, validLeaderboardWeek } from "@/lib/weekly-results";
import { WeeklyResultControls } from "@/components/WeeklyResultControls";

import { ALL_LEADERBOARD_DAYS, leaderboardPeriodStats, leaderboardPeriodTasks } from "../../mobile-tasks/src/domain/leaderboard-period";

export const Route = createFileRoute("/weekly-stats/$username")({
  validateSearch: (search: Record<string, unknown>): { week?: string } => {
    const week = validLeaderboardWeek(search["week"]);
    return week ? { week } : {};
  },
  component: WeeklyStats,
});

const dateLabel = (date: string) => date === ALL_LEADERBOARD_DAYS ? "Full week" : date === todayKey() ? "Today" : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const taskMeta = (task: LeaderboardTask) => [task.subject, task.type, task.minutesSpent ? `${task.minutesSpent}m` : ""].filter(Boolean).join(" · ");

function DayFilter({ dates, value, onChange }: { dates: string[]; value: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [open]);
  return <div ref={menuRef} className="relative z-20 w-36"><button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors ${open ? "border-sky-400 bg-zinc-800 text-white" : "border-white/10 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"}`}><span>{dateLabel(value)}</span><ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} /></button>{open && <div className="absolute right-0 top-11 w-full origin-top overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 p-1 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-200">{dates.map((date) => { const selected = date === value; return <button type="button" key={date} onClick={() => { onChange(date); setOpen(false); }} className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors ${selected ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-200 hover:bg-white/10"}`}><span>{dateLabel(date)}</span>{selected && <Check className="h-4 w-4" />}</button>; })}</div>}</div>;
}

function WeeklyStats() {
  const { username } = Route.useParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const navigate = useNavigate();
  const currentWeek = useLeaderboardWeek();
  const week = Route.useSearch().week ?? currentWeek;
  const user = useAuthUser();
  const xpByUser = useLeaderboardXp(entries, week, currentWeek, getFirebaseFirestore, user?.uid, loadDailyTasks(), false);
  useEffect(() => { setLoading(true); return loadLeaderboard(week, (next) => { setEntries(next); setLoading(false); }); }, [week, currentWeek]);
  const entry = entries.find((item) => item.username.toLowerCase() === username.toLowerCase());
  const tasks = useMemo(() => entry?.leaderboardTasks ?? (entry?.completedTasks ?? []).map((task) => ({ ...task, completed: true, date: week === currentWeek ? todayKey() : week, points: 10 })), [entry, week, currentWeek]);
  const inactiveDates = entry?.inactiveDates ?? [];
  const dates = useMemo(() => [ALL_LEADERBOARD_DAYS, ...Array.from(new Set([...(week === currentWeek ? [todayKey()] : []), ...inactiveDates, ...Object.keys(entry?.focusDays ?? {}), ...tasks.map((task) => task.date).filter(Boolean)])).sort().reverse()], [inactiveDates, tasks, week, currentWeek, entry?.focusDays]);
  const visibleTasks = useMemo(() => leaderboardPeriodTasks(tasks, inactiveDates, selectedDate, entry?.focusDays), [inactiveDates, selectedDate, tasks, entry?.focusDays]);
  const stats = leaderboardPeriodStats(entry ?? {}, tasks, selectedDate);
  useEffect(() => { setSelectedDate(week === currentWeek ? todayKey() : ALL_LEADERBOARD_DAYS); }, [username, week, currentWeek]);
  if (loading) return <AppShell title="Weekly stats"><div className="leaderboard-page profile-dark -mx-4 -my-6 flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#121212] text-sm text-zinc-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin text-emerald-400" /> Loading weekly stats...</div></AppShell>;
  if (!entry) return <AppShell title="Weekly stats"><div className="leaderboard-page profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><div className="mx-auto max-w-3xl pt-12 text-center"><p className="text-lg font-semibold">Weekly stats not found</p><Link to="/leaderboard" search={{ week }} className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200">Back to leaderboard</Link></div></div></AppShell>;
  const rank = entries.findIndex((item) => item.uid === entry.uid) + 1;
  const medal = ["/gold-medal.png", "/silver-medal.png", "/bronze-medal.png"][rank - 1];
  const points = stats.points, currentXp = xpByUser[entry.uid];
  return <AppShell title="Weekly stats"><div className="leaderboard-page profile-dark -mx-4 -my-6 h-[calc(100vh-4rem)] overflow-hidden bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col"><section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center gap-3"><Link to="/leaderboard" search={{ week }} aria-label="Back to leaderboard" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"><ArrowLeft className="h-5 w-5" /></Link><Link to="/$username" params={{ username: `@${entry.username}` }} className="flex min-w-0 items-center gap-3 rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sky-400"><span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xl font-semibold">{entry.avatar ? <img src={`/avatars/${encodeURIComponent(entry.avatar)}`} className="h-full w-full object-cover" /> : entry.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><h2 className="truncate text-xl font-semibold">{entry.name}</h2><p className="truncate text-sm text-zinc-500">@{entry.username}</p><p className="mt-0.5 text-xs font-medium text-violet-300">{currentXp ? <>Lv. <RollingNumber value={currentXp.level} /> · <RollingNumber value={currentXp.xp} prefix={currentXp.xp > 0 ? "+" : ""} suffix=" XP" /></> : "Current XP unavailable"}</p></div></Link><span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs font-semibold text-zinc-300">{medal && <img src={medal} alt="" className="h-4 w-4 object-contain" />}<RollingNumber value={rank} prefix="#" /></span></div><div className="mt-6 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x divide-white/10 text-center"><div><p className={`text-lg font-semibold ${points > 0 ? "text-emerald-300" : points < 0 ? "text-red-300" : "text-zinc-500"}`}><RollingNumber value={points} prefix={points > 0 ? "+" : ""} /></p><p className="text-xs text-zinc-500">Points</p></div><div><p className="inline-flex items-center justify-center text-lg font-semibold"><RollingNumber value={stats.completed} /><span>/</span><RollingNumber value={stats.completed + stats.notCompleted} /></p><p className="text-xs text-zinc-500">Tasks completed</p></div><div><p className="text-lg font-semibold"><RollingDuration minutes={stats.studyMinutes} /></p><p className="text-xs text-zinc-500">Study time</p></div><div><p className="text-lg font-semibold"><RollingDuration minutes={Math.floor(stats.focusMilliseconds / 60000)} /></p><p className="text-xs text-zinc-500">Focus time</p></div></div><div className="mt-7 flex justify-end"><DayFilter dates={dates} value={selectedDate} onChange={setSelectedDate} /></div><div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"><div className="divide-y divide-white/10 overflow-hidden rounded-lg bg-black/10 px-3">{visibleTasks.length ? visibleTasks.map((task, index) => <div key={`${task.name}-${index}`} className="flex items-center gap-3 py-2.5"><span className={task.completed ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" : task.date < todayKey() ? "grid h-6 w-6 shrink-0 place-items-center rounded-full border border-red-400/40 bg-red-400/10 text-red-300" : "grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/20 text-zinc-400"}>{task.completed ? "✓" : task.date < todayKey() ? "×" : "○"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.name}</p>{(taskMeta(task) || selectedDate === ALL_LEADERBOARD_DAYS) && <p className="text-xs text-zinc-500">{[selectedDate === ALL_LEADERBOARD_DAYS ? dateLabel(task.date) : "", taskMeta(task)].filter(Boolean).join(" · ")}</p>}</div><span className={`shrink-0 font-mono text-[11px] font-semibold ${task.points > 0 ? "text-emerald-300" : task.points < 0 ? "text-red-300" : "text-zinc-500"}`}><RollingNumber value={task.points} prefix={task.points > 0 ? "+" : ""} suffix=" pts" /></span></div>) : <p className="text-sm text-zinc-500">{selectedDate === ALL_LEADERBOARD_DAYS ? "No tasks this week." : "No tasks for this day."}</p>}</div></div></section></div></div></AppShell>;
}
