import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import type { QuickRecallSession, QuizChoice } from "../lib/quick-recall";

const choices: QuizChoice[] = ["A", "B", "C", "D"];
const QUICK_RECALL_PROGRESS_KEY = "ssc-buddy-desktop-quick-recall-progress";
type SavedProgress = { sessionId: string; index: number; correct: number; selected: QuizChoice | null; answers: QuizChoice[]; correctionUntil: number | null };

function sessionId(session: QuickRecallSession | null) { return session?.runId ?? ""; }
function loadProgress(session: QuickRecallSession | null): SavedProgress | null {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_RECALL_PROGRESS_KEY) ?? "null") as SavedProgress | null;
    return saved?.sessionId === sessionId(session) ? saved : null;
  } catch { return null; }
}

export function QuickRecallPanel({ session, loading, onBack, onRestart, onAnswered }: { session: QuickRecallSession | null; loading: boolean; onBack: () => void; onRestart: () => void; onAnswered: (question: QuickRecallSession["questions"][number], choice: QuizChoice, index: number, correct: boolean) => void }) {
  const [index, setIndex] = useState(() => loadProgress(session)?.index ?? 0);
  const [correct, setCorrect] = useState(() => loadProgress(session)?.correct ?? 0);
  const [selected, setSelected] = useState<QuizChoice | null>(() => loadProgress(session)?.selected ?? null);
  const [answers, setAnswers] = useState<QuizChoice[]>(() => loadProgress(session)?.answers ?? []);
  const [finished, setFinished] = useState(false);
  const [correctionUntil, setCorrectionUntil] = useState<number | null>(() => loadProgress(session)?.correctionUntil ?? null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const question = session?.questions[index];

  const nextQuestion = () => {
    if (index + 1 >= (session?.questions.length ?? 0)) setFinished(true);
    else { setIndex((value) => value + 1); setSelected(null); }
    setCorrectionUntil(null); setSecondsLeft(0);
  };

  useEffect(() => {
    const saved = loadProgress(session);
    setIndex(saved?.index ?? 0); setCorrect(saved?.correct ?? 0); setSelected(saved?.selected ?? null); setAnswers(saved?.answers ?? []); setFinished(false); setCorrectionUntil(saved?.correctionUntil ?? null); setSecondsLeft(0);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (finished) { localStorage.removeItem(QUICK_RECALL_PROGRESS_KEY); return; }
    localStorage.setItem(QUICK_RECALL_PROGRESS_KEY, JSON.stringify({ sessionId: sessionId(session), index, correct, selected, answers, correctionUntil } satisfies SavedProgress));
  }, [session, index, correct, selected, answers, correctionUntil, finished]);

  useEffect(() => {
    if (!correctionUntil) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((correctionUntil - Date.now()) / 1000));
      setSecondsLeft(seconds);
      if (seconds === 0) nextQuestion();
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [correctionUntil, index, session]);

  const answer = (choice: QuizChoice) => {
    if (!question || selected) return;
    const right = choice === question.correctAnswer;
    setSelected(choice);
    setAnswers((value) => [...value, choice]);
    onAnswered(question, choice, index, right);
    if (right) {
      setCorrect((value) => value + 1);
    } else {
      setCorrectionUntil(Date.now() + 10_000);
    }
  };

  if (loading) return <section className="quick-recall-panel quick-state quick-loading"><LoaderCircle className="spin" /><span>Preparing quick recall…</span></section>;
  if (!session) return <section className="quick-recall-panel quick-state"><Sparkles size={20} /><strong>No question-based exercises yet.</strong><span>Add question-based exercises in Practice Session to begin.</span><button className="secondary" onClick={onBack}>Back to tasks</button></section>;
  if (finished) return <section className="quick-recall-panel quick-state"><Sparkles size={21} /><strong>{correct}/{session.questions.length} correct</strong><span>{session.subject} · Quick recall complete</span><div className="quick-actions"><button className="secondary" onClick={onBack}><ArrowLeft size={14} /> Tasks</button><button className="primary" onClick={onRestart}><RotateCcw size={14} /> Again</button></div></section>;

  return <section className="quick-recall-panel">
    <div className="quick-heading"><span>QUICK RECALL · {session.subject.toUpperCase()}</span><div className="quick-progress"><small>{correctionUntil ? `Next in ${secondsLeft}s` : `${index + 1}/${session.questions.length}`}</small><button type="button" className="quick-next" disabled={selected !== question?.correctAnswer || Boolean(correctionUntil)} onClick={nextQuestion}>{index + 1 === session.questions.length ? "Finish" : "Next"}</button></div></div>
    <p className="quick-question">{question?.question}</p>
    <div className="quick-options">{choices.map((choice, optionIndex) => {
      const selectedThis = selected === choice;
      const correctThis = Boolean(selected) && choice === question?.correctAnswer;
      const wrongThis = selectedThis && choice !== question?.correctAnswer;
      return <button key={choice} disabled={Boolean(selected)} onClick={() => answer(choice)} className={`quick-option ${correctThis ? "correct" : ""} ${wrongThis ? "wrong" : ""}`}><b>{choice}</b><span>{question?.options[optionIndex]}</span></button>;
    })}</div>
    {selected && question?.explanation && <div className="quick-feedback"><p>{question.explanation}</p></div>}
  </section>;
}
