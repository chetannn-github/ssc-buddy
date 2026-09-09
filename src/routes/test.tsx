import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupScreen, type TestConfig } from "@/components/exam/SetupScreen";
import { TestScreen } from "@/components/exam/TestScreen";
import { AnswerKeyScreen } from "@/components/exam/AnswerKeyScreen";
import { computeScore, saveRecord, type Option, type TestRecord } from "@/lib/exam";

const title = "New CBT MCQ Practice Test";
const description =
  "Create an offline OMR-style CBT test, mark A/B/C/D answers and track your score.";

type TestSearch = {
  subject?: string | undefined;
  chapter?: string | undefined;
  exercise?: string | undefined;
  minutes?: number | undefined;
  start?: number | undefined;
  count?: number | undefined;
};

const numOrUndefined = (value: unknown) => {
  const number = Number(value);
  return value === undefined || Number.isNaN(number) || number <= 0 ? undefined : number;
};

export const Route = createFileRoute("/test")({
  validateSearch: (search: Record<string, unknown>): TestSearch => ({
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
  component: TestPage,
});

type Phase = "setup" | "key" | "test";

function TestPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [answerKey, setAnswerKey] = useState<(Option | null)[] | null>(null);

  const handleSubmit = (answers: (Option | null)[], timeTakenSeconds: number) => {
    if (!config) return;
    const key = answerKey;
    const evaluations = key
      ? answers.map((answer, index) =>
          !answer || !key[index] ? null : answer === key[index] ? "correct" : "incorrect",
        )
      : undefined;
    const correct = evaluations
      ? evaluations.filter((verdict) => verdict === "correct").length
      : null;
    const wrong = evaluations
      ? evaluations.filter((verdict) => verdict === "incorrect").length
      : null;
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
    void navigate({ to: "/history/$id", params: { id: saved.id } });
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
    <AppShell title={phase === "key" ? "Answer key" : "New test"}>
      {phase === "key" && config && config.questionCount ? (
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
          onStart={(nextConfig) => {
            setConfig(nextConfig);
            setAnswerKey(nextConfig.answerKey);
            setPhase(nextConfig.answerKey ? "test" : nextConfig.questionCount ? "key" : "test");
          }}
        />
      )}
    </AppShell>
  );
}
