import "../../src/components/layout/accent-top-glow.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import NumberFlow from "@number-flow/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CloudOff, Eye, EyeOff, Flame, LoaderCircle, MonitorUp, Plus, Sparkles, Trophy, X } from "lucide-react";
import type { User } from "firebase/auth";
import { TASK_TYPES, type DailyTask, type TaskType, type QuickRecallSeed, createAccount, firebaseConfigured, loadQuickRecallSeed, watchRecallBank, makeTaskId, observeAuth, recordQuickRecallAnswer, recordQuickRecallPractice, removeTask, saveTask, signIn, signInGoogle, todayKey, watchStreakActivity, watchTasks, watchWeeklyLeaderboard, watchProfileAccent, watchLeaderboardRank } from "./lib/firebase";
import { createQuickRecallSession, RANDOM_RECALL_SCOPE, type QuickRecallScope, type QuickRecallSession } from "./lib/quick-recall";
import { ALL_RECALL_EXERCISES, RECALL_QUESTION_COUNTS, type RecallQuestionCount } from "../../mobile-tasks/src/domain/recall-selection";
import { ALL_LEADERBOARD_DAYS, leaderboardPeriodStats, leaderboardPeriodTasks } from "../../mobile-tasks/src/domain/leaderboard-period";
import { pinDesktopRecall, pinDesktopTasks, removeDesktopHabit } from "./lib/desktop-habit-widgets";
import { PinnedStudyWindow } from "./components/PinnedStudyWindow";
import { PinnedHabitWindow } from "./components/PinnedHabitWindow";
import { HabitDashboard } from "./components/HabitDashboard";
import { useHabits } from "./lib/habits";
import { BrowserStudyLock } from "./components/BrowserStudyLock";
import { AndroidTasksWidget } from "./components/AndroidTasksWidget";
import { TaskDashboard, TaskDateTitle } from "./components/TaskDashboard";
import { normalizeAppAccent, accentInk } from "../../mobile-tasks/src/domain/app-accent";
import { QuickRecallPanel } from "./components/QuickRecallPanel";

// Daily-task remove controls use the same minimal close mark as web and mobile.
const Trash2 = X;
import authImage from "./assets/auth.jpg";
import googleImage from "./assets/google.png";
import goldMedal from "../../public/gold-medal.png";
import silverMedal from "../../public/silver-medal.png";
import bronzeMedal from "../../public/bronze-medal.png";
import "./styles.css";

const avatarModules = import.meta.glob("../../public/avatars/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const avatarSource = (avatar: unknown) => {
  const filename = typeof avatar === "string" ? avatar : "";
  return Object.entries(avatarModules).find(([path]) => path.endsWith(`/${filename}`))?.[1] ?? "";
};
const medalImages = [goldMedal, silverMedal, bronzeMedal];
function RankMark({ rank }: { rank: number }) { return rank <= 3 ? <img className="leaderboard-medal" src={medalImages[rank - 1]} alt={`Rank ${rank}`} /> : <span className="leaderboard-trophy"><Trophy size={13} /> #{rank}</span>; }

type Draft = Pick<DailyTask, "name" | "subject" | "type" | "date">;
type SavedQuickRecall = { session: QuickRecallSession; open: boolean };
const QUICK_RECALL_SESSION_KEY = "ssc-buddy-desktop-quick-recall-session";
const blankDraft = (subject = "Other"): Draft => ({ name: "", subject, type: "Lecture", date: todayKey() });
const tomorrowKey = () => { const date = new Date(); date.setDate(date.getDate() + 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const weeklyTaskPoints = (tasks: DailyTask[]) => {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const week = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let creditedMinutes = 0;
  return new Map(tasks.filter((task) => task.date >= week && task.date <= endKey).map((task) => {
    if (!task.completed) return [task.id, task.date < today ? -5 : 0] as const;
    const before = Math.min(210, Math.floor(creditedMinutes / 10));
    creditedMinutes += Math.max(0, task.minutesSpent ?? 0);
    return [task.id, 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before] as const;
  }));
};
const intentionalActionDelay = () => new Promise<void>((resolve) => window.setTimeout(resolve, 420));
const loadSavedQuickRecall = (): SavedQuickRecall | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_RECALL_SESSION_KEY) ?? "null") as SavedQuickRecall | null;
    return saved?.open && Array.isArray(saved.session?.questions) && saved.session.questions.length ? saved : null;
  } catch { return null; }
};

function WidgetNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  return <NumberFlow value={value} prefix={prefix} suffix={suffix} willChange />;
}
function WidgetDuration({ minutes }: { minutes: number }) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return <>{hours > 0 && <WidgetNumber key="hours" value={hours} suffix="h" />}{(hours === 0 || remainder > 0) && <WidgetNumber key="minutes" value={remainder} suffix="m" />}</>;
}

