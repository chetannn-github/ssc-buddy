import { useEffect, useId, useRef, useState } from "react";
import { TaskWidgetRow } from "./AndroidTasksWidget";
import NumberFlow from "@number-flow/react";
import { Check, ChevronLeft, ChevronRight, Clock3, Gauge, Pencil, Trash2, X } from "lucide-react";
import type { DailyTask } from "../lib/firebase";
import { dateKeyFromOffset, summarizeTasks } from "../../../mobile-tasks/src/domain/tasks";

export function TaskDateTitle({ date, today }: { date: string; today: string }) {
  const value = new Date(date + "T12:00:00");
  return <>{date === today ? "Today" : value.toLocaleDateString(undefined, { weekday: "short" })}<span className="date-title-muted">, <NumberFlow value={value.getDate()} suffix={" " + value.toLocaleDateString(undefined, { month: "short" })} /></span></>;
}
function DateRing({ percent, selected, day }: { percent: number; selected: boolean; day: number }) {
  const id = "date-ring-" + useId().replace(/:/g, "");
  const value = Math.max(selected ? 2 : 0, percent), length = 116.24;
  return <span className="date-ring"><svg viewBox="0 0 43 43" aria-hidden="true">
    <defs><mask id={id}><circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke="white" strokeWidth="3" strokeDasharray={length} strokeDashoffset={length * (1 - value / 100)} transform="rotate(-90 21.5 21.5)" /></mask></defs>
    <circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke={selected ? "#535353" : "#292929"} strokeWidth="3" />
    <g mask={`url(#${id})`}><circle cx="21.5" cy="21.5" r="18.5" fill="none" className="date-ring-value" strokeWidth="3" />
      {percent > 0 && <circle cx="21.5" cy="21.5" r="18.5" fill="none" stroke="white" strokeWidth="1.5" opacity=".4" strokeLinecap="round" strokeDasharray="8 108.24" className="date-ring-flow" />}
    </g>
  </svg><b>{day}</b></span>;
}
import { habitScheduled, habitDue, habitIntensity, type Habit } from "../../../mobile-tasks/src/domain/habits";

