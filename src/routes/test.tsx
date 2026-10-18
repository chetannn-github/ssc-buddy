import { snapshotQuestionPaper } from "../../mobile-tasks/src/domain/question-deletion";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearActiveTest,
  loadActiveTest,
  saveActiveTest,
  type WebTestSession,
} from "@/lib/active-test";
import { useAuthUser } from "@/lib/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase-sync";
import { AppShell } from "@/components/layout/AppShell";
import { SetupScreen, type TestConfig } from "@/components/exam/SetupScreen";
import { InstructionsScreen } from "@/components/exam/InstructionsScreen";
import { TestScreen } from "@/components/exam/TestScreen";
import { AnswerKeyScreen } from "@/components/exam/AnswerKeyScreen";
import {
  computeScore,
  getRecord,
  newDocumentId,
  saveRecord,
  type Option,
  type TestRecord,
} from "@/lib/exam";

const title = "New practice session";
const description =
  "Create an offline OMR-style CBT test, mark A/B/C/D answers and track your score.";

type TestSearch = {
  attempt?: string | undefined;
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
    attempt: typeof search["attempt"] === "string" ? search["attempt"] : undefined,
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
  const user = useAuthUser();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [replay, setReplay] = useState<TestRecord | null>(null);
  const [replayLoaded, setReplayLoaded] = useState(!search.attempt);
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [answerKey, setAnswerKey] = useState<(Option | null)[] | null>(null);
  const [session, setSession] = useState<WebTestSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const checkpoint = useCallback(
    (progress: Pick<WebTestSession, "states" | "current" | "remaining">) => {
      if (session) saveActiveTest({ ...session, ...progress });
    },
    [session],
  );
  useEffect(() => {
    if (isFirebaseConfigured && !user) return;
    const savedSession = loadActiveTest();
    if (savedSession && !getRecord(savedSession.id)) {
      setSession(savedSession);
      setConfig(savedSession.payload.config);
      setAnswerKey(savedSession.payload.answerKey);
      setReplay(savedSession.payload.replay);
      setPhase("test");
      setReplayLoaded(true);
      setSessionLoaded(true);
      return;
    }
    if (savedSession) clearActiveTest();
    setSessionLoaded(true);
    const record = search.attempt ? getRecord(search.attempt) : null;
    const replayConfig: TestConfig | null =
      record?.questions?.length &&
      record.questions.length === record.answers.length &&
      record.answerKey?.length === record.answers.length
        ? {
            subjectId: record.subjectId ?? null,
            subject: record.subject,
            chapterId: record.chapterId ?? null,
            chapter: record.chapter,
            exerciseId: record.exerciseId ?? null,
            exercise: record.exercise ?? "",
            startNumber: record.startNumber,
            minutes: record.durationMinutes ?? 30,
            testMode: record.testMode === "random" ? "random" : "standard",
            marking: { ...record.marking },
            questionCount: record.answers.length,
            maxQuestions: record.answers.length,
            questions: record.questions,
            questionIds: record.questionIds ?? record.questions.map((question) => question.id),
            questionNumbers:
              record.questionNumbers ??
              record.questions.map(
                (question, index) => question.number ?? record.startNumber + index,
              ),
            answerKey: record.answerKey,
            darkMode: false,
          }
        : null;
    setReplay(record);
    setConfig(replayConfig);
    setAnswerKey(replayConfig?.answerKey ?? null);
    setPhase(replayConfig ? "instructions" : "setup");
    setReplayLoaded(true);
  }, [search.attempt, user]);
  if (!sessionLoaded)
    return (
      <AppShell title="Loading test">
        <p>Loading test…</p>
      </AppShell>
    );
  if (search.attempt && !replayLoaded)
    return (
      <AppShell title="Loading saved paper">
        <p>Loading saved paper…</p>
      </AppShell>
    );
  if (search.attempt && !session && (!replay || !config))
    return (
      <AppShell title="Saved paper unavailable">
        <p>This attempt has no complete saved question paper.</p>
        <Link to="/history">Back to history</Link>
      </AppShell>
    );

  const handleSubmit = (answers: (Option | null)[], timeTakenSeconds: number) => {
    if (!config) return;
    const key = answerKey?.slice(0, answers.length) ?? null;
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
      id: session?.id ?? newDocumentId("test"),
      date: new Date().toISOString(),
      testMode: config.testMode,
      ...(config.testMode === "random"
        ? { attemptGroupId: replay?.attemptGroupId ?? replay?.id ?? newDocumentId("attempt-group") }
        : {}),
      ...(config.subjectId ? { subjectId: config.subjectId } : {}),
      subject: config.subject,
      ...(config.chapterId ? { chapterId: config.chapterId } : {}),
      chapter: config.chapter,
      ...(config.exercise ? { exercise: config.exercise } : {}),
      ...(config.exerciseId ? { exerciseId: config.exerciseId } : {}),
      startNumber: config.startNumber,
      durationMinutes: config.minutes,
      timeTakenSeconds,
      answers,
      ...(config.questionNumbers
        ? { questionNumbers: config.questionNumbers.slice(0, answers.length) }
        : {}),
      ...(config.questionIds ? { questionIds: config.questionIds.slice(0, answers.length) } : {}),
      ...(key ? { answerKey: key } : {}),
      ...(config.questions
        ? { questions: snapshotQuestionPaper(config.questions, answers.length) }
        : {}),
      ...(evaluations ? { evaluations } : {}),
      correct,
      wrong,
      marking: config.marking,
      score: computeScore(correct, wrong, config.marking),
    };
    saveRecord(saved);
    if (!getRecord(saved.id))
      throw new Error("Could not save test result locally. Please try again.");
    clearActiveTest();
    void navigate({ to: "/history/$id", params: { id: saved.id } });
  };

  if (phase === "test" && config) {
    return (
      <TestScreen
        initialProgress={session}
        onProgress={checkpoint}
        minutes={config.minutes}
        startNumber={config.startNumber}
        subject={config.subject}
        chapter={config.exercise ? `${config.chapter} · ${config.exercise}` : config.chapter}
        questionCount={config.questionCount}
        maxQuestions={config.maxQuestions}
        questions={config.questions}
        questionNumbers={config.questionNumbers}
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
        className="app-page-enter exam-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-3 py-3 text-zinc-100 sm:-mx-6 sm:px-5 sm:py-4"
      >
        {phase === "setup" && (
          <div className="mx-auto mb-2 flex max-w-5xl justify-end gap-1">
            <Link
              to="/quick-recall"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <Sparkles className="h-3.5 w-3.5" /> Quick recall
            </Link>
            <Link
              to="/question-bank"
              className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              Question bank
            </Link>
            <Link
              to="/history"
              className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              Previous sessions
            </Link>
          </div>
        )}
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
              replay
                ? void navigate({ to: "/history/$id", params: { id: replay.id } })
                : setPhase(config.answerKey ? "setup" : config.questionCount ? "key" : "setup")
            }
            onStart={(darkMode) => {
              const nextConfig = { ...config, darkMode };
              const nextSession: WebTestSession = {
                version: 1,
                platform: "web",
                id: newDocumentId("test"),
                payload: { config: nextConfig, answerKey, replay },
                states: Array.from({ length: config.questionCount || 1 }, (_, index) => ({
                  answer: null,
                  visited: index === 0,
                  marked: false,
                })),
                current: 0,
                remaining: config.minutes * 60,
              };
              saveActiveTest(nextSession);
              setSession(nextSession);
              setConfig(nextConfig);
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
