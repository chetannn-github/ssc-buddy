import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, BrainCircuit, Check, ChevronDown, CloudOff, Eye, EyeOff, Flame, LoaderCircle, LogOut, Plus, Trash2, X } from "lucide-react";
import type { User } from "firebase/auth";
import { TASK_TYPES, type DailyTask, type TaskType, type QuickRecallSeed, createAccount, firebaseConfigured, loadQuickRecallSeed, logout, makeTaskId, observeAuth, recordQuickRecallAnswer, recordQuickRecallPractice, removeTask, saveTask, signIn, signInGoogle, todayKey, watchStreakActivity, watchTasks } from "./lib/firebase";
import { createQuickRecallSession, RANDOM_RECALL_SCOPE, type QuickRecallScope, type QuickRecallSession } from "./lib/quick-recall";
import { QuickRecallPanel } from "./components/QuickRecallPanel";
import authImage from "./assets/auth.jpg";
import googleImage from "./assets/google.png";
import "./styles.css";

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

function useAnimatedNumber(value: number, duration = 420) {
  const [displayed, setDisplayed] = useState(value);
  const current = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = current.current;
    const difference = value - start;
    if (!difference) return;
    const startedAt = performance.now();
    if (frame.current) cancelAnimationFrame(frame.current);
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(start + difference * eased);
      current.current = next;
      setDisplayed(next);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [duration, value]);

  return displayed;
}