function App() {
  const pinnedRecall = window.__SSC_HABIT_WIDGET__?.style === "recall";
  const pinnedTasks = window.__SSC_HABIT_WIDGET__?.style === "tasks";
  const pinnedDesktop = pinnedRecall || pinnedTasks;
  const progressKey = pinnedRecall ? `ssc-buddy-desktop-quick-recall-progress:pinned:${window.__SSC_HABIT_WIDGET__?.uid}` : "ssc-buddy-desktop-quick-recall-progress";
  const savedQuickRecall = pinnedDesktop ? null : loadSavedQuickRecall();
  const [recallMenu, setRecallMenu] = useState<{ x: number; y: number } | null>(null);
  const [pinError, setPinError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [widgetRank, setWidgetRank] = useState<number | null>(null);
  const habitApi = useHabits(user?.uid);
  const [section, setSection] = useState<"tasks" | "habits">("tasks");
  const [activityDates, setActivityDates] = useState<string[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<DailyTask | null | "new">(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [dueOnly, setDueOnly] = useState(false);
  const [accent, setAccent] = useState(() => normalizeAppAccent(undefined));
  const [recallCount, setRecallCount] = useState<RecallQuestionCount>(3);
  const [calendarDay, setCalendarDay] = useState(todayKey());
  useEffect(() => {
    setWidgetRank(null);
    if (user && pinnedTasks) return watchLeaderboardRank(user, setWidgetRank);
  }, [user?.uid, pinnedTasks, calendarDay]);

  const [complete, setComplete] = useState<DailyTask | null>(null);
  const [minutes, setMinutes] = useState("30");
  const [deletingTask, setDeletingTask] = useState<DailyTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [quickRecallOpen, setQuickRecallOpen] = useState(() => pinnedRecall || Boolean(savedQuickRecall));
  const [quickRecallLoading, setQuickRecallLoading] = useState(false);
  const [quickRecallSession, setQuickRecallSession] = useState<QuickRecallSession | null>(() => savedQuickRecall?.session ?? null);
  const [quickRecallSeed, setQuickRecallSeed] = useState<QuickRecallSeed | null>(null);
  const [quickRecallScope, setQuickRecallScope] = useState<QuickRecallScope>({ subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE, exerciseId: ALL_RECALL_EXERCISES });

  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Escape" && !(event.altKey && event.key === "ArrowLeft"))) return;
      if (busy || deleting) return;
      if (editor) setEditor(null);
      else if (complete) setComplete(null);
      else if (deletingTask) setDeletingTask(null);
      else if (quickRecallSession) { localStorage.removeItem(progressKey); setQuickRecallSession(null); }
      else if (quickRecallOpen && !pinnedRecall) setQuickRecallOpen(false);
      else if (leaderboardOpen) setLeaderboardOpen(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", back);
    return () => window.removeEventListener("keydown", back);
  }, [busy, deleting, editor, complete, deletingTask, quickRecallSession, quickRecallOpen, leaderboardOpen]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return observeAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);
  useEffect(() => {
    if (!user) { setTasks([]); return; }
    return watchTasks(user, (next) => setTasks(next));
  }, [user?.uid]);
  useEffect(() => {
    if (!user) { setActivityDates([]); return; }
    return watchStreakActivity(user, setActivityDates);
  }, [user?.uid]);
  useEffect(() => {
    if (!user || !leaderboardOpen) return;
    return watchWeeklyLeaderboard(setLeaderboardRows);
  }, [leaderboardOpen, user?.uid]);

  const today = calendarDay;
  const previousToday = useRef(today);
  useEffect(() => {
    const previous = previousToday.current;
    setSelectedDate((value) => value === previous ? today : value);
    previousToday.current = today;
  }, [today]);
  useEffect(() => {
    const refresh = () => setCalendarDay(todayKey());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!user) { setAccent(normalizeAppAccent(undefined)); setSelectedDate(todayKey()); setDueOnly(false); setSection("tasks"); return; }
    setSelectedDate(todayKey()); setDueOnly(false);
    return watchProfileAccent(user, (value) => setAccent(normalizeAppAccent(value)));
  }, [user?.uid]);
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--accent", accent); style.setProperty("--accent-ink", accentInk(accent));
    style.setProperty("--accent-soft", accent + "14"); style.setProperty("--accent-border", accent + "66");
  }, [accent]);
  useEffect(() => {
    if (!user || !quickRecallOpen) return;
    let active = true;
    void loadQuickRecallSeed(user).then((seed) => { if (active) setQuickRecallSeed(seed); }).catch(() => undefined);
    const stop = watchRecallBank(user, (subjects) => setQuickRecallSeed((current) => current ? { ...current, subjects } : current));
    return () => { active = false; stop(); };
  }, [user?.uid, quickRecallOpen]);
  const tomorrow = tomorrowKey();
  const taskDay = selectedDate === tomorrow ? "tomorrow" : "today";
  const taskPoints = useMemo(() => weeklyTaskPoints(tasks), [tasks, today]);
  const streakValue = useMemo(() => {
    const toKey = (value: string | Date) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
    // Consistency is shared across practice, tracker and completed daily tasks.
    const completedTaskDates = tasks.filter((task) => task.completed).map((task) => task.completedAt ?? task.date);
    const activeDays = new Set([...activityDates, ...completedTaskDates].map(toKey));
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!activeDays.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (activeDays.has(toKey(cursor))) { days += 1; cursor.setDate(cursor.getDate() - 1); }
    return days;
  }, [activityDates, tasks]);
  const streak = streakValue;

  useEffect(() => {
    if (pinnedRecall) return;
    if (quickRecallOpen && quickRecallSession) localStorage.setItem(QUICK_RECALL_SESSION_KEY, JSON.stringify({ open: true, session: quickRecallSession }));
    else localStorage.removeItem(QUICK_RECALL_SESSION_KEY);
  }, [quickRecallOpen, quickRecallSession]);

  const taskSubjects = [...new Set(tasks.map((task) => task.subject).filter(Boolean))];
  if (!taskSubjects.length) taskSubjects.push("Other");
  const openNew = () => { setDraft(blankDraft(taskSubjects[0])); setSchedule(selectedDate < today ? "today" : taskDay); setEditor("new"); };
  const openEdit = (task: DailyTask) => { setDraft({ name: task.name, subject: taskSubjects.includes(task.subject) ? task.subject : taskSubjects[0], type: task.type, date: task.date }); setEditor(task); };
  const submitTask = async () => {
    if (!user || !draft.name.trim()) return;
    setBusy(true);
    const previous = editor && editor !== "new" ? editor : null;
    await saveTask(user, {
      id: previous?.id ?? makeTaskId(), createdAt: previous?.createdAt ?? new Date().toISOString(),
      completed: previous?.completed ?? false, completedAt: previous?.completedAt ?? null, minutesSpent: previous?.minutesSpent ?? null,
      ...draft, date: editor === "new" ? (schedule === "tomorrow" ? tomorrowKey() : todayKey()) : draft.date, name: draft.name.trim(), subject: draft.subject.trim() || "Other",
    });
    setBusy(false); setEditor(null);
  };
  const completeTask = async () => {
    if (!user || !complete) return;
    setBusy(true);
    await saveTask(user, { ...complete, completed: true, completedAt: new Date().toISOString(), minutesSpent: Math.min(180, Math.max(0, Number(minutes) || 0)) });
    setBusy(false); setComplete(null);
  };
  const reopen = async (task: DailyTask) => { if (user) await saveTask(user, { ...task, completed: false, completedAt: null, minutesSpent: null }); };
  const confirmDelete = async () => {
    if (!user || !deletingTask) return;
    if (deletingTask.date !== tomorrowKey()) { setDeletingTask(null); return; }
    setDeleting(true);
    try { await Promise.all([removeTask(user, deletingTask.id), intentionalActionDelay()]); }
    finally { setDeleting(false); setDeletingTask(null); }
  };
  const openQuickRecall = async () => {
    if (!user) return;
    setQuickRecallOpen(true); setQuickRecallLoading(true);
    try { setQuickRecallSeed(await loadQuickRecallSeed(user)); setQuickRecallSession(null); }
    catch { setQuickRecallSession(null); }
    finally { setQuickRecallLoading(false); }
  };

  if (!firebaseConfigured) return <main className="auth"><section className="auth-card"><CloudOff /><h1>Firebase setup required</h1><p>Add the same Firebase web values used by SSC Buddy to <code>desktop-widget/.env</code>, then restart the desktop app.</p></section></main>;
  if (!authReady) return <WidgetSplash />;
  if (!user) return <AuthPanel />;
  if (pinnedDesktop && user.uid !== window.__SSC_HABIT_WIDGET__?.uid) return <main className="widget"><p>Sign in to the original account in the main window.</p><button onClick={() => void removeDesktopHabit()}>Remove widget</button></main>;

  return <main onContextMenu={pinnedTasks ? event => { event.preventDefault(); setRecallMenu({ x: Math.max(6, Math.min(innerWidth - 180, event.clientX)), y: Math.max(6, Math.min(innerHeight - 60, event.clientY)) }); } : pinnedRecall ? event => event.preventDefault() : undefined} className={`widget ${pinnedRecall ? "recall-desktop-card" : pinnedTasks ? "tasks-desktop-card" : ""} ${leaderboardOpen ? "leaderboard-open" : ""} ${quickRecallOpen && quickRecallSession ? "recall-question-open" : ""}`}>
    <div aria-hidden="true" className="accent-top-glow" />
    {pinnedRecall && <div className="recall-widget-drag" data-tauri-drag-region onContextMenu={event => { event.preventDefault(); setRecallMenu({ x: Math.max(6, Math.min(innerWidth - 180, event.clientX)), y: Math.max(6, Math.min(innerHeight - 60, event.clientY)) }); }}><span>{pinnedTasks ? <Check size={14} /> : <Sparkles size={14} />}{pinnedTasks ? "Daily Tasks" : "Quick Recall"}</span></div>}
    {!!pinError && <p role="alert" className="habit-error">{pinError}</p>}
    {recallMenu && <div className="task-context-dismiss" onPointerDown={() => setRecallMenu(null)}><div role="menu" className="task-context-menu" style={{ left: recallMenu.x, top: recallMenu.y }} onPointerDown={event => event.stopPropagation()}><button role="menuitem" onClick={() => { setRecallMenu(null); void (pinnedDesktop ? removeDesktopHabit() : pinDesktopRecall(user.uid)).catch(error => setPinError(String(error))); }}>{pinnedDesktop ? "Remove widget" : "Add desktop widget"}</button></div></div>}
    <header hidden={quickRecallOpen || pinnedTasks}><div className={`window-drag ${leaderboardOpen ? "leaderboard-title" : ""}`}><div className="header-title-row">{leaderboardOpen && <button className="leaderboard-header-back" aria-label="Back to tasks" onClick={() => setLeaderboardOpen(false)}><ArrowLeft size={17} /></button>}<h1>{leaderboardOpen ? "Weekly leaderboard" : quickRecallOpen ? "Quick Recall" : <TaskDateTitle date={selectedDate} today={today} />}</h1></div></div>{!leaderboardOpen && (quickRecallOpen ? <button className="quick-recall-trigger" onClick={() => { setQuickRecallOpen(false); setQuickRecallSession(null); }}><ArrowLeft size={16} /><span>Tasks</span></button> : <div className="header-actions"><BrowserStudyLock key={user.uid} uid={user.uid} /><div className={`streak-pill ${streak > 0 ? "active" : ""}`}><Flame size={16} fill="currentColor" /><span><WidgetNumber value={streak} /></span></div><button className="quick-recall-trigger" aria-label="Quick Recall" title="Quick Recall · right-click to add desktop widget" onContextMenu={event => { event.preventDefault(); setRecallMenu({ x: Math.max(6, Math.min(innerWidth - 180, event.clientX)), y: Math.max(6, Math.min(innerHeight - 60, event.clientY)) }); }} onClick={() => void openQuickRecall()}><Sparkles size={16} /><span>Recall</span></button>{section === "tasks" && <button className="icon-button" aria-label="Add task" onClick={openNew}><Plus size={18} /></button>}</div>)}</header>
    {pinnedTasks ? <AndroidTasksWidget headerAction={<BrowserStudyLock key={user.uid} uid={user.uid} />} tasks={tasks} today={today} selectedDate={selectedDate} dueOnly={dueOnly} rank={widgetRank} medals={medalImages} points={taskPoints} onSelectDate={setSelectedDate} onFilterChange={setDueOnly} onNew={openNew} onComplete={task => { setMinutes(String(Math.min(180, task.minutesSpent ?? 30))); setComplete(task); }} onReopen={task => void reopen(task)} /> : leaderboardOpen ? <LeaderboardPanel rows={leaderboardRows} currentUserId={user.uid} /> : quickRecallOpen ? quickRecallSession ? <QuickRecallPanel subjects={quickRecallSeed?.subjects as any} onPruned={(questions) => setQuickRecallSession((current) => current ? { ...current, questions } : current)} session={quickRecallSession} loading={quickRecallLoading} onAnswered={(question, choice, index, correct) => { if (user) { void recordQuickRecallAnswer(user, question, correct).catch(() => undefined); void recordQuickRecallPractice(user, { runId: `${quickRecallSession?.runId ?? "quick-recall"}:${index}`, date: todayKey(), startedAt: quickRecallSession?.startedAt ?? new Date().toISOString(), questions: [question], answers: [choice] }).catch(() => undefined); } }} onBack={() => { localStorage.removeItem(progressKey); setQuickRecallSession(null); }} onRestart={() => { setQuickRecallSession(null); }} /> : <QuickRecallSetup widget={pinnedRecall} questionCount={recallCount} onQuestionCountChange={setRecallCount} seed={quickRecallSeed} loading={quickRecallLoading} scope={quickRecallScope} onScopeChange={setQuickRecallScope} onBack={() => { if (!pinnedRecall) setQuickRecallOpen(false); }} onStart={() => quickRecallSeed && setQuickRecallSession(createQuickRecallSession(quickRecallSeed, quickRecallScope, recallCount))} /> : <><div className="workspace-section-row">{!pinnedTasks && <div className="workspace-section-toggle" data-section={section} role="group" aria-label="Tasks or habits">{(["tasks", "habits"] as const).map(item => <button key={item} aria-pressed={section === item} onClick={() => { setSection(item); if (item === "habits" && selectedDate > today) setSelectedDate(today); }}>{item === "tasks" ? "Tasks" : "Habits"}</button>)}</div>}{!pinnedDesktop && section === "tasks" && <button className="tasks-pin-option" aria-label="Add Tasks widget" title="Add Tasks widget" onClick={() => { void pinDesktopTasks(user.uid).catch(error => setPinError(String(error))); }}><MonitorUp size={17} /></button>}</div><TaskDashboard minimal={pinnedTasks} mode={section} habits={habitApi.habits} tasks={tasks} today={today} selectedDate={pinnedTasks ? today : selectedDate} onSelectDate={setSelectedDate}
      dueOnly={pinnedTasks ? false : dueOnly} onFilterChange={setDueOnly} points={taskPoints} onNew={openNew}
      onComplete={(task) => { setMinutes(String(Math.min(180, task.minutesSpent ?? 30))); setComplete(task); }}
      onReopen={(task) => void reopen(task)} onEdit={openEdit} onDelete={setDeletingTask} />{section === "habits" && <HabitDashboard uid={user.uid} api={habitApi} selected={selectedDate} today={today} dueOnly={dueOnly} />}</>}

    {editor && <TaskEditor draft={draft} setDraft={setDraft} subjects={taskSubjects} schedule={schedule} setSchedule={setSchedule} busy={busy} editing={editor !== "new"} onClose={() => setEditor(null)} onSave={() => void submitTask()} />}
    {complete && <CompleteDialog task={complete} minutes={minutes} setMinutes={setMinutes} busy={busy} onClose={() => setComplete(null)} onSave={() => void completeTask()} />}
    {deletingTask && <DeleteTaskDialog task={deletingTask} busy={deleting} onClose={() => setDeletingTask(null)} onConfirm={() => void confirmDelete()} />}
  </main>;
}

