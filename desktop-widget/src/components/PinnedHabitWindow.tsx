import { HeatmapCell } from "./HeatmapCell";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import NumberFlow from "@number-flow/react";
import { Check, Flame, ListChecks, LoaderCircle, Minus, Plus, Trash2, X } from "lucide-react";
import type { User } from "firebase/auth";
import { observeAuth, watchProfileAccent } from "../lib/firebase";
import { useHabits, useHabitToday } from "../lib/habits";
import { removeDesktopHabit, responsiveHabitStyle, type DesktopHabitPin } from "../lib/desktop-habit-widgets";
import { HABIT_COLORS, habitEntry, habitIntensity, habitIsComplete, habitScheduled, habitStats, normalizeHabitSettings } from "../../../mobile-tasks/src/domain/habits";
import { habitWidgetCalendar } from "../../../mobile-tasks/src/domain/habit-widget-layout";
import { accentInk, normalizeAppAccent } from "../../../mobile-tasks/src/domain/app-accent";

export function PinnedHabitWindow({ pin }: { pin: DesktopHabitPin }) {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false);
  const [glowAccent, setGlowAccent] = useState(normalizeAppAccent(undefined));
  const [error, setError] = useState(""), [checklist, setChecklist] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const card = useRef<HTMLElement>(null);
  const resizingChecklist = useRef(false);
  const resizeSequence = useRef(Promise.resolve());
  const [displayStyle, setDisplayStyle] = useState(() => responsiveHabitStyle(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const resize = () => { if (!checklist && !resizingChecklist.current) setDisplayStyle(responsiveHabitStyle(window.innerWidth, window.innerHeight)); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [checklist]);
  const today = useHabitToday();
  const api = useHabits(user?.uid === pin.uid ? user.uid : undefined);
  const habit = api.habits.find(h => h.id === pin.habitId);
  const checklistCount = habit ? normalizeHabitSettings(habit.settings).checklist.length : 0;
  useEffect(() => {
    if (!checklist || displayStyle !== "compact") return;
    let cancelled = false;
    resizingChecklist.current = true;
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const expand = resizeSequence.current.catch(() => undefined).then(() => invoke("resize_habit_checklist", { expanded: true, itemCount: checklistCount, animate }))
      .then(() => undefined).catch(() => { if (!cancelled) setError("Could not expand checklist."); });
    resizeSequence.current = expand;
    return () => {
      cancelled = true;
      const collapse = expand.then(() => invoke("resize_habit_checklist", { expanded: false, itemCount: 0, animate }))
        .then(() => undefined).catch(() => undefined);
      resizeSequence.current = collapse;
      void collapse.then(() => {
        if (resizeSequence.current === collapse) {
          resizingChecklist.current = false;
          setDisplayStyle(responsiveHabitStyle(window.innerWidth, window.innerHeight));
        }
      });
    };
  }, [checklist, checklistCount, displayStyle]);

  useEffect(() => {
    if (!habit || displayStyle === "compact" || checklist || resizingChecklist.current || !card.current) return;
    let timer = 0;
    const fit = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const element = card.current;
        if (!element || resizingChecklist.current || window.innerHeight < 200) return;
        const rootStyle = getComputedStyle(element);
        let required = parseFloat(rootStyle.paddingTop) + parseFloat(rootStyle.paddingBottom) + 8;
        for (const child of Array.from(element.children)) {
          const style = getComputedStyle(child);
          if (style.position === "absolute" || style.position === "fixed") continue;
          required += child.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        }
        if (Math.abs(Math.ceil(required) - window.innerHeight) > 2) {
          void invoke("fit_habit_heatmap", { height: Math.ceil(required) }).catch(() => setError("Could not fit heatmap."));
        }
      }, 100);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(card.current);
    const grid = card.current.querySelector(".pinned-grid");
    if (grid) observer.observe(grid);
    fit();
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [habit?.id, habit?.targetDays, displayStyle, checklist, checklistCount, today]);

  useEffect(() => { document.body.classList.add("pinned-habit-body"); return () => document.body.classList.remove("pinned-habit-body"); }, []);
  useEffect(() => observeAuth(next => { setUser(next); setReady(true); setChecklist(false); setError(""); }), []);
  useEffect(() => {
    setGlowAccent(normalizeAppAccent(undefined));
    if (!user || user.uid !== pin.uid) return;
    return watchProfileAccent(user, (value) => setGlowAccent(normalizeAppAccent(value)));
  }, [user?.uid, pin.uid]);
  const tint = habit ? HABIT_COLORS[habit.color] : "#ffe000";
  const style = { "--glow-accent": glowAccent, "--accent": tint, "--accent-ink": accentInk(tint), "--habit-color": tint, "--habit-ink": accentInk(tint), "--habit-soft": tint + "22" } as CSSProperties;
  const remove = () => { void removeDesktopHabit().catch(() => setError("Could not remove widget. Try again.")); };
  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ x: Math.max(6, Math.min(window.innerWidth - 170, event.clientX)), y: Math.max(6, Math.min(window.innerHeight - 54, event.clientY)) });
  };
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setMenu(null); } };
    const blur = () => setMenu(null);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("blur", blur); };
  }, [menu]);
  const contextMenu = menu && <div className="pinned-context-dismiss" onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu(null); }} onPointerDown={event => { event.stopPropagation(); setMenu(null); }}>
    <div role="menu" aria-label="Widget options" className="pinned-context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()}>
      <button autoFocus role="menuitem" onClick={() => { setMenu(null); remove(); }}><Trash2 size={15} />Remove widget</button>
    </div>
  </div>;
  if (!ready || api.loading) return <main className="pinned-habit" style={style} onContextMenu={openMenu}><div aria-hidden="true" className="accent-top-glow" /><div className="pinned-tools"><span data-tauri-drag-region></span></div><div className="pinned-placeholder"><LoaderCircle className="spin" aria-label="Loading habit" /></div>{contextMenu}</main>;
  if (!habit) return <main className="pinned-habit" style={style} onContextMenu={openMenu}><div aria-hidden="true" className="accent-top-glow" /><div className="pinned-tools"><span data-tauri-drag-region></span></div><div className="pinned-placeholder"><p>{!user || user.uid !== pin.uid ? "Sign in to the original account from the main window." : api.error || "This habit is no longer available."}</p>{api.error && <button onClick={api.retry}>Retry</button>}{error && <p role="alert">{error}</p>}</div>{contextMenu}</main>;
  const settings = normalizeHabitSettings(habit.settings), stats = habitStats(habit, today), entry = habitEntry(habit, today);
  const done = habitIsComplete(habit, today), available = habitScheduled(habit, today);
  const update = (action: Parameters<typeof api.updateDay>[2]) => { setError(""); void api.updateDay(habit.id, today, action).catch(() => setError("Could not save. Try again.")); };
  const mark = () => settings.tracking === "checklist" ? setChecklist(v => !v) : update(settings.tracking === "count" ? { type: "increment", amount: settings.step } : { type: "toggle" });
  const markButton = <button className={`habit-mark ${done ? "marked" : ""}`} disabled={!available} aria-label={`${done ? "Undo" : "Mark"} ${habit.name}`} onClick={mark}>{settings.type === "quit" && !done ? <X /> : done ? <Check /> : settings.tracking === "count" ? <Plus /> : settings.tracking === "checklist" ? <ListChecks /> : <Check />}</button>;
  const streak = <span className="pinned-streak"><b><NumberFlow value={stats.streak} /><Flame size={20} fill="currentColor" /></b><small>{stats.streak === 1 ? "DAY" : "DAYS"}</small></span>;
  const cells = displayStyle === "compact" ? [] : habitWidgetCalendar(today, displayStyle === "heatmap");
  const wide = displayStyle === "heatmap", step = wide ? 16 : 25, labelX = wide ? 13 : 0, labelY = wide ? 0 : 16;
  const columns = wide ? 20 : 7, rows = Math.max(0, ...cells.map(c => c.row)) + 1;
  return <main ref={card} className={`pinned-habit pinned-${displayStyle}`} style={style} onContextMenu={openMenu}><div aria-hidden="true" className="accent-top-glow" />
    <div className="pinned-tools"><span data-tauri-drag-region title="Drag widget"></span></div>
    <div className="pinned-heading"><h1 data-tauri-drag-region>{habit.name}</h1>{displayStyle !== "compact" && streak}</div>
    {displayStyle === "compact" ? <div className="pinned-compact-bottom">{streak}{markButton}</div> : <>
      <div className="pinned-grid" style={{ aspectRatio: `${labelX + columns * step} / ${labelY + rows * step}` }}><svg preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${labelX + columns * step} ${labelY + rows * step}`} role="img" aria-label={`${habit.name} ${wide ? "20-week heatmap" : "monthly heatmap"}`}>
        {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <text key={i} x={wide ? 2 : (i + .5) * step} y={wide ? (i + .65) * step : 10} fill="#777" fontSize="9" textAnchor={wide ? "start" : "middle"}>{day}</text>)}
        {cells.map(cell => <HeatmapCell key={cell.key} x={labelX + cell.column * step + 1} y={labelY + cell.row * step + 1} size={step - 2} color={tint} intensity={habitIntensity(habit, cell.key)} future={cell.future} />)}
      </svg></div><div className="pinned-footer"><small>{wide ? "Last 20 weeks" : new Date(today + "T12:00:00").toLocaleDateString(undefined, { month: "long" })}</small>{markButton}</div>
    </>}
    {habit.targetDays && <div className="pinned-target" aria-label={`${stats.total} of ${habit.targetDays} challenge days completed`}><span><NumberFlow value={stats.total} />/{habit.targetDays} days</span><div><i style={{ width: `${stats.progress * 100}%` }} /></div></div>}
    {settings.tracking === "count" && <div className="pinned-count"><button disabled={!available} aria-label="Subtract count" onClick={() => update({ type: "increment", amount: -settings.step })}>−</button><span><NumberFlow value={entry.count} />/{settings.dailyGoal} {settings.unit}</span></div>}
    {!!error && <p role="alert" className="habit-error">{error}</p>}
    {checklist && <div className="pinned-checklist" role="dialog" aria-modal="true" aria-label={`${habit.name} checklist`}>
      <div className="pinned-checklist-header"><b data-tauri-drag-region>{habit.name}</b><span className="pinned-checklist-score">{settings.checklist.filter(item => entry.checks.includes(item.id)).length}/{settings.checklist.length}</span><button onClick={() => setChecklist(false)} aria-label="Close checklist"><X size={16} /></button></div>
      <div className="pinned-checklist-items">{settings.checklist.map(item => <button key={item.id} className={`habit-check-item ${entry.checks.includes(item.id) ? "checked" : ""}`} disabled={!available} onClick={() => update({ type: "check", id: item.id })}><span>{item.title}</span><i><Check size={15} /></i></button>)}</div>
      {!!error && <p role="alert" className="habit-error">{error}</p>}
    </div>}
    {contextMenu}
  </main>;
}
