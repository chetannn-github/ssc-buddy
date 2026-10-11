import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import type { QuickRecallSession, QuizChoice } from "../lib/quick-recall";

const choices: QuizChoice[] = ["A", "B", "C", "D"];

export function QuickRecallPanel({ session, loading, onBack, onRestart }: { session: QuickRecallSession | null; loading: boolean; onBack: () => void; onRestart: () => void }) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState<QuizChoice | null>(null);
  const [finished, setFinished] = useState(false);
  const [correctionUntil, setCorrectionUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const question = session?.questions[index];

  const nextQuestion = () => {
    if (index + 1 >= (session?.questions.length ?? 0)) setFinished(true);
    else { setIndex((value) => value + 1); setSelected(null); }
    setCorrectionUntil(null);
  };

  useEffect(() => {
    setIndex(0); setCorrect(0); setSelected(null); setFinished(false); setCorrectionUntil(null); setSecondsLeft(0);
  }, [session]);

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
    if (right) {
      setCorrect((value) => value + 1);
      window.setTimeout(nextQuestion, 650);
    } else {
      setCorrectionUntil(Date.now() + 10_000);
    }
  };

  if (loading) return <section className="quick-recall-panel quick-state quick-loading"><LoaderCircle className="spin" /><span>Preparing quick recall…</span></section>;
  if (!session) return <section className="quick-recall-panel quick-state"><Sparkles size={20} /><strong>No question-based exercises yet.</strong><span>Add question-based exercises in Practice Session to begin.</span><button className="secondary" onClick={onBack}>Back to tasks</button></section>;
  if (finished) return <section className="quick-recall-panel quick-state"><Sparkles size={21} /><strong>{correct}/{session.questions.length} correct</strong><span>{session.subject} · Quick recall complete</span><div className="quick-actions"><button className="secondary" onClick={onBack}><ArrowLeft size={14} /> Tasks</button><button className="primary" onClick={onRestart}><RotateCcw size={14} /> Again</button></div></section>;

  return <section className="quick-recall-panel">
    <div className="quick-heading"><span>QUICK RECALL · {session.subject.toUpperCase()}</span><small>{correctionUntil ? `Next in ${secondsLeft}s` : `${index + 1}/${session.questions.length}`}</small></div>
    <p className="quick-question">{question?.question}</p>
    <div className="quick-options">{choices.map((choice, optionIndex) => {
      const selectedThis = selected === choice;
      const correctThis = Boolean(selected) && choice === question?.correctAnswer;
      const wrongThis = selectedThis && choice !== question?.correctAnswer;
      return <button key={choice} disabled={Boolean(selected)} onClick={() => answer(choice)} className={`quick-option ${correctThis ? "correct" : ""} ${wrongThis ? "wrong" : ""}`}><b>{choice}</b><span>{question?.options[optionIndex]}</span></button>;
    })}</div>
    {selected === question?.correctAnswer && <div className="quick-success">Correct · nice work</div>}
    {correctionUntil && question?.explanation && <div className="quick-feedback"><p>{question.explanation}</p></div>}
  </section>;
}