function LeaderboardPanel({ rows, currentUserId }: { rows: Record<string, unknown>[]; currentUserId: string }) {
  const [selectedEntry, setSelected] = useState<Record<string, unknown> | null>(null);
  const selected = rows.find((row) => row.uid === selectedEntry?.uid) ?? selectedEntry;
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const position = selected ? rows.findIndex((row) => row.uid === selected.uid) + 1 : 0;
  const displayName = (row: Record<string, unknown>) => String(row.uid ?? "") === currentUserId ? "You" : String(row.name ?? "Student");
  if (selected) {
    const tasks = (Array.isArray(selected.leaderboardTasks) ? selected.leaderboardTasks as Record<string, unknown>[] : []).map((task) => ({ ...task, name: String(task.name ?? "Task"), subject: String(task.subject ?? "Other"), type: String(task.type ?? "Other"), date: String(task.date ?? ""), completed: Boolean(task.completed), points: Number(task.points) || 0, minutesSpent: Number(task.minutesSpent) || 0 }));
    const inactiveDates = Array.isArray(selected.inactiveDates) ? selected.inactiveDates.map(String) : [];
    const dates = [ALL_LEADERBOARD_DAYS, ...[...new Set([todayKey(), ...inactiveDates, ...tasks.map((task) => task.date).filter(Boolean)])].sort().reverse()];
    const activeDate = dates.includes(selectedDate) ? selectedDate : todayKey();
    const stats = leaderboardPeriodStats({ points: Number(selected.points) || 0, completed: Number(selected.completed) || 0, studyMinutes: Number(selected.studyMinutes) || 0, inactiveDates }, tasks, activeDate);
    const visibleTasks = leaderboardPeriodTasks(tasks, inactiveDates, activeDate);
    return <section className="leaderboard-panel leaderboard-detail">
      <div className="leaderboard-detail-head"><span className="leaderboard-avatar">{avatarSource(selected.avatar) ? <img src={avatarSource(selected.avatar)} alt="" /> : displayName(selected).slice(0, 1).toUpperCase()}</span><b>{displayName(selected)}</b><span className="leaderboard-detail-rank"><RankMark rank={position} /> #{position}</span><div className="leaderboard-summary"><div><strong className={stats.points > 0 ? "positive" : stats.points < 0 ? "negative" : "neutral"}><WidgetNumber value={stats.points} prefix={stats.points > 0 ? "+" : ""} /></strong><small>Points</small></div><div><strong><WidgetNumber value={stats.completed} /></strong><small>Completed</small></div><div><strong><WidgetNumber value={stats.notCompleted} /></strong><small>Not completed</small></div><div><strong><WidgetDuration minutes={stats.studyMinutes} /></strong><small>Study time</small></div></div></div>
      {dates.length > 0 && <div className="leaderboard-day-filter"><SelectMenu value={activeDate} options={dates} onChange={setSelectedDate} optionLabel={(date) => date === ALL_LEADERBOARD_DAYS ? "This week" : date === todayKey() ? "Today" : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })} /></div>}
