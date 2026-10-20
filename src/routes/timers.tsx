import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TimerLiquidDial } from "@/components/timers/TimerLiquidDial";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthUser } from "@/lib/auth-context";
import { loadPracticeProfile } from "@/lib/profile";
import { useDateTimers } from "@/lib/date-timers";
import { dateCountdown, timerDial, TIMER_COLORS, makeDateTimer, timerInputFields, type DateTimer } from "../../mobile-tasks/src/domain/date-timers";

export const Route = createFileRoute("/timers")({ head: () => ({ meta: [{ title: "Timers" }] }), component: Timers });

function Timers() {
  const user = useAuthUser();
  const { timers, loading, error, retry, save, remove } = useDateTimers(user?.uid);
  const [enabled, setEnabled] = useState(() => loadPracticeProfile()?.timersEnabled !== false);
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState<DateTimer | "new" | null>(null);
  const [deleting, setDeleting] = useState<DateTimer | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => { setEditing(null); setDeleting(null); setFormError(""); }, [user?.uid]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const update = () => setEnabled(loadPracticeProfile()?.timersEnabled !== false); window.addEventListener("cbt-profile-updated", update); return () => window.removeEventListener("cbt-profile-updated", update); }, []);
  const open = (timer?: DateTimer) => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const fields = timerInputFields(timer?.targetAt ?? tomorrow.toISOString());
    setTitle(timer?.title ?? ""); setDate(fields.date); setFormError(""); setEditing(timer ?? "new");
  };
  const submit = async () => {
    if (busy || !editing) return;
    try {
      const previous = editing === "new" ? undefined : editing;
      const timer = makeDateTimer(previous?.id ?? crypto.randomUUID(), title, date, previous);
      setBusy(true); setFormError(""); await save(timer); setEditing(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not save timer. Try again."); }
    finally { setBusy(false); }
  };
  const timerColors = new Map([...timers].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((timer, index) => [timer.id, TIMER_COLORS[index % TIMER_COLORS.length]!]));
  const sorted = [...timers].sort((a, b) => Number(dateCountdown(a.targetAt, now).reached) - Number(dateCountdown(b.targetAt, now).reached) || Date.parse(a.targetAt) - Date.parse(b.targetAt));
  return <AppShell title="Timers"><div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"><main className="mx-auto max-w-4xl">
    <div className="mb-6 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Important dates</p><h1 className="mt-1 text-2xl font-semibold">Timers</h1></div>{enabled && <Button className="bg-[#60a5fa] text-[#081a31] hover:bg-[#93c5fd]" onClick={() => open()} disabled={!user}><Plus className="h-4 w-4" />Add timer</Button>}</div>
    {!enabled ? <div className="rounded-xl border border-white/10 bg-white/[.025] p-6 text-center"><p className="text-zinc-300">Timers are turned off.</p><Link to="/profile" className="mt-2 inline-block text-sm text-sky-300">Enable Timers in Edit Profile → Settings</Link></div> : !user ? <p className="py-12 text-center text-zinc-400">Sign in to save your important dates.</p> : loading ? <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 animate-spin text-sky-300" /></div> : error ? <div className="text-center"><p className="text-red-300">{error}</p><Button variant="outline" className="mt-3" onClick={retry}>Try again</Button></div> : sorted.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sorted.map((timer) => {
      const dial = timerDial(timer, now);
      const color = timerColors.get(timer.id)!;
      return <ContextMenu key={timer.id} modal={false}><ContextMenuTrigger asChild disabled={busy}><article tabIndex={0} aria-label={`${timer.title} timer; right-click for options`} className="rounded-2xl border border-white/10 bg-[#151515] p-2.5 relative">
        <TimerLiquidDial liquidProgress={0.18} dial={dial} color={color} size={136} />
        <h2 className="mt-1 break-words text-center text-sm font-semibold">{timer.title}</h2>
        <p className="mt-1 text-center text-xs text-zinc-400">{new Date(timer.targetAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
      </article></ContextMenuTrigger>
        <ContextMenuContent className="w-44 rounded-xl border-white/10 bg-[#202020] p-1.5 text-zinc-100 shadow-xl" onCloseAutoFocus={(event) => { if (editing || deleting) event.preventDefault(); }}>
          <ContextMenuItem disabled={busy} className="gap-2 rounded-lg py-2.5 focus:bg-white/10 focus:text-white" onSelect={() => open(timer)}><Pencil className="h-4 w-4" />Edit</ContextMenuItem>
          <ContextMenuItem disabled={busy} className="gap-2 rounded-lg py-2.5 text-red-300 focus:bg-red-400/10 focus:text-red-300" onSelect={() => { setFormError(""); setDeleting(timer); }}><Trash2 className="h-4 w-4" />Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>;
    })}</div> : <div className="rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center"><Timer className="mx-auto h-10 w-10 text-sky-300/60" /><h2 className="mt-4 text-lg font-semibold">Your next milestone starts here</h2><p className="mt-2 text-sm text-zinc-400">Add an important date to see your countdown.</p><Button onClick={() => open()} className="mt-5 bg-[#60a5fa] text-[#081a31] hover:bg-[#93c5fd]"><Plus className="h-4 w-4" />Add your first timer</Button></div>}
    <Dialog open={editing !== null} onOpenChange={(value) => { if (!value && !busy) setEditing(null); }}><DialogContent className="border-white/10 bg-[#1b1b1b] text-zinc-100 sm:max-w-md"><DialogHeader><div className="flex items-center justify-between gap-3 pr-5"><DialogTitle>{editing === "new" ? "Add timer" : "Edit timer"}</DialogTitle>{editing && editing !== "new" && <button type="button" disabled={busy} aria-label="Delete timer" onClick={() => { setFormError(""); setDeleting(editing); setEditing(null); }} className="rounded-lg p-2 text-red-300 hover:bg-red-400/10 disabled:opacity-50"><Trash2 className="h-5 w-5" /></button>}</div></DialogHeader><form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4"><div className="space-y-2"><Label htmlFor="timer-title">Name</Label><Input autoFocus id="timer-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="SSC CGL exam" disabled={busy} /></div><div className="space-y-2"><Label htmlFor="timer-date">Date</Label><Input id="timer-date" type="date" style={{ colorScheme: "dark" }} value={date} onChange={(event) => setDate(event.target.value)} disabled={busy} required /></div>{formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Save timer</Button></div></form></DialogContent></Dialog>
    <Dialog open={deleting !== null} onOpenChange={(value) => { if (!value && !busy) setDeleting(null); }}><DialogContent className="border-white/10 bg-[#1b1b1b] text-zinc-100 sm:max-w-sm"><DialogHeader><DialogTitle>Delete timer?</DialogTitle></DialogHeader><p className="text-sm text-zinc-400">Remove “{deleting?.title}”?</p>{formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (!deleting) return; setBusy(true); try { await remove(deleting.id); setDeleting(null); } catch { setFormError("Could not delete timer. Try again."); } finally { setBusy(false); } }}>Delete</Button></div></DialogContent></Dialog>
  </main></div></AppShell>;
}
