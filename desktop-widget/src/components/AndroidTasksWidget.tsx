import { FocusRewardRow } from "../../../shared/FocusRewardRow";
import { getFirebaseFirestore } from "../lib/firebase";
import { DateRing } from "./DateRing";
import NumberFlow from "@number-flow/react";
import { dailyTaskWidgetModel } from "../../../mobile-tasks/src/domain/daily-task-widget";
import { formatMinutes, summarizeTasks } from "../../../mobile-tasks/src/domain/tasks";
import type { DailyTask } from "../lib/firebase";

export function AndroidTasksWidget({ uid, headerAction, tasks, today, selectedDate, dueOnly, rank, medals, points, onSelectDate, onFilterChange, onNew, onComplete, onReopen, onReschedule }: {
  uid?: string; headerAction?: React.ReactNode;
  tasks: DailyTask[]; today: string; selectedDate: string; dueOnly: boolean;
  rank: number | null; medals: string[]; points: Map<string, number>;
  onSelectDate: (date: string) => void; onFilterChange: (due: boolean) => void;
  onNew: () => void; onComplete: (task: DailyTask) => void; onReopen: (task: DailyTask) => void;
  onReschedule?: (task: DailyTask, position: { x: number; y: number }) => void;
}) {
  const model = dailyTaskWidgetModel(tasks, { date: selectedDate, dueOnly }, today);
  const date = new Date(model.selected + "T12:00:00");
  return <>
    <div className="android-task-heading">
      <h1 data-tauri-drag-region>{model.selected === today ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" })}, {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</h1>
      <div className="android-task-actions">{headerAction}{rank !== null && <span className="android-task-rank">{rank <= 3 && rank > 0 && <img src={medals[rank - 1]} alt="" />}#{rank}</span>}<button onClick={onNew} aria-label="Add task">+</button></div>
    </div>
    <div className="android-task-dates">{model.dates.map(day => {
      const value = new Date(day + "T12:00:00"), selected = day === model.selected;
      const percent = summarizeTasks(tasks.filter(task => task.date === day)).percent;
      return <button key={day} onClick={() => onSelectDate(day)} aria-label={day} aria-pressed={selected}>
        <small>{value.toLocaleDateString(undefined, { weekday: "short" })}</small>
        <DateRing percent={percent} selected={selected} day={value.getDate()} />
      </button>;
    })}</div>
    <div className="android-task-overview">
      <div><small>Filter</small><div className="android-task-filter"><span aria-hidden="true" className={`android-task-filter-highlight${dueOnly ? " on-due" : ""}`} />{[false, true].map(due => <button key={String(due)} aria-pressed={dueOnly === due} onClick={() => onFilterChange(due)}>{due ? `Due (${model.due.length})` : `All (${model.summary.total})`}</button>)}</div></div>
      <div className="android-task-meter"><small>Task Meter</small><strong><NumberFlow value={model.summary.percent} suffix="%" /></strong></div>
    </div>
    <div className="android-task-study">Study time&nbsp; {formatMinutes(model.summary.minutes)}</div>
    <FocusRewardRow uid={uid} date={model.selected} getDatabase={getFirebaseFirestore} />
    <section className="android-task-list" aria-label="Daily tasks">{model.visibleTasks.length ? model.visibleTasks.map(task => {
      const missed = !task.completed && model.selected < today, score = points.get(task.id) ?? 0;
      return <TaskWidgetRow key={task.id} task={task} missed={missed} score={score} readOnly={model.readOnly} onComplete={onComplete} onReopen={onReopen} onContextMenu={model.selected < today && onReschedule ? event => { event.preventDefault(); event.stopPropagation(); onReschedule(task, { x: event.clientX, y: event.clientY }); } : undefined} />;
    }) : <p className="android-task-empty">{dueOnly && model.summary.total ? "All tasks complete" : "No tasks planned"}</p>}</section>
  </>;
}


export function TaskWidgetRow({ task, missed, score, readOnly, onComplete, onReopen, onContextMenu }: {
  task: DailyTask; missed: boolean; score: number; readOnly: boolean;
  onComplete: (task: DailyTask) => void; onReopen: (task: DailyTask) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return <button className={`android-task-row ${task.completed ? "completed" : missed ? "missed" : ""}`} aria-disabled={readOnly} onContextMenu={onContextMenu} onClick={() => { if (!readOnly) { if (task.completed) onReopen(task); else onComplete(task); } }} aria-label={`${task.completed ? "Completed" : missed ? "Missed" : "Pending"}: ${task.name}`}>
        <svg className="android-task-check" viewBox="0 0 25 25" aria-hidden="true"><circle cx="12.5" cy="12.5" r="11.5" fill={task.completed ? "var(--accent)" : missed ? "#27191d" : "none"} stroke={task.completed ? "var(--accent)" : missed ? "#64363c" : "var(--accent)"} strokeWidth="1.3" />{task.completed ? <path d="m7 12.5 3.5 3.5 7.5-8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : missed ? <path d="m9 9 7 7m0-7-7 7" stroke="#f19a9f" strokeWidth="2" strokeLinecap="round" /> : null}</svg>
        <span className="android-task-copy"><b>{task.name}</b><small>{[task.subject, task.type, task.completed ? formatMinutes(task.minutesSpent ?? 0) : ""].filter(Boolean).join(" · ")}</small></span>
        {score !== 0 && <span className={`android-task-points ${score > 0 ? "positive" : "negative"}`}>{score > 0 ? "+" : "−"}{Math.abs(score)} pts</span>}
      </button>;
}