<div className="leaderboard-task-list">{visibleTasks.length ? visibleTasks.map((task, index) => <article className={`leaderboard-task ${task.completed ? "done" : "pending"} ${String(task.date ?? "") === todayKey() ? "current" : ""}`} key={`${String(task.name)}-${index}`}><span>{task.completed ? <Check size={14} /> : <X size={14} />}</span><div><b>{String(task.name ?? "Task")}</b><small>{String(task.subject ?? "Other")} · {String(task.type ?? "Other")}{Number(task.minutesSpent) > 0 ? ` · ${formatMinutes(Number(task.minutesSpent))}` : ""}</small></div><em className={Number(task.points) > 0 ? "positive" : Number(task.points) < 0 ? "negative" : "neutral"}><WidgetNumber value={Number(task.points) || 0} prefix={Number(task.points) > 0 ? "+" : ""} /></em></article>) : <div className="leaderboard-empty"><span>{activeDate === ALL_LEADERBOARD_DAYS ? "No tasks this week." : "No tasks for this day."}</span></div>}</div>
    </section>;
  }
  return <section className="leaderboard-panel">{rows.length ? <div className="leaderboard-list">{rows.map((row, index) => { const rank = index + 1; const isYou = String(row.uid ?? "") === currentUserId; const name = displayName(row); const avatar = avatarSource(row.avatar); const completed = Math.max(0, Number(row.completed) || 0); const minutes = Math.max(0, Number(row.studyMinutes) || 0); const points = Number(row.points) || 0; return <button className={`leaderboard-row ${isYou ? "you" : ""}`} key={String(row.uid ?? index)} onClick={() => { setSelectedDate(todayKey()); setSelected(row); }}><span className={`leaderboard-rank top-${rank}`}><RankMark rank={rank} /></span><span className="leaderboard-avatar">{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1).toUpperCase()}</span><span className="leaderboard-copy"><b>{name}</b><small><WidgetNumber value={completed} /> completed · <WidgetDuration minutes={minutes} /> study</small></span><strong className={`leaderboard-points ${points > 0 ? "positive" : points < 0 ? "negative" : "neutral"}`}><WidgetNumber value={points} prefix={points > 0 ? "+" : ""} suffix=" pts" /></strong></button>; })}</div> : <div className="leaderboard-empty"><Trophy size={20} /><span>Leaderboard is loading…</span></div>}</section>;
}

