import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirebaseAuth, loadQuickRecallSeed } from "../lib/firebase";
import { mergeRecallLearning, filterRecallScope, selectRecallQuestions } from "./recall-selection";

export type QuizChoice = "A" | "B" | "C" | "D";
export type UnlockQuestion = {
  id: string;
  subjectId: string;
  subject: string;
  chapter: string;
  exerciseId: string;
  exercise: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: QuizChoice;
  explanation?: string;
};
export type QuickRecallScope = { subjectId: string; chapter: string; exerciseId?: string };
export const RANDOM_RECALL_SCOPE = "random";

type LearningStat = { askedCount: number; correctCount: number; wrongCount: number; lastAskedAt: string; lastOutcome: "correct" | "wrong" };
type PracticePerformance = { askedCount: number; correctCount: number; wrongCount: number };
export type UnlockQuizState = {
  /** Stable for one three-question sprint; used to make its cloud write idempotent. */
  runId: string;
  startedAt: string;
  status: "active" | "correction" | "review" | "complete";
  subject: string;
  questions: UnlockQuestion[];
  index: number;
  correct: number;
  selected?: QuizChoice;
  answers: QuizChoice[];
  lockedUntil?: number;
  stats: Record<string, LearningStat>;
};

const STORE = "ssc-buddy:unlock-quiz:v1";
const SUBJECTS = "cbt-subjects";
const HISTORY = "cbt-history";
const FAVOURITES = "cbt-favorite-questions";
const choices: QuizChoice[] = ["A", "B", "C", "D"];
/** Keep every Quick Recall surface on the same correction pause. */
export const QUICK_RECALL_CORRECTION_MS = 10_000;
const makeRunId = () => `quick-recall-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isChoice = (value: unknown): value is QuizChoice => typeof value === "string" && choices.includes(value as QuizChoice);
const questionKey = (question: Pick<UnlockQuestion, "subjectId" | "id">) => `${question.subjectId}:${question.id}`;

function practiceStats(records: any[]) {
  const performance = new Map<string, PracticePerformance>();
  records.forEach((record) => {
    // Quick Recall has its own atomic learning entry, so do not double-count it.
    if (record?.testMode === "quick-recall") return;
    const ids = Array.isArray(record?.questionIds) ? record.questionIds : [];
    const answers = Array.isArray(record?.answers) ? record.answers : [];
    const key = Array.isArray(record?.answerKey) ? record.answerKey : Array.isArray(record?.key) ? record.key : [];
    const subjectId = String(record?.subjectId ?? "");
    ids.forEach((id: unknown, index: number) => {
      if (typeof id !== "string" || !isChoice(answers[index]) || !isChoice(key[index])) return;
      const itemKey = `${subjectId}:${id}`;
      const prior = performance.get(itemKey) ?? { askedCount: 0, correctCount: 0, wrongCount: 0 };
      prior.askedCount += 1;
      if (answers[index] === key[index]) prior.correctCount += 1;
      else prior.wrongCount += 1;
      performance.set(itemKey, prior);
    });
  });
  return performance;
}

function asQuestions() {
  return Promise.all([AsyncStorage.getItem(SUBJECTS), AsyncStorage.getItem(HISTORY), AsyncStorage.getItem(FAVOURITES)]).then(([rawSubjects, rawHistory, rawFavourites]) => {
    let subjects: any[] = [], history: any[] = [], favourites: string[] = [];
    try { subjects = JSON.parse(rawSubjects ?? "[]"); } catch {}
    try { history = JSON.parse(rawHistory ?? "[]"); } catch {}
    try { favourites = JSON.parse(rawFavourites ?? "[]"); } catch {}
    const questions: UnlockQuestion[] = [];
    subjects.forEach((subject) => subject?.chapters?.forEach((chapter: any) => chapter?.exercises?.forEach((exercise: any) => exercise?.questions?.forEach((item: any, index: number) => {
      const answer = item?.correctAnswer;
      if (!item?.id || !item?.question || !Array.isArray(item?.options) || item.options.length !== 4 || !isChoice(answer)) return;
      questions.push({
        id: String(item.id), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), chapter: String(chapter.name ?? "Practice"), exerciseId: String(exercise.id ?? exercise.name ?? "Exercise 1"), exercise: String(exercise.name ?? "Exercise 1"),
        question: String(item.question), options: item.options as [string, string, string, string], correctAnswer: answer, explanation: typeof item.explanation === "string" ? item.explanation : "",
      });
    }))));
    return { questions, favourites: new Set(favourites), practice: practiceStats(history) };
  });
}

export async function loadUnlockQuiz(): Promise<UnlockQuizState | null> {
  try { return JSON.parse((await AsyncStorage.getItem(STORE)) ?? "null") as UnlockQuizState | null; } catch { return null; }
}

async function save(state: UnlockQuizState) { await AsyncStorage.setItem(STORE, JSON.stringify(state)); return state; }

/** Builds a balanced same-subject session, cooling down recent answers. */
export async function startUnlockQuiz(scope: QuickRecallScope = { subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE }): Promise<UnlockQuizState | null> {
  const local = await asQuestions();
  const user = getFirebaseAuth().currentUser;
  const remote = user ? await loadQuickRecallSeed(user).catch(() => null) : null;
  const source = remote ? toQuestionSource(remote) : local;
  const { questions, favourites, practice } = source;
  if (!questions.length) return null;
  const old = await loadUnlockQuiz();
  const stats = mergeRecallLearning((remote?.stats ?? {}) as Record<string, LearningStat>, old?.stats ?? {});
  const scopedQuestions = filterRecallScope(questions, scope);
  if (!scopedQuestions.length) return null;
  const selected = selectRecallQuestions(scopedQuestions, favourites, stats, practice);
  return save({ runId: makeRunId(), startedAt: new Date().toISOString(), status: "active", subject: selected[0]?.subject ?? "General", questions: selected, index: 0, correct: 0, answers: [], stats });
}

function toQuestionSource(seed: Awaited<ReturnType<typeof loadQuickRecallSeed>>) {
  const questions: UnlockQuestion[] = [];
  seed.subjects.forEach((subject: any) => subject?.chapters?.forEach((chapter: any) => chapter?.exercises?.forEach((exercise: any) => exercise?.questions?.forEach((item: any) => {
    if (!item?.id || !item?.question || !Array.isArray(item?.options) || item.options.length !== 4 || !isChoice(item?.correctAnswer)) return;
    questions.push({ id: String(item.id), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), chapter: String(chapter?.name ?? "Practice"), exerciseId: String(exercise.id ?? exercise.name ?? "Exercise 1"), exercise: String(exercise.name ?? "Exercise 1"), question: String(item.question), options: item.options as [string, string, string, string], correctAnswer: item.correctAnswer, explanation: typeof item.explanation === "string" ? item.explanation : "" });
  }))));
  return { questions, favourites: new Set(seed.favourites), practice: practiceStats(seed.attempts) };
}

export async function getUnlockQuiz(): Promise<UnlockQuizState | null> {
  const current = await loadUnlockQuiz();
  if (!current || current.status === "complete") return startUnlockQuiz();
  // Upgrade an interrupted pre-activity sprint without throwing away it answers.
  if (!current.runId || !current.startedAt || !Array.isArray(current.answers)) {
    current.runId ||= makeRunId();
    current.startedAt ||= new Date().toISOString();
    current.answers ||= [];
    await save(current);
  }
  return current;
}

export async function answerUnlockQuiz(choice: QuizChoice): Promise<UnlockQuizState | null> {
  const state = await loadUnlockQuiz();
  if (!state || state.status !== "active") return state;
  const question = state.questions[state.index];
  if (!question) return state;
  const key = questionKey(question);
  const stat = state.stats[key] ?? { askedCount: 0, correctCount: 0, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" as const };
  stat.askedCount += 1;
  stat.lastAskedAt = new Date().toISOString();
  state.stats[key] = stat;
  state.selected = choice;
  state.answers = [...(state.answers ?? []), choice];
  if (choice === question.correctAnswer) {
    stat.correctCount += 1; stat.lastOutcome = "correct"; state.correct += 1;
    state.status = "review";
    state.lockedUntil = undefined;
  } else {
    // Keep the correction visible, but do not make the unlock interaction feel
    // punitive. Every surface counts this down live for ten seconds.
    stat.wrongCount += 1; stat.lastOutcome = "wrong"; state.status = "correction"; state.lockedUntil = Date.now() + QUICK_RECALL_CORRECTION_MS;
  }
  return save(state);
}

export async function advanceUnlockQuiz(): Promise<UnlockQuizState | null> {
  const state = await loadUnlockQuiz();
  if (!state || state.status !== "review") return state;
  if (state.index + 1 >= state.questions.length) state.status = "complete";
  else { state.status = "active"; state.index += 1; state.selected = undefined; state.lockedUntil = undefined; }
  return save(state);
}

/** Makes a wrong-answer review actionable after its visible countdown ends. */
export async function releaseUnlockQuizReview(): Promise<UnlockQuizState | null> {
  const state = await loadUnlockQuiz();
  if (!state || state.status !== "correction" || (state.lockedUntil ?? 0) > Date.now()) return state;
  state.status = "review";
  state.lockedUntil = undefined;
  return save(state);
}
