import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SetupScreen, type TestConfig } from "@/components/exam/SetupScreen";
import { InstructionsScreen } from "@/components/exam/InstructionsScreen";
import { TestScreen } from "@/components/exam/TestScreen";
import { AnswerKeyScreen } from "@/components/exam/AnswerKeyScreen";
import { computeScore, saveRecord, type Option, type TestRecord } from "@/lib/exam";

const title = "New practice session";
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

type Phase = "setup" | "key" | "instructions" | "test";

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
        initialDarkMode={config.darkMode ?? false}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <AppShell
      title={
        phase === "key"
          ? "Answer key"
          : phase === "instructions"
            ? "Test instructions"
            : "New practice session"
      }
    >
      <div
        key={phase}
        className="app-page-enter exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6"
      >
        {phase === "key" && config && config.questionCount ? (
          <AnswerKeyScreen
            count={config.questionCount}
            startNumber={config.startNumber}
            subject={config.subject}
            chapter={config.chapter}
            onBack={() => setPhase("setup")}
            onConfirm={(key) => {
              setAnswerKey(key.some(Boolean) ? key : null);
              setPhase("instructions");
            }}
          />
        ) : phase === "instructions" && config ? (
          <InstructionsScreen
            subject={config.subject}
            chapter={config.chapter}
            exercise={config.exercise}
            minutes={config.minutes}
            questionCount={config.questionCount}
            marking={config.marking}
            onBack={() =>
              setPhase(config.answerKey ? "setup" : config.questionCount ? "key" : "setup")
            }
            onStart={(darkMode) => {
              setConfig((current) => (current ? { ...current, darkMode } : current));
              setPhase("test");
            }}
          />
        ) : (
          <SetupScreen
            prefill={{
              subject: config?.subject ?? search.subject,
              chapter: config?.chapter ?? search.chapter,
              exercise: config?.exercise ?? search.exercise,
              minutes: config?.minutes ?? search.minutes,
              startNumber: config?.startNumber ?? search.start,
              questionCount: config?.questionCount ?? search.count ?? null,
            }}
            onStart={(nextConfig) => {
              setConfig(nextConfig);
              setAnswerKey(nextConfig.answerKey);
              setPhase(
                nextConfig.answerKey
                  ? "instructions"
                  : nextConfig.questionCount
                    ? "key"
                    : "instructions",
              );
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