function QuickRecallSetup({ widget = false, questionCount, onQuestionCountChange, seed, loading, scope, onScopeChange, onStart, onBack }: { widget?: boolean; questionCount: RecallQuestionCount; onQuestionCountChange: (count: RecallQuestionCount) => void; seed: QuickRecallSeed | null; loading: boolean; scope: QuickRecallScope; onScopeChange: (scope: QuickRecallScope) => void; onStart: () => void; onBack: () => void }) {
  const hasRecallQuestions = (chapter: any) => Array.isArray(chapter?.exercises) && chapter.exercises.some((exercise: any) => Array.isArray(exercise?.questions) && exercise.questions.some((question: any) => question?.id && question?.question && Array.isArray(question?.options) && question.options.length === 4 && ["A", "B", "C", "D"].includes(question?.correctAnswer)));
  const subjects = (seed?.subjects ?? []).map((item: any) => ({ id: String(item?.id ?? item?.name ?? ""), name: String(item?.name ?? "Subject"), chapters: (Array.isArray(item?.chapters) ? item.chapters : []).filter(hasRecallQuestions) })).filter((item) => item.id && item.chapters.length);
  if (!loading && seed && !subjects.length) return <section className="quick-recall-panel quick-state"><Sparkles size={22} /><strong>No question-based exercise yet</strong>{widget ? <span>Add exercises in the app or web to get started.</span> : <button className="secondary" onClick={onBack}>Back to tasks</button>}</section>;
  const selected = subjects.find((item) => item.id === scope.subjectId);
  const chapters: string[] = selected?.chapters.map((item: any) => String(item?.name ?? "")).filter(Boolean) ?? [];
  const selectedChapter = selected?.chapters.find((item: any) => item.name === scope.chapter);
  const exercises: Array<{ id: string; name: string }> = (selectedChapter?.exercises ?? [])
    .filter((exercise: any) => hasRecallQuestions({ exercises: [exercise] }))
    .map((exercise: any) => ({ id: String(exercise.id ?? exercise.name ?? "Exercise 1"), name: String(exercise.name ?? "Exercise 1") }));
  return <section className="quick-recall-panel quick-setup">{!widget && <div className="quick-setup-heading"><button className="quick-back-box" aria-label="Back to tasks" onClick={onBack}><ArrowLeft size={19} /></button><div><small>QUICK RECALL</small><h2>Choose your focus</h2></div></div>}<label>Subject<SelectMenu value={scope.subjectId === RANDOM_RECALL_SCOPE ? "Random" : (selected?.name ?? "Random")} options={["Random", ...subjects.map((item) => item.name)]} onChange={(name) => { const subject = subjects.find((item) => item.name === name); onScopeChange({ subjectId: subject?.id ?? RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE, exerciseId: ALL_RECALL_EXERCISES }); }} /></label><label>Chapter{selected ? <SelectMenu value={scope.chapter === RANDOM_RECALL_SCOPE ? "Random" : scope.chapter} options={["Random", ...chapters]} onChange={(chapter) => onScopeChange({ ...scope, chapter: chapter === "Random" ? RANDOM_RECALL_SCOPE : chapter, exerciseId: ALL_RECALL_EXERCISES })} /> : <div className="quick-setup-disabled">Random</div>}</label><label>Exercise{selectedChapter ? <SelectMenu value={exercises.find((item) => item.id === scope.exerciseId)?.name ?? "All exercises"} options={["All exercises", ...exercises.map((item) => item.name)]} onChange={(name) => onScopeChange({ ...scope, exerciseId: exercises.find((item) => item.name === name)?.id ?? ALL_RECALL_EXERCISES })} /> : <div className="quick-setup-disabled">All exercises</div>}</label><label>Questions<div className="recall-count-options">{RECALL_QUESTION_COUNTS.map((count) => <button key={count} aria-pressed={questionCount === count} onClick={() => onQuestionCountChange(count)}>{count}</button>)}</div></label><button className="primary" disabled={loading || !seed} onClick={onStart}>{loading ? <LoaderCircle className="spin" /> : <>Start recall <ArrowRight size={14} /></>}</button></section>;
}

