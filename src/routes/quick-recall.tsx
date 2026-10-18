import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  loadFavoriteQuestionIds,
  loadHistory,
  loadSubjects,
  type McqQuestion,
  type Option,
} from "@/lib/exam";
import { useAuthUser } from "@/lib/auth-context";
import { loadQuickRecallSeed, recordQuickRecallAnswer, recordQuickRecallPractice, watchQuickRecallSeed, type QuickRecallSeed } from "@/lib/firebase-sync";

import { ALL_RECALL_EXERCISES, filterRecallScope, mergeRecallLearning, selectRecallQuestions } from "../../mobile-tasks/src/domain/recall-selection";

export const Route = createFileRoute("/quick-recall")({ component: QuickRecall });

type RecallQuestion = McqQuestion & { subject: string; subjectId: string; chapter: string; exerciseId: string; exercise: string };
type RecallScope = { subjectId: string; chapter: string; exerciseId?: string };
const RANDOM_SCOPE = "random";
type RecallOption = { value: string; label: string };
type LearningStat = { askedCount: number; correctCount: number; wrongCount: number; lastAskedAt: string; lastOutcome: "correct" | "wrong" };
type PracticePerformance = { askedCount: number; correctCount: number; wrongCount: number };
const STAT_KEY = "ssc-buddy-question-learning";
const choices: Option[] = ["A", "B", "C", "D"];

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function loadStats(): Record<string, LearningStat> {
  try {
    const saved = JSON.parse(localStorage.getItem(STAT_KEY) ?? "{}") as { stats?: Record<string, LearningStat> };
    return saved.stats ?? {};
  } catch {
    return {};
  }
}

function statKey(question: Pick<RecallQuestion, "subjectId" | "id">) {
  return `${question.subjectId}:${question.id}`;
}

function questionPool(subjects = loadSubjects()): RecallQuestion[] {
  return subjects.flatMap((subject) =>
    subject.chapters.flatMap((chapter) =>
      chapter.exercises.flatMap((exercise) =>
        (exercise.questions ?? []).map((question) => ({ ...question, subject: subject.name, subjectId: subject.id, chapter: chapter.name, exerciseId: String(exercise.id ?? exercise.name ?? "Exercise 1"), exercise: exercise.name || "Exercise 1" })),
      ),
    ),
  );
}

function normalPracticeStats(records = loadHistory()) {
  const performance = new Map<string, PracticePerformance>();
  records.forEach((record) => {
    // Quick Recall already has its own atomic learning record. Excluding it
    // here avoids counting the same response twice.
    if (record.testMode === "quick-recall") return;
    (record.questionIds ?? []).forEach((id, index) => {
      const answer = record.answers[index];
      const key = record.answerKey?.[index];
      if (!id || !answer || !key) return;
      const composite = `${record.subjectId ?? ""}:${id}`;
      const prior = performance.get(composite) ?? { askedCount: 0, correctCount: 0, wrongCount: 0 };
      prior.askedCount += 1;
      if (answer === key) prior.correctCount += 1;
      else prior.wrongCount += 1;
      performance.set(composite, prior);
    });
  });
  return performance;
}

/** Same-subject recall with recent-answer cooldowns and balanced priorities. */
function buildRecall(seed?: QuickRecallSeed, scope: RecallScope = { subjectId: RANDOM_SCOPE, chapter: RANDOM_SCOPE }): RecallQuestion[] {
  const pool = questionPool(seed?.subjects as ReturnType<typeof loadSubjects> | undefined);
  const scoped = filterRecallScope(pool, scope);
  if (!scoped.length) return [];
  const favourites = new Set(seed?.favouriteQuestionIds ?? loadFavoriteQuestionIds());
  const stats = mergeRecallLearning((seed?.learningStats ?? {}) as Record<string, LearningStat>, loadStats());
  const practice = normalPracticeStats(seed?.attempts as ReturnType<typeof loadHistory> | undefined);
  return selectRecallQuestions(scoped, favourites, stats, practice);
}