export function TaskDashboard({ minimal = false, habits = [], mode = "tasks", tasks, today, selectedDate, onSelectDate, dueOnly, onFilterChange, points, onNew, onComplete, onReopen, onEdit, onDelete }: {
  minimal?: boolean; habits?: Habit[]; mode?: "tasks" | "habits"; tasks: DailyTask[]; today: string; selectedDate: string; onSelectDate: (date: string) => void;
  dueOnly: boolean; onFilterChange: (value: boolean) => void; points: Map<string, number>;
  onNew: () => void; onComplete: (task: DailyTask) => void; onReopen: (task: DailyTask) => void;
  onEdit: (task: DailyTask) => void; onDelete: (task: DailyTask) => void;
}) {
  const tomorrow = dateKeyFromOffset(1, new Date(today + "T12:00:00"));
  const latest = mode === "tasks" && tasks.some((task) => task.date === tomorrow) ? tomorrow : today;
  const [weekEnd, setWeekEnd] = useState(latest);
  const previousLatest = useRef(latest);
  const [menu, setMenu] = useState<{ task: DailyTask; x: number; y: number } | null>(null);
  useEffect(() => { const previous = previousLatest.current; setWeekEnd((current) => current === previous || current > latest ? latest : current); previousLatest.current = latest; }, [latest]);
  useEffect(() => { setMenu(null); }, [selectedDate]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); setMenu(null); } };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [menu]);
  const daily = tasks.filter((task) => task.date === selectedDate), summary = summarizeTasks(daily);
  const due = daily.filter((task) => !task.completed), visible = dueOnly ? due : daily;
  const habitSummary = (day: string) => {
    const scheduled = habits.filter(h => habitScheduled(h, day));
    return { total: scheduled.length, due: scheduled.filter(h => habitDue(h, day)).length,
      percent: scheduled.length ? Math.round(scheduled.reduce((sum, h) => sum + habitIntensity(h, day), 0) / scheduled.length * 100) : 0 };
  };
  const habitDay = habitSummary(selectedDate);
  const total = mode === "habits" ? habitDay.total : daily.length;
  const dueCount = mode === "habits" ? habitDay.due : due.length;
  const percent = mode === "habits" ? habitDay.percent : summary.percent;
  const history = selectedDate < today;
  const dates = Array.from({ length: 7 }, (_, index) => dateKeyFromOffset(index - 6, new Date(weekEnd + "T12:00:00")));
  const move = (amount: number) => { const next = dateKeyFromOffset(amount, new Date(weekEnd + "T12:00:00")); setWeekEnd(next > latest ? latest : next); };
  const openMenu = (event: React.MouseEvent, task: DailyTask) => {
    event.preventDefault();
    if (history) return;
    setMenu({ task, x: Math.max(8, Math.min(window.innerWidth - 188, event.clientX)), y: Math.max(8, Math.min(window.innerHeight - (task.date === tomorrow ? 110 : 62), event.clientY)) });
  };
  const duration = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
  return <>
    {!minimal && <section className="task-calendar">
      <div className="date-week-nav"><button aria-label="Previous week" onClick={() => move(-7)}><ChevronLeft size={19} /></button>
        <div>{selectedDate !== today && <button className="return-today" onClick={() => { setWeekEnd(latest); onSelectDate(today); }}>Today</button>}
          <button aria-label="Next week" disabled={weekEnd >= latest} onClick={() => move(7)}><ChevronRight size={19} /></button></div>
      </div>
      <div className="task-date-strip">{dates.map((date) => {
        const progress = mode === "habits" ? habitSummary(date).percent : summarizeTasks(tasks.filter((task) => task.date === date)).percent;
        return <button key={date} aria-label={date} aria-pressed={date === selectedDate} className={date === selectedDate ? "selected" : ""} onClick={() => onSelectDate(date)}>
          <small>{new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}</small>
          <DateRing percent={progress} selected={date === selectedDate} day={new Date(date + "T12:00:00").getDate()} />
        </button>;
      })}</div>
      <div className="task-overview"><div><small>Filter</small><div className="task-filter"><span className={dueOnly ? "on-due" : ""} aria-hidden="true" />
        <button aria-pressed={!dueOnly} onClick={() => onFilterChange(false)}>All ({total})</button><button aria-pressed={dueOnly} onClick={() => onFilterChange(true)}>Due ({dueCount})</button></div></div>
        <div className="task-meter"><small>{mode === "habits" ? "Habit Score" : "Task Meter"}</small><strong><Gauge size={16} /><NumberFlow value={percent} suffix="%" /></strong></div>
      </div>
      <div className="task-study-time" style={mode === "habits" ? { visibility: "hidden" } : undefined}><Clock3 size={13} /><span>Study time</span><NumberFlow value={Math.floor(summary.minutes / 60)} suffix="h" /><NumberFlow value={summary.minutes % 60} suffix="m" /></div>
    </section>}
    {mode === "tasks" && <section className="task-list android-task-list main-shared-task-list" aria-label="Daily tasks">{visible.length ? visible.map(task => <TaskWidgetRow key={task.id} task={task} missed={history && !task.completed} score={minimal ? 0 : points.get(task.id) ?? 0} readOnly={history} onComplete={onComplete} onReopen={onReopen} onContextMenu={minimal ? undefined : event => openMenu(event, task)} />) : <p className="android-task-empty">{dueOnly && daily.length ? "All tasks complete" : "No tasks planned"}</p>}</section>}
    {menu && <div className="task-context-dismiss" onPointerDown={() => setMenu(null)}><div role="menu" className="task-context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
      <button role="menuitem" onClick={() => { onEdit(menu.task); setMenu(null); }}><Pencil size={17} />Edit Task</button>
      {menu.task.date === tomorrow && <button role="menuitem" className="danger" onClick={() => { onDelete(menu.task); setMenu(null); }}><Trash2 size={17} />Delete</button>}
    </div></div>}
  </>;
}