function WidgetSplash() {
  return <main className="widget-splash" style={{ backgroundImage: `linear-gradient(135deg, rgba(12,12,12,.76), rgba(12,12,12,.9)), url(${authImage})` }}><div className="splash-copy"><span>SSC BUDDY</span><strong>Loading your workspace</strong></div><LoaderCircle className="spin splash-loader" size={16} /></main>;
}

function AuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true); setMessage("");
    try { mode === "signin" ? await signIn(email, password) : await createAccount(email, password); }
    catch (error) { setMessage(authMessage(error)); }
    finally { setBusy(false); }
  };
  return <main className="desktop-auth">
    <section className="auth-visual" style={{ backgroundImage: `linear-gradient(90deg, rgba(12,12,12,.55), rgba(12,12,12,.88)), url(${authImage})` }}><div className="auth-visual-brand"><img src={authImage} /><span>SSC Buddy</span></div><div><span className="auth-kicker">YOUR PREPARATION, IN SYNC</span><h1>Study anywhere.<br />Pick up exactly where you left off.</h1><p>Your practice, tracker, favourites and tasks stay private to your account.</p></div><small>Built for focused SSC preparation.</small></section>
    <section className="auth-form"><div className="auth-mobile-brand"><img src={authImage} /><span>SSC Buddy</span></div><span className="auth-kicker">YOUR PRIVATE WORKSPACE</span><h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1><p>{mode === "signin" ? "Sign in to continue your preparation." : "Create a private workspace with your email and password."}</p><div className="auth-inputs"><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" autoComplete="email" /><div className="password-wrap"><input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type={showPassword ? "text" : "password"} autoComplete="current-password" onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{message && <span className="auth-error">{message}</span>}<button className="auth-primary" disabled={busy || !email.trim() || !password} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" /> : mode === "signin" ? "Sign in" : "Create account"}</button></div><div className="auth-divider"><i />OR<i /></div><button className="auth-google" disabled={busy} onClick={() => { setBusy(true); setMessage(""); void signInGoogle().catch((error) => setMessage(authMessage(error))).finally(() => setBusy(false)); }}><img src={googleImage} />Continue with Google</button><button className="auth-switch" disabled={busy} onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button></section>
  </main>;
}
function authMessage(error: unknown) { const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""; return ({ "auth/invalid-credential": "Email or password is incorrect.", "auth/email-already-in-use": "An account already exists. Please sign in.", "auth/weak-password": "Password should be at least 6 characters.", "auth/invalid-email": "Enter a valid email address.", "auth/network-request-failed": "Network issue. Check your connection." } as Record<string, string>)[code] ?? "Could not continue. Please try again."; }