function App() {
  const savedQuickRecall = loadSavedQuickRecall();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [activityDates, setActivityDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<DailyTask | null | "new">(null);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [schedule, setSchedule] = useState<"today" | "tomorrow">("today");
  const [taskDay, setTaskDay] = useState<"today" | "tomorrow">("today");
  const [complete, setComplete] = useState<DailyTask | null>(null);
  const [minutes, setMinutes] = useState("30");
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingTask, setDeletingTask] = useState<DailyTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [ringProgress, setRingProgress] = useState(0);
  const [quickRecallOpen, setQuickRecallOpen] = useState(() => Boolean(savedQuickRecall));
  const [quickRecallLoading, setQuickRecallLoading] = useState(false);
  const [quickRecallSession, setQuickRecallSession] = useState<QuickRecallSession | null>(() => savedQuickRecall?.session ?? null);
  const [quickRecallSeed, setQuickRecallSeed] = useState<QuickRecallSeed | null>(null);
  const [quickRecallScope, setQuickRecallScope] = useState<QuickRecallScope>({ subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE });

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

  const today = todayKey();
  const tomorrow = tomorrowKey();
  const todayTasks = useMemo(() => tasks.filter((task) => task.date === (taskDay === "today" ? today : tomorrow)).sort((a, b) => Number(a.completed) - Number(b.completed)), [taskDay, tasks, today, tomorrow]);
  const taskPoints = useMemo(() => weeklyTaskPoints(tasks), [tasks]);
  const tomorrowTaskCount = tasks.filter((task) => task.date === tomorrow).length;
  const done = todayTasks.filter((task) => task.completed);
  const minutesDone = done.reduce((total, task) => total + (task.minutesSpent ?? 0), 0);
  const completionPercent = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0;
  const animatedDone = useAnimatedNumber(done.length);
  const animatedTotal = useAnimatedNumber(todayTasks.length);
  const animatedMinutes = useAnimatedNumber(minutesDone);
  const streak = useMemo(() => {
    const toKey = (value: string | Date) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
    const activeDays = new Set(activityDates.map(toKey));
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!activeDays.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (activeDays.has(toKey(cursor))) { days += 1; cursor.setDate(cursor.getDate() - 1); }
    return days;
  }, [activityDates]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRingProgress(completionPercent));
    return () => cancelAnimationFrame(frame);
  }, [completionPercent]);
  useEffect(() => {
    if (quickRecallOpen && quickRecallSession) localStorage.setItem(QUICK_RECALL_SESSION_KEY, JSON.stringify({ open: true, session: quickRecallSession }));
    else localStorage.removeItem(QUICK_RECALL_SESSION_KEY);
  }, [quickRecallOpen, quickRecallSession]);

  const taskSubjects = [...new Set(tasks.map((task) => task.subject).filter(Boolean))];
  if (!taskSubjects.length) taskSubjects.push("Other");
  const openNew = () => { setDraft(blankDraft(taskSubjects[0])); setSchedule(taskDay); setEditor("new"); };
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
    await saveTask(user, { ...complete, completed: true, completedAt: new Date().toISOString(), minutesSpent: Math.max(0, Number(minutes) || 0) });
    setBusy(false); setComplete(null);
  };
  const reopen = async (task: DailyTask) => { if (user) await saveTask(user, { ...task, completed: false, completedAt: null, minutesSpent: null }); };
  const confirmLogout = async () => {
    setLoggingOut(true);
    try { await intentionalActionDelay(); await logout(); }
    finally { setLoggingOut(false); setLogoutConfirm(false); }
  };
  const confirmDelete = async () => {
    if (!user || !deletingTask) return;
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

  return <main className="widget">
    <header><div className="window-drag"><span className="brand">STUDY PLANNER</span><h1>{quickRecallOpen ? "Quick Recall" : "Daily Tasks"}</h1></div>{quickRecallOpen ? <button className="quick-recall-trigger" onClick={() => { setQuickRecallOpen(false); setQuickRecallSession(null); }}><ArrowLeft size={16} /><span>Tasks</span></button> : <div className="header-actions"><button className="quick-recall-trigger" onClick={() => void openQuickRecall()}><BrainCircuit size={16} /><span>Recall</span></button><div className={`streak-pill ${streak > 0 ? "active" : ""}`}><Flame size={16} /><span>{streak}</span></div><button className="logout" onClick={() => setLogoutConfirm(true)}><LogOut size={15} /></button></div>}</header>
    {quickRecallOpen ? quickRecallSession ? <QuickRecallPanel session={quickRecallSession} loading={quickRecallLoading} onAnswered={(question, choice, index, correct) => { if (user) { void recordQuickRecallAnswer(user, question, correct).catch(() => undefined); void recordQuickRecallPractice(user, { runId: `${quickRecallSession?.runId ?? "quick-recall"}:${index}`, date: todayKey(), startedAt: quickRecallSession?.startedAt ?? new Date().toISOString(), questions: [question], answers: [choice] }).catch(() => undefined); } }} onBack={() => { localStorage.removeItem("ssc-buddy-desktop-quick-recall-progress"); setQuickRecallOpen(false); setQuickRecallSession(null); }} onRestart={() => { setQuickRecallSession(null); }} /> : <QuickRecallSetup seed={quickRecallSeed} loading={quickRecallLoading} scope={quickRecallScope} onScopeChange={setQuickRecallScope} onBack={() => setQuickRecallOpen(false)} onStart={() => quickRecallSeed && setQuickRecallSession(createQuickRecallSession(quickRecallSeed, quickRecallScope))} /> : <><section className="task-hero"><div className="hero-heading"><span>{taskDay === "today" ? "Today’s tasks" : "Tomorrow’s tasks"}</span><div className="hero-actions">{(tomorrowTaskCount > 0 || taskDay === "tomorrow") && <button className="day-toggle" onClick={() => setTaskDay((value) => value === "today" ? "tomorrow" : "today")}>{taskDay === "today" ? `Tomorrow (${tomorrowTaskCount})` : "Today"}<ChevronDown size={14} /></button>}<button className="icon-button" onClick={openNew}><Plus size={18} /></button></div></div><div className="progress-row"><div className="completion-ring"><svg viewBox="0 0 84 84" aria-hidden="true"><circle className="ring-track" cx="42" cy="42" r="35" /><circle className="ring-value" cx="42" cy="42" r="35" style={{ strokeDashoffset: 220 - (220 * ringProgress) / 100 }} /></svg><div><strong>{completionPercent}%</strong></div></div><div className="hero-stats"><div><span>TASKS</span><strong>{animatedDone} / {animatedTotal}</strong></div><div><span>COMPLETED TIME</span><strong>{formatMinutes(animatedMinutes)}</strong></div></div></div></section><div className="toolbar"><span>{taskDay === "today" ? "TODAY'S TASKS" : "TOMORROW'S TASKS"}</span></div><section className="task-list">{todayTasks.length ? todayTasks.map((task) => { const points = taskPoints.get(task.id) ?? 0; return <article className={`task ${task.completed ? "done" : ""}`} key={task.id}><button className="check" onClick={() => task.completed ? void reopen(task) : (setMinutes(String(task.minutesSpent ?? 30)), setComplete(task))}>{task.completed && <Check size={14} />}</button><button className="task-main" onClick={() => openEdit(task)}><span className="task-title"><b>{task.name}</b><em className={`task-points ${points > 0 ? "positive" : points < 0 ? "negative" : "neutral"}`}>{points > 0 ? `+${points}` : points} pts</em></span><small>{task.subject} · {task.type}{task.completed && task.minutesSpent ? ` · ${formatMinutes(task.minutesSpent)}` : ""}</small></button><button className="subtle delete-trigger" onClick={() => setDeletingTask(task)}><Trash2 size={15} /></button></article>; }) : <div className="empty"><p>No tasks for {taskDay}.</p><button className="primary" onClick={openNew}><Plus size={16} /> Add task</button></div>}</section></>}
    {editor && <TaskEditor draft={draft} setDraft={setDraft} subjects={taskSubjects} schedule={schedule} setSchedule={setSchedule} busy={busy} editing={editor !== "new"} onClose={() => setEditor(null)} onSave={() => void submitTask()} />}
    {complete && <CompleteDialog task={complete} minutes={minutes} setMinutes={setMinutes} busy={busy} onClose={() => setComplete(null)} onSave={() => void completeTask()} />}
    {logoutConfirm && <LogoutDialog busy={loggingOut} onClose={() => setLogoutConfirm(false)} onConfirm={() => void confirmLogout()} />}
    {deletingTask && <DeleteTaskDialog task={deletingTask} busy={deleting} onClose={() => setDeletingTask(null)} onConfirm={() => void confirmDelete()} />}
  </main>;
}

