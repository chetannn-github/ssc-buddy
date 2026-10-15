import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, LoaderCircle, Medal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthUser } from "@/lib/auth-context";
import { currentWeekKey, publishLeaderboardEntry, watchLeaderboard, type LeaderboardEntry, type LeaderboardTask } from "@/lib/leaderboard";
import { loadDailyTasks, todayKey } from "@/lib/daily-tasks";
import { loadPracticeProfile } from "@/lib/profile";

export const Route = createFileRoute("/leaderboard")({ component: Leaderboard });

const dateLabel = (date: string) => date === todayKey() ? "Today" : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

function TaskGroup({ title, tasks, completed }: { title: string; tasks: LeaderboardTask[]; completed: boolean }) {
  return <section className="mt-7 first:mt-0">
    <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500">{title} · {tasks.length}</p>
    <div className="mt-3 space-y-2">
      {tasks.length ? tasks.map((task, index) => <div key={`${task.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2.5">
        <span className={completed ? "text-emerald-400" : "text-red-400"}>{completed ? "✓" : "×"}</span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{task.name}</p><span className={`shrink-0 font-mono text-[11px] font-semibold ${task.points > 0 ? "text-emerald-300" : task.points < 0 ? "text-red-300" : "text-zinc-500"}`}>{task.points > 0 ? `+${task.points}` : task.points < 0 ? `−${Math.abs(task.points)}` : "0"} pts</span></div>{task.subject && <p className="text-xs text-zinc-500">{task.subject}</p>}</div>
      </div>) : <p className="text-sm text-zinc-500">No tasks for this day.</p>}
    </div>
  </section>;
}

function DayFilter({ dates, value, onChange }: { dates: string[]; value: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="relative z-20 w-36">
    <button type="button" onClick={() => setOpen((current) => !current)} className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors ${open ? "border-sky-400 bg-zinc-800 text-white" : "border-white/10 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"}`}>
      <span>{dateLabel(value)}</span><ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="absolute right-0 top-11 w-full origin-top overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800 p-1 shadow-xl shadow-black/40 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-200">
      {dates.map((date) => { const selected = date === value; return <button type="button" key={date} onClick={() => { onChange(date); setOpen(false); }} className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors ${selected ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-200 hover:bg-white/10"}`}><span>{dateLabel(date)}</span>{selected && <Check className="h-4 w-4" />}</button>; })}
    </div>}
  </div>;
}

function Leaderboard() {
  const user = useAuthUser();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const week = currentWeekKey();

  useEffect(() => {
    if (!user) return;
    const profile = loadPracticeProfile();
    if (profile?.username) void publishLeaderboardEntry(user, profile, loadDailyTasks()).catch(() => undefined);
  }, [user]);
  useEffect(() => {
    setIsSyncing(true);
    return watchLeaderboard(week, (nextEntries) => {
      setEntries(nextEntries);
      setIsSyncing(false);
    });
  }, [week]);

  const selectedTasks = useMemo(() => selected?.leaderboardTasks ?? (selected?.completedTasks ?? []).map((task) => ({ ...task, completed: true, date: todayKey(), points: 10 })), [selected]);
  const dates = useMemo(() => Array.from(new Set([todayKey(), ...selectedTasks.map((task) => task.date).filter(Boolean)])).sort().reverse(), [selectedTasks]);
  const visibleTasks = selectedTasks.filter((task) => task.date === selectedDate);

  if (selected) {
    const hours = Math.floor(selected.studyMinutes / 60); const minutes = selected.studyMinutes % 60;
    return <AppShell title="Profile"><div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><div className="mx-auto max-w-3xl">
      <button onClick={() => setSelected(null)} className="mb-5 text-sm text-zinc-400 hover:text-white">← Back to leaderboard</button>
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex items-center gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xl font-semibold">{selected.avatar ? <img src={`/avatars/${encodeURIComponent(selected.avatar)}`} className="h-full w-full object-cover" /> : selected.name.slice(0, 1).toUpperCase()}</span><div><h2 className="text-xl font-semibold">{selected.name}</h2><p className="text-sm text-zinc-500">@{selected.username}</p></div></div>
        <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 text-center"><div><p className="text-lg font-semibold text-emerald-300">{selected.points}</p><p className="text-xs text-zinc-500">Points</p></div><div><p className="text-lg font-semibold">{selected.completed}</p><p className="text-xs text-zinc-500">Completed</p></div><div><p className="text-lg font-semibold">{hours}h {minutes}m</p><p className="text-xs text-zinc-500">Study time</p></div></div>
        <div className="mt-7 flex items-center justify-between gap-3"><p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500">TASKS BY DAY</p><DayFilter dates={dates} value={selectedDate} onChange={setSelectedDate} /></div>
        <div className="mt-5"><TaskGroup title="COMPLETED" tasks={visibleTasks.filter((task) => task.completed)} completed /><TaskGroup title="NOT COMPLETED" tasks={visibleTasks.filter((task) => !task.completed)} completed={false} /></div>
      </section>
    </div></div></AppShell>;
  }

  return <AppShell title="Weekly leaderboard"><div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-2">
    {isSyncing ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-zinc-500"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" /><span>Syncing leaderboard…</span></div> : <>{entries.map((entry, index) => { const medal = ["text-amber-300", "text-zinc-300", "text-amber-600"][index]; return <button key={entry.uid} onClick={() => { setSelectedDate(todayKey()); setSelected(entry); }} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.07]"><span className="grid w-7 place-items-center">{index < 3 ? <Medal className={`h-5 w-5 ${medal}`} fill="currentColor" /> : <span className="font-mono text-sm text-zinc-500">#{index + 1}</span>}</span><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-semibold text-zinc-300">{entry.avatar ? <img src={`/avatars/${encodeURIComponent(entry.avatar)}`} className="h-full w-full object-cover" /> : entry.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{entry.name} {entry.uid === user?.uid && <span className="ml-1 rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">You</span>} <span className="font-normal text-zinc-500">@{entry.username}</span></p><p className="text-xs text-zinc-500">{entry.completed} completed · {entry.studyMinutes} min study</p></div><strong className="font-mono text-emerald-300">{entry.points}</strong></button>; })}{!entries.length && <p className="py-12 text-center text-sm text-zinc-500">No activity this week yet.</p>}</>}
  </div></div></AppShell>;
}