function TaskEditor({ draft, setDraft, subjects, schedule, setSchedule, busy, editing, onClose, onSave }: { draft: Draft; setDraft: (draft: Draft) => void; subjects: string[]; schedule: "today" | "tomorrow"; setSchedule: (value: "today" | "tomorrow") => void; busy: boolean; editing: boolean; onClose: () => void; onSave: () => void }) {
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const chooseSubject = (subject: string) => {
    if (subject !== "__custom__") { setDraft({ ...draft, subject }); return; }
    setCustomSubject(""); setSubjectDialogOpen(true);
  };
  const addSubject = () => {
    const value = customSubject.trim();
    if (!value) return;
    setDraft({ ...draft, subject: value });
    setSubjectDialogOpen(false);
  };
  return <><div className="modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`dialog task-dialog ${editing ? "editing" : ""}`}><button className="close" onClick={onClose}><X size={18} /></button><h2>{editing ? "Edit Task" : "Add Task"}</h2><label>Task name<input autoFocus value={draft.name} autoCapitalize="characters" onChange={(event) => setDraft({ ...draft, name: event.target.value.toUpperCase() })} onKeyDown={(event) => event.key === "Enter" && onSave()} placeholder="Lecture 5 of Polity" /></label><div className="form-grid"><label>Subject<SelectMenu value={draft.subject} options={[...new Set([...subjects, draft.subject]), "__custom__"]} onChange={chooseSubject} /></label><label>Task type<SelectMenu value={draft.type} options={["Practice Session", "Lecture", ...TASK_TYPES.filter((type) => type !== "Practice Session" && type !== "Lecture")]} onChange={(type) => setDraft({ ...draft, type: type as TaskType })} /></label></div>{!editing && <div className="schedule"><span>Schedule for</span><div><button type="button" className={schedule === "today" ? "active" : ""} onClick={() => setSchedule("today")}>Today</button><button type="button" className={schedule === "tomorrow" ? "active" : ""} onClick={() => setSchedule("tomorrow")}>Tomorrow</button></div></div>}<div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.name.trim()} onClick={onSave}>{busy ? <LoaderCircle className="spin" /> : editing ? "Save changes" : "Add task"}</button></div></div></div>{subjectDialogOpen && <div className="modal subject-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubjectDialogOpen(false); }}><div className="dialog subject-dialog"><button className="close" onClick={() => setSubjectDialogOpen(false)}><X size={17} /></button><span className="dialog-kicker">TASK SUBJECT</span><h2>Add subject</h2><p className="muted">Create a subject for your daily tasks.</p><label>Subject name<input autoFocus value={customSubject} placeholder="e.g. Polity" autoCapitalize="characters" onChange={(event) => setCustomSubject(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === "Enter" && addSubject()} /></label><div className="dialog-actions"><button className="secondary" onClick={() => setSubjectDialogOpen(false)}>Cancel</button><button className="primary" disabled={!customSubject.trim()} onClick={addSubject}>Add subject</button></div></div></div>}</>;
}
function SelectMenu({ value, options, onChange, optionLabel = (option: string) => option }: { value: string; options: string[]; onChange: (value: string) => void; optionLabel?: (option: string) => string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); event.preventDefault(); setOpen(false); } };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [open]);
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  return <div className="select-menu" ref={root}><button type="button" className="select-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span>{optionLabel(value)}</span><ChevronDown size={15} className={open ? "chevron open" : "chevron"} /></button>{open && <div className="select-popover">{options.map((option) => <button type="button" key={option} className={option === value ? "selected" : ""} onClick={() => { onChange(option); setOpen(false); }}><span>{option === "__custom__" ? "+ Add subject" : optionLabel(option)}</span>{option === value && <Check size={14} strokeWidth={2.5} />}</button>)}</div>}</div>;
}
function CompleteDialog({ task, minutes, setMinutes, busy, onClose, onSave }: { task: DailyTask; minutes: string; setMinutes: (value: string) => void; busy: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog complete-dialog"><button className="close" onClick={onClose}><X size={18} /></button><h2>Complete task</h2><p className="muted complete-name">{task.name}</p><label>Actual study minutes<input autoFocus inputMode="numeric" value={minutes} onChange={(event) => { const digits = event.target.value.replace(/\D/g, ""); setMinutes(digits ? String(Math.min(180, Number(digits))) : ""); }} placeholder="30" /></label><div className="chips">{[30, 45, 60, 90, 120].map((value) => <button type="button" className={Number(minutes) === value ? "chip active" : "chip"} key={value} onClick={() => setMinutes(String(value))}>{formatMinutes(value)}</button>)}</div><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={onSave}>{busy ? <LoaderCircle className="spin" /> : "Mark complete"}</button></div></div></div>;
}
function DeleteTaskDialog({ task, busy, onClose, onConfirm }: { task: DailyTask; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal destructive-modal" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}><div role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title" aria-label={`Delete ${task.name}`} className="dialog delete-dialog"><h2 id="delete-task-title">Are you sure you want to delete this task?</h2><div className="dialog-actions"><button autoFocus className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-primary" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" aria-label="Deleting" /> : "Yes, delete"}</button></div></div></div>;
}
function formatMinutes(value: number) { return value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}` : `${value}m`; }
// Keep custom context menus; suppress the WebView browser menu (Refresh, etc.).
document.addEventListener("contextmenu", event => event.preventDefault());
const habitPin = window.__SSC_HABIT_WIDGET__;
createRoot(document.getElementById("root")!).render(habitPin?.style === "study" ? <PinnedStudyWindow pin={habitPin} /> : habitPin && habitPin.style !== "recall" && habitPin.style !== "tasks" ? <PinnedHabitWindow pin={habitPin} /> : <App />);