function QuickRecallSetup({ seed, loading, scope, onScopeChange, onStart, onBack }: { seed: QuickRecallSeed | null; loading: boolean; scope: QuickRecallScope; onScopeChange: (scope: QuickRecallScope) => void; onStart: () => void; onBack: () => void }) {
  const hasRecallQuestions = (chapter: any) => Array.isArray(chapter?.exercises) && chapter.exercises.some((exercise: any) => Array.isArray(exercise?.questions) && exercise.questions.some((question: any) => question?.id && question?.question && Array.isArray(question?.options) && question.options.length === 4 && ["A", "B", "C", "D"].includes(question?.correctAnswer)));
  const subjects = (seed?.subjects ?? []).map((item: any) => ({ id: String(item?.id ?? item?.name ?? ""), name: String(item?.name ?? "Subject"), chapters: (Array.isArray(item?.chapters) ? item.chapters : []).filter(hasRecallQuestions) })).filter((item) => item.id && item.chapters.length);
  const selected = subjects.find((item) => item.id === scope.subjectId);
  const chapters: string[] = selected?.chapters.map((item: any) => String(item?.name ?? "")).filter(Boolean) ?? [];
  return <section className="quick-recall-panel quick-setup"><label>Subject<SelectMenu value={scope.subjectId === RANDOM_RECALL_SCOPE ? "Random" : (selected?.name ?? "Random")} options={["Random", ...subjects.map((item) => item.name)]} onChange={(name) => { const subject = subjects.find((item) => item.name === name); onScopeChange({ subjectId: subject?.id ?? RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE }); }} /></label><label>Chapter{selected ? <SelectMenu value={scope.chapter === RANDOM_RECALL_SCOPE ? "Random" : scope.chapter} options={["Random", ...chapters]} onChange={(chapter) => onScopeChange({ ...scope, chapter: chapter === "Random" ? RANDOM_RECALL_SCOPE : chapter })} /> : <div className="quick-setup-disabled">Random</div>}</label><button className="primary" disabled={loading || !seed} onClick={onStart}>{loading ? <LoaderCircle className="spin" /> : <>Start recall <ArrowRight size={14} /></>}</button></section>;
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
  const chooseSubject = (subject: string) => {
    if (subject !== "__custom__") { setDraft({ ...draft, subject }); return; }
    const custom = window.prompt("Subject name")?.trim();
    if (custom) setDraft({ ...draft, subject: custom });
  };
  return <div className="modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`dialog task-dialog ${editing ? "editing" : ""}`}><button className="close" onClick={onClose}><X size={18} /></button><h2>{editing ? "Edit task" : "New task"}</h2><label>Task name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && onSave()} placeholder="Lecture 5 of Polity" /></label><div className="form-grid"><label>Subject<SelectMenu value={draft.subject} options={[...subjects, "__custom__"]} onChange={chooseSubject} /></label><label>Task type<SelectMenu value={draft.type} options={[...TASK_TYPES]} onChange={(type) => setDraft({ ...draft, type: type as TaskType })} /></label></div>{!editing && <div className="schedule"><span>Schedule for</span><div><button type="button" className={schedule === "today" ? "active" : ""} onClick={() => setSchedule("today")}>Today</button><button type="button" className={schedule === "tomorrow" ? "active" : ""} onClick={() => setSchedule("tomorrow")}>Tomorrow</button></div></div>}<div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.name.trim()} onClick={onSave}>{busy ? <LoaderCircle className="spin" /> : editing ? "Save changes" : "Add task"}</button></div></div></div>;
}
function SelectMenu({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  return <div className="select-menu" ref={root}><button type="button" className="select-trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span>{value}</span><ChevronDown size={15} /></button>{open && <div className="select-popover">{options.map((option) => <button type="button" key={option} className={option === value ? "selected" : ""} onClick={() => { onChange(option); setOpen(false); }}><span>{option === "__custom__" ? "+ Add subject" : option}</span>{option === value && <Check size={14} strokeWidth={2.5} />}</button>)}</div>}</div>;
}
function CompleteDialog({ task, minutes, setMinutes, busy, onClose, onSave }: { task: DailyTask; minutes: string; setMinutes: (value: string) => void; busy: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog complete-dialog"><button className="close" onClick={onClose}><X size={18} /></button><h2>Complete task</h2><p className="muted complete-name">{task.name}</p><label>Actual study minutes<input autoFocus inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))} placeholder="30" /></label><div className="chips">{[30, 45, 60, 90, 120].map((value) => <button type="button" className={Number(minutes) === value ? "chip active" : "chip"} key={value} onClick={() => setMinutes(String(value))}>{formatMinutes(value)}</button>)}</div><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={onSave}>{busy ? <LoaderCircle className="spin" /> : "Mark complete"}</button></div></div></div>;
}
function LogoutDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal"><div className="dialog logout-dialog"><div className="confirm-header"><div className="logout-dialog-icon"><LogOut size={18} /></div><button className="confirm-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={19} /></button></div><h2>Sign out?</h2><p className="muted">You can sign back in anytime.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-primary" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" /> : "Sign out"}</button></div></div></div>;
}
function DeleteTaskDialog({ task, busy, onClose, onConfirm }: { task: DailyTask; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog delete-dialog"><div className="confirm-header"><div className="delete-dialog-icon"><Trash2 size={17} /></div><button className="confirm-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18} /></button></div><h2>Delete task?</h2><p className="muted">This task will be removed from your plan.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-primary" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" /> : "Delete"}</button></div></div></div>;
}
function formatMinutes(value: number) { return value >= 60 ? `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}` : `${value}m`; }
createRoot(document.getElementById("root")!).render(<App />);
