import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import NumberFlow from "@number-flow/react";
import { Check, Flame, ListChecks, LoaderCircle, MonitorUp, Minus, Plus, X } from "lucide-react";
import { pinDesktopHabit, type DesktopHabitStyle } from "../lib/desktop-habit-widgets";
import { useHabits } from "../lib/habits";
import {
  HABIT_COLORS, canEditHabitDay, habitCalendar, habitDue, habitEntry,
  habitIntensity, habitIsComplete, habitScheduled, habitStats, normalizeHabitSettings,
  type Habit,
} from "../../../mobile-tasks/src/domain/habits";
import { HABIT_ICON_CATALOG } from "../../../mobile-tasks/src/domain/habit-icons";
const iconPaths = new Map(HABIT_ICON_CATALOG.map(icon => [icon.name as string, icon.path]));
import { accentInk } from "../../../mobile-tasks/src/domain/app-accent";

export function HabitDashboard({ uid, api, selected, today, dueOnly }: {
  uid?: string; api: ReturnType<typeof useHabits>; selected: string; today: string; dueOnly: boolean;
}) {
  const [pinMenu, setPinMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState("");
  const detailHabit = api.habits.find(h => h.id === detail);
  const visible = api.habits.filter(h => habitScheduled(h, selected) && (!dueOnly || habitDue(h, selected)));
  useEffect(() => { setDetail(null); setPinMenu(null); setError(""); }, [selected]);
  useEffect(() => {
    if (!detail) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDetail(null); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [detail]);
  const update = (habit: Habit, action: Parameters<typeof api.updateDay>[2]) => {
    setError("");
    void api.updateDay(habit.id, selected, action).catch(() => setError("Could not save. Try again."));
  };
  const openDetail = (habit: Habit) => { setCount(String(habitEntry(habit, selected).count)); setDetail(habit.id); };
  const pin = async (id: string, style: DesktopHabitStyle) => {
    if (!uid || pinning) return;
    setPinMenu(null); setPinning(true); setError("");
    try { await pinDesktopHabit(uid, id, style); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not pin widget."); }
    finally { setPinning(false); }
  };
  const showPinMenu = (id: string, x: number, y: number) => setPinMenu({ id, x: Math.max(8, Math.min(window.innerWidth - 196, x)), y: Math.max(8, Math.min(window.innerHeight - 144, y)) });
  useEffect(() => {
    if (!pinMenu) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setPinMenu(null); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [pinMenu]);
  return <>
    <section className="habit-list">
      {api.loading ? <div className="empty"><LoaderCircle className="spin" size={22} aria-label="Loading habits" /></div> : null}
      {(error || api.error) && <p role="alert" className="habit-error">{error || api.error}{api.error && <button onClick={api.retry}>Retry</button>}</p>}
      {!api.loading && !visible.length && <div className="empty"><p>{dueOnly && api.habits.length ? "All habits complete for this day." : "No habits for this day. Add habits in the app or web."}</p></div>}
      {visible.map(habit => {
        const settings = normalizeHabitSettings(habit.settings), entry = habitEntry(habit, selected);
        const done = habitIsComplete(habit, selected), stats = habitStats(habit, selected);
        const tint = HABIT_COLORS[habit.color], available = canEditHabitDay(selected, today);
        const checks = settings.checklist.filter(item => entry.checks.includes(item.id)).length;
        return <article key={habit.id} onContextMenu={event => { if (uid) { event.preventDefault(); showPinMenu(habit.id, event.clientX, event.clientY); } }} className="habit-card" style={{ "--habit-color": tint, "--habit-ink": accentInk(tint), "--habit-soft": tint + "22" } as CSSProperties}>
          <div className="habit-heading"><span className="habit-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={iconPaths.get(settings.icon) ?? iconPaths.get("medal")} /></svg></span><div className="habit-name"><b>{habit.name}</b><small><Flame size={13} /><NumberFlow value={stats.streak} /> day{stats.streak === 1 ? "" : "s"}{settings.tracking === "count" ? ` · ${entry.count}/${settings.dailyGoal} ${settings.unit}` : settings.tracking === "checklist" ? ` · ${checks}/${settings.checklist.length}` : ""}</small></div>
            {uid && <button className="pin-habit-button" disabled={pinning} title="Add desktop widget" aria-label={`Add desktop widget for ${habit.name}`} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); showPinMenu(habit.id, box.left, box.bottom + 4); }}>{pinning ? <LoaderCircle className="spin" size={15} /> : <MonitorUp size={16} />}</button>}
            <button className={`habit-mark ${done ? "marked" : ""}`} disabled={!available} aria-label={`${done ? "Undo" : "Mark"} ${habit.name}`} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openDetail(habit); }} onClick={() => {
              if (settings.tracking === "checklist") openDetail(habit);
              else update(habit, settings.tracking === "count" ? { type: "increment", amount: settings.step } : { type: "toggle" });
            }}>{settings.type === "quit" && !done ? <X size={19} /> : done ? <Check size={19} /> : settings.tracking === "count" ? <Plus size={19} /> : settings.tracking === "checklist" ? <ListChecks size={19} /> : <Check size={19} />}</button>
          </div>
          <HabitHeatmap habit={habit} today={today} />
          {habit.targetDays && <div className="habit-challenge"><span>{stats.total}/{habit.targetDays} days</span><div><i style={{ width: `${stats.progress * 100}%` }} /></div></div>}
        </article>;
      })}
    </section>
    {pinMenu && <div className="task-context-dismiss" onPointerDown={() => setPinMenu(null)}><div role="menu" className="task-context-menu" style={{ left: pinMenu.x, top: pinMenu.y }} onPointerDown={event => event.stopPropagation()}>
      {(["heatmap", "month", "compact"] as const).map(style => <button role="menuitem" key={style} onClick={() => void pin(pinMenu.id, style)}><MonitorUp size={16} />{style === "heatmap" ? "Heatmap widget" : style === "month" ? "Month view widget" : "Compact widget"}</button>)}
    </div></div>}
    {detailHabit && (() => {
      const settings = normalizeHabitSettings(detailHabit.settings), entry = habitEntry(detailHabit, selected);
      const available = canEditHabitDay(selected, today) && habitScheduled(detailHabit, selected);
      const tint = HABIT_COLORS[detailHabit.color];
      return <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) setDetail(null); }}>
        <section role="dialog" aria-modal="true" aria-label={detailHabit.name} className="dialog habit-detail" style={{ "--habit-color": tint, "--habit-ink": accentInk(tint) } as CSSProperties}>
          <h2>{detailHabit.name}</h2><small>{selected}</small>{error && <p role="alert" className="habit-error">{error}</p>}
          {settings.tracking === "checklist" ? settings.checklist.map(item => <button key={item.id} className={`habit-check-item ${entry.checks.includes(item.id) ? "checked" : ""}`} disabled={!available} onClick={() => update(detailHabit, { type: "check", id: item.id })}><span>{item.title}</span><Check size={18} /></button>) : settings.tracking === "count" ? <>
            <div className="habit-count-editor"><button disabled={!available} onClick={() => update(detailHabit, { type: "increment", amount: -settings.step })}><Minus size={18} /></button><NumberFlow value={entry.count} /><button disabled={!available} onClick={() => update(detailHabit, { type: "increment", amount: settings.step })}><Plus size={18} /></button></div>
            <form onSubmit={e => { e.preventDefault(); if (available && count.trim() && Number.isFinite(Number(count)) && Number(count) >= 0) { update(detailHabit, { type: "count", value: Number(count) }); setDetail(null); } }}><label>Set count<input type="number" min="0" step="any" value={count} onChange={e => setCount(e.target.value)} disabled={!available} /></label><button className="primary" disabled={!available || !count.trim() || !Number.isFinite(Number(count)) || Number(count) < 0}>Save</button></form>
          </> : <p>Mark this habit from its check button.</p>}
          <button className="secondary" onClick={() => setDetail(null)}>Done</button>
        </section>
      </div>;
    })()}
  </>;
}

function HabitHeatmap({ habit, today }: { habit: Habit; today: string }) {
  const cells = useMemo(() => habitCalendar(today), [today]);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth; }, [today]);
  return <div className="habit-heatmap" ref={scroll} tabIndex={0} role="region" aria-label={`${habit.name} heatmap`}><div style={{ gridTemplateColumns: `repeat(${cells.length / 7}, 13px)` }}>
    {cells.map(cell => <span key={cell.key} title={`${cell.key} · ${Math.round(habitIntensity(habit, cell.key) * 100)}%`} style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1, background: HABIT_COLORS[habit.color], opacity: cell.future ? .04 : .12 + habitIntensity(habit, cell.key) * .88 }} />)}
  </div></div>;
}