function QuickRecall() {
  const user = useAuthUser();
  const [questions, setQuestions] = useState<RecallQuestion[]>(() => buildRecall());
  const [seed, setSeed] = useState<QuickRecallSeed | null>(null);
  const [runId, setRunId] = useState(() => `quick-recall-${Date.now()}-${crypto.randomUUID()}`);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Option | null>(null);
  const [correctionUntil, setCorrectionUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [complete, setComplete] = useState(false);
  const [setup, setSetup] = useState(true);
  const [scope, setScope] = useState<RecallScope>({ subjectId: RANDOM_SCOPE, chapter: RANDOM_SCOPE, exerciseId: ALL_RECALL_EXERCISES });
  const question = questions[index];
  const correct = answers.reduce((total, answer, answerIndex) => total + Number(answer === questions[answerIndex]?.correctAnswer), 0);

  const subjectLabel = useMemo(() => question?.subject ?? questions[0]?.subject ?? "", [question?.subject, questions]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const applyInitialSeed = (nextSeed: QuickRecallSeed) => {
      if (!active) return;
      setSeed({ ...nextSeed, learningStats: mergeRecallLearning(nextSeed.learningStats as Record<string, LearningStat>, loadStats()) });
      setQuestions(buildRecall(nextSeed));
      setIndex(0);
      setAnswers([]);
      setSelected(null);
      setCorrectionUntil(null);
      setComplete(false);
      setRunId(`quick-recall-${Date.now()}-${crypto.randomUUID()}`);
      setStartedAt(new Date().toISOString());
    };
    void loadQuickRecallSeed(user).then(applyInitialSeed).catch(() => undefined);
    // Future cloud updates are retained for the next recall run. We do not
    // replace a live three-question sprint under the user's finger.
    const stop = watchQuickRecallSeed(user, (nextSeed) => {
      if (!active) return;
      setSeed({ ...nextSeed, learningStats: mergeRecallLearning(nextSeed.learningStats as Record<string, LearningStat>, loadStats()) });
    });
    return () => { active = false; stop(); };
  }, [user?.uid]);
  useEffect(() => {
    if (!correctionUntil) { setSecondsLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((correctionUntil - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setCorrectionUntil(null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [correctionUntil]);
  const restart = () => {
    setQuestions(buildRecall(seed ?? undefined, scope));
    setIndex(0);
    setAnswers([]);
    setSelected(null);
    setCorrectionUntil(null);
    setComplete(false);
    setRunId(`quick-recall-${Date.now()}-${crypto.randomUUID()}`);
    setStartedAt(new Date().toISOString());
  };
  const availableSubjects = useMemo(() => [...new Map(questionPool(seed?.subjects as ReturnType<typeof loadSubjects> | undefined).map((item) => [item.subjectId, item])).values()], [seed]);
  const selectedSubject = availableSubjects.find((item) => item.subjectId === scope.subjectId);
  const availableChapters = selectedSubject ? [...new Set(questionPool(seed?.subjects as ReturnType<typeof loadSubjects> | undefined).filter((item) => item.subjectId === selectedSubject.subjectId).map((item) => item.chapter))] : [];
  const availableExercises = selectedSubject && scope.chapter !== RANDOM_SCOPE
    ? [...new Map(questionPool(seed?.subjects as ReturnType<typeof loadSubjects> | undefined)
      .filter((item) => item.subjectId === selectedSubject.subjectId && item.chapter === scope.chapter)
      .map((item) => [item.exerciseId, { value: item.exerciseId, label: item.exercise }])).values()]
    : [];
  const start = () => { restart(); setSetup(false); };
  const choose = (choice: Option) => {
    if (!question || selected) return;
    setSelected(choice);
    const stats = mergeRecallLearning((seed?.learningStats ?? {}) as Record<string, LearningStat>, loadStats());
    const key = statKey(question);
    const prior = stats[key] ?? { askedCount: 0, correctCount: 0, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" as const };
    const isCorrect = choice === question.correctAnswer;
    if (!isCorrect) setCorrectionUntil(Date.now() + 10_000);
    stats[key] = {
      askedCount: prior.askedCount + 1,
      correctCount: prior.correctCount + Number(isCorrect),
      wrongCount: prior.wrongCount + Number(!isCorrect),
      lastAskedAt: new Date().toISOString(),
      lastOutcome: isCorrect ? "correct" : "wrong",
    };
    setSeed((current) => current ? { ...current, learningStats: stats } : current);
    try { localStorage.setItem(STAT_KEY, JSON.stringify({ stats })); } catch { /* optional cache */ }
    if (user) {
      // Same two transaction writes as the Android and Windows widget.
      void recordQuickRecallAnswer(user, question, isCorrect);
      void recordQuickRecallPractice(user, { runId: `${runId}:${index}`, date: todayKey(), startedAt, questions: [question], answers: [choice] });
    }
  };
  const next = () => {
    if (!question || !selected || correctionUntil) return;
    const nextAnswers = [...answers, selected];
    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex((value) => value + 1);
      setSelected(null);
      setCorrectionUntil(null);
      return;
    }
    setAnswers(nextAnswers);
    setComplete(true);
  };

  return (
    <AppShell title="Quick Recall">
      <main className="exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-4 text-zinc-100 sm:-mx-6 sm:px-6">
        <section className="mx-auto max-w-xl">
          {setup ? (
            <div className="rounded-xl bg-[#1b1b1b] p-5"><p className="text-[11px] font-medium tracking-[.14em] text-blue-300 uppercase">Quick recall</p><h1 className="mt-2 text-xl font-medium">Choose your focus</h1><p className="mt-1 text-sm text-zinc-400">Mixes fresh questions and earlier mistakes, with fewer recent repeats.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><RecallDropdown label="Subject" value={scope.subjectId} options={[{ value: RANDOM_SCOPE, label: "Random" }, ...availableSubjects.map((item) => ({ value: item.subjectId, label: item.subject }))]} onChange={(subjectId) => setScope({ subjectId, chapter: RANDOM_SCOPE, exerciseId: ALL_RECALL_EXERCISES })} /><RecallDropdown label="Chapter" disabled={!selectedSubject} value={scope.chapter} options={[{ value: RANDOM_SCOPE, label: "Random" }, ...availableChapters.map((chapter) => ({ value: chapter, label: chapter }))]} onChange={(chapter) => setScope((value) => ({ ...value, chapter, exerciseId: ALL_RECALL_EXERCISES }))} /><RecallDropdown label="Exercise" disabled={!selectedSubject || scope.chapter === RANDOM_SCOPE} value={scope.exerciseId ?? ALL_RECALL_EXERCISES} options={[{ value: ALL_RECALL_EXERCISES, label: "All exercises" }, ...availableExercises]} onChange={(exerciseId) => setScope((value) => ({ ...value, exerciseId }))} /></div><div className="mt-5 flex justify-end"><Button size="sm" onClick={start}>Start recall <ArrowRight className="h-3.5 w-3.5" /></Button></div></div>
          ) : !questions.length ? (
            <div className="rounded-xl bg-[#1b1b1b] px-5 py-12 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-blue-300" />
              <h1 className="mt-3 text-lg font-medium">Add question-based exercises first</h1>
              <p className="mt-2 text-sm text-zinc-400">Quick Recall picks three questions from one saved subject.</p>
              <Button size="sm" className="mt-5" asChild><Link to="/test">Open practice</Link></Button>
            </div>
          ) : complete ? (
            <div className="rounded-xl bg-[#1b1b1b] px-5 py-10 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-blue-300" />
              <p className="mt-3 text-[11px] font-medium tracking-[.14em] text-blue-300 uppercase">Recall finished</p>
              <h1 className="mt-1 text-2xl font-medium">{correct}/{questions.length} correct</h1>
              <p className="mt-2 text-sm text-zinc-400">{subjectLabel} · saved to today’s practice</p>
              <div className="mt-5 flex justify-center gap-2"><Button size="sm" variant="outline" asChild><Link to="/profile">View profile</Link></Button><Button size="sm" onClick={() => setSetup(true)}><RefreshCw className="h-3.5 w-3.5" /> Again</Button></div>
            </div>
          ) : question && (
            <div className="rounded-xl bg-[#1b1b1b] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-medium tracking-[.14em] text-blue-300 uppercase">{question.subject} · {question.chapter}</span><span className={correctionUntil ? "rounded-md bg-blue-400/10 px-2 py-1 font-semibold text-blue-200" : "text-zinc-500"}>{correctionUntil ? `${secondsLeft}s` : `${index + 1} / ${questions.length}`}</span></div>
              <h1 className="mt-4 text-lg leading-7 font-medium sm:text-xl">{question.question}</h1>
              <div className="mt-5 space-y-2">
                {choices.map((choice, optionIndex) => {
                  const isSelected = selected === choice;
                  const isCorrect = selected && choice === question.correctAnswer;
                  const wrong = isSelected && choice !== question.correctAnswer;
                  return <button key={choice} type="button" disabled={Boolean(selected)} onClick={() => choose(choice)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition ${isCorrect ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100" : wrong ? "border-rose-400/50 bg-rose-400/10 text-rose-100" : "border-white/10 bg-white/[.025] hover:border-blue-400/45 hover:bg-white/[.05]"}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-[11px] text-zinc-400">{choice}</span><span>{question.options[optionIndex]}</span>{isCorrect && <Check className="ml-auto h-4 w-4" />}</button>;
                })}
              </div>
              {selected && <><div className="mt-4 rounded-lg bg-white/[.035] p-3 text-sm leading-5 text-zinc-300"><span className="font-medium text-zinc-100">{selected === question.correctAnswer ? "Correct." : `Correct answer: ${question.correctAnswer}.`}</span>{question.explanation ? ` ${question.explanation}` : ""}</div><div className="mt-4 flex justify-end"><Button size="sm" disabled={Boolean(correctionUntil)} onClick={next}>{correctionUntil ? `Next in ${secondsLeft}s` : index + 1 === questions.length ? "Finish" : "Next"}<ArrowRight className="h-3.5 w-3.5" /></Button></div></>}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function RecallDropdown({ label, value, options, disabled = false, onChange }: { label: string; value: string; options: RecallOption[]; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    const dismiss = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);
  return (
    <div ref={root} className="relative grid gap-1.5 text-[11px] font-medium tracking-[.12em] text-zinc-400 uppercase">
      <span>{label}</span>
      <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-10 items-center justify-between rounded-lg border border-white/10 bg-white/[.035] px-3 text-left text-sm normal-case tracking-normal text-zinc-100 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-45"><span className="truncate">{selected?.label}</span><ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} /></button>
      {open && !disabled && <div className="absolute top-full z-30 mt-1.5 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#202020] p-1 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
        {options.map((option) => <button type="button" key={option.value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex min-h-9 w-full items-center justify-between rounded-md px-2.5 text-left text-sm normal-case tracking-normal transition ${option.value === value ? "bg-zinc-100 text-zinc-950" : "text-zinc-300 hover:bg-white/[.07]"}`}><span className="truncate">{option.label}</span>{option.value === value && <Check className="ml-2 h-3.5 w-3.5 shrink-0" />}</button>)}
      </div>}
    </div>
  );
}
