import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupScreen, type TestConfig } from "@/components/exam/SetupScreen";
import { TestScreen } from "@/components/exam/TestScreen";
import { AnswerKeyScreen } from "@/components/exam/AnswerKeyScreen";
import { ResultScreen } from "@/components/exam/ResultScreen";
import { computeScore, saveRecord, type Option, type TestRecord } from "@/lib/exam";

const title = "CBT MCQ Practice — Mark Answers for SSC, UPSC, Banking";
const description =
  "A free offline OMR-style CBT interface for government exam aspirants: pick subject and chapter, set a timer, mark A/B/C/D answers from your book, and track scores.";

type IndexSearch = {
  subject?: string | undefined;
  chapter?: string | undefined;
  exercise?: string | undefined;
  minutes?: number | undefined;
  start?: number | undefined;
  count?: number | undefined;
};


const numOrUndefined = (v: unknown) => {
  const n = Number(v);
  return v === undefined || Number.isNaN(n) || n <= 0 ? undefined : n;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => ({
    subject: typeof search["subject"] === "string" ? search["subject"] : undefined,
    chapter: typeof search["chapter"] === "string" ? search["chapter"] : undefined,
    exercise: typeof search["exercise"] === "string" ? search["exercise"] : undefined,
    minutes: numOrUndefined(search["minutes"]),
    start: numOrUndefined(search["start"]),
    count: numOrUndefined(search["count"]),
  }),

  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

type Phase = "setup" | "key" | "test" | "result";

function Index() {
  const search = Route.useSearch();
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [answerKey, setAnswerKey] = useState<(Option | null)[] | null>(null);
  const [record, setRecord] = useState<TestRecord | null>(null);

  const handleSubmit = (answers: (Option | null)[], timeTakenSeconds: number) => {
    if (!config) return;
    const key = answerKey;
    const evaluations = key
      ? answers.map((a, i) => (!a || !key[i] ? null : a === key[i] ? "correct" : "incorrect"))
      : undefined;
    const correct = evaluations ? evaluations.filter((v) => v === "correct").length : null;
    const wrong = evaluations ? evaluations.filter((v) => v === "incorrect").length : null;
    const saved: TestRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      subject: config.subject,
      chapter: config.chapter,
      ...(config.exercise ? { exercise: config.exercise } : {}),
      startNumber: config.startNumber,
      durationMinutes: config.minutes,
      timeTakenSeconds,
      answers,
      ...(key ? { answerKey: key } : {}),
      ...(evaluations ? { evaluations } : {}),
      correct,
      wrong,
      marking: config.marking,
      score: computeScore(correct, wrong, config.marking),
    };
    saveRecord(saved);
    setRecord(saved);
    setPhase("result");
  };

  if (phase === "test" && config) {
    return (
      <TestScreen
        minutes={config.minutes}
        startNumber={config.startNumber}
        subject={config.subject}
        chapter={config.exercise ? `${config.chapter} · ${config.exercise}` : config.chapter}
        questionCount={config.questionCount}
        maxQuestions={config.maxQuestions}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <AppShell
      title={phase === "result" ? "Test result" : phase === "key" ? "Answer key" : "New test"}
      subtitle={
        phase === "result" && record ? `${record.subject} · ${record.chapter}` : undefined
      }
    >
      {phase === "result" && record ? (
        <ResultScreen
          record={record}
          onRestart={() => {
            setRecord(null);
            setAnswerKey(null);
            setPhase("setup");
          }}
        />
      ) : phase === "key" && config && config.questionCount ? (
        <AnswerKeyScreen
          count={config.questionCount}
          startNumber={config.startNumber}
          subject={config.subject}
          chapter={config.chapter}
          onBack={() => setPhase("setup")}
          onConfirm={(key) => {
            setAnswerKey(key.some(Boolean) ? key : null);
            setPhase("test");
          }}
        />
      ) : (
        <SetupScreen
          prefill={{
            subject: search.subject,
            chapter: search.chapter,
            exercise: search.exercise,
            minutes: search.minutes,
            startNumber: search.start,
            questionCount: search.count ?? null,
          }}
          onStart={(c) => {
            setConfig(c);
            setAnswerKey(c.answerKey);
            setPhase(c.answerKey ? "test" : c.questionCount ? "key" : "test");
          }}
        />
      )}
    </AppShell>
  );
}

