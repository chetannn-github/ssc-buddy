import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirebaseAuth, loadQuickRecallSeed } from "../lib/firebase";

export type QuizChoice = "A" | "B" | "C" | "D";
export type UnlockQuestion = {
  id: string;
  subjectId: string;
  subject: string;
  chapter: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: QuizChoice;
  explanation?: string;
};
export type QuickRecallScope = { subjectId: string; chapter: string };
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
const accuracyPriority = (stat?: LearningStat) => !stat?.askedCount ? 0 : (1 - stat.correctCount / stat.askedCount) * 25;

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
        id: String(item.id), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), chapter: String(chapter.name ?? "Practice"),
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

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

/** Builds a 3-question same-subject session, favouring favourites and earlier mistakes. */
export async function startUnlockQuiz(scope: QuickRecallScope = { subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE }): Promise<UnlockQuizState | null> {
  const local = await asQuestions();
  const user = getFirebaseAuth().currentUser;
  const remote = user ? await loadQuickRecallSeed(user).catch(() => null) : null;
  const source = remote ? toQuestionSource(remote) : local;
  const { questions, favourites, practice } = source;
  if (!questions.length) return null;
  const old = await loadUnlockQuiz();
  const stats = (remote?.stats as unknown as Record<string, LearningStat> | undefined) ?? old?.stats ?? {};
  const scopedQuestions = questions.filter((item) => (scope.subjectId === RANDOM_RECALL_SCOPE || item.subjectId === scope.subjectId) && (scope.chapter === RANDOM_RECALL_SCOPE || item.chapter === scope.chapter));
  if (!scopedQuestions.length) return null;
  const allSubjects = [...new Set(scopedQuestions.map((item) => item.subjectId))];
  // A full unlock sprint must remain within one subject. Prefer only subjects
  // with at least three question-bank questions; fall back gracefully while a
  // new bank is still being built.
  const subjects = allSubjects.filter((id) => scopedQuestions.filter((item) => item.subjectId === id).length >= 3);
  const eligibleSubjects = subjects.length ? subjects : allSubjects;
  const subjectId = eligibleSubjects
    .map((id) => {
      const items = scopedQuestions.filter((item) => item.subjectId === id);
      const score = items.reduce((total, item) => {
        const stat = stats[questionKey(item)];
        const normal = practice.get(questionKey(item)); const askedCount = (normal?.askedCount ?? 0) + (stat?.askedCount ?? 0); const correctCount = (normal?.correctCount ?? 0) + (stat?.correctCount ?? 0);
        return total + (favourites.has(item.id) ? 24 : 0) + (normal?.wrongCount ?? 0) * 16 + (stat?.wrongCount ?? 0) * 8 + accuracyPriority({ askedCount, correctCount, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" }) - askedCount * 1.5;
      }, 0);
      return { id, score: score + Math.random() * 4 };
    })
    .sort((a, b) => b.score - a.score)[0]?.id;
  const pool = scopedQuestions.filter((item) => item.subjectId === subjectId);
  const ordered = shuffle(pool).sort((left, right) => {
    const leftStat = stats[questionKey(left)];
    const rightStat = stats[questionKey(right)];
    const leftNormal = practice.get(questionKey(left)); const rightNormal = practice.get(questionKey(right));
    const leftAsked = (leftNormal?.askedCount ?? 0) + (leftStat?.askedCount ?? 0); const rightAsked = (rightNormal?.askedCount ?? 0) + (rightStat?.askedCount ?? 0);
    const leftCorrect = (leftNormal?.correctCount ?? 0) + (leftStat?.correctCount ?? 0); const rightCorrect = (rightNormal?.correctCount ?? 0) + (rightStat?.correctCount ?? 0);
    const leftScore = (favourites.has(left.id) ? 1000 : 0) + (leftNormal?.wrongCount ?? 0) * 100 + (leftStat?.wrongCount ?? 0) * 50 + accuracyPriority({ askedCount: leftAsked, correctCount: leftCorrect, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" }) - leftAsked;
    const rightScore = (favourites.has(right.id) ? 1000 : 0) + (rightNormal?.wrongCount ?? 0) * 100 + (rightStat?.wrongCount ?? 0) * 50 + accuracyPriority({ askedCount: rightAsked, correctCount: rightCorrect, wrongCount: 0, lastAskedAt: "", lastOutcome: "correct" }) - rightAsked;
    return rightScore - leftScore;
  });
  const selected = ordered.slice(0, Math.min(3, ordered.length));
  return save({ runId: makeRunId(), startedAt: new Date().toISOString(), status: "active", subject: selected[0]?.subject ?? "General", questions: selected, index: 0, correct: 0, answers: [], stats });
}

function toQuestionSource(seed: Awaited<ReturnType<typeof loadQuickRecallSeed>>) {
  const questions: UnlockQuestion[] = [];
  seed.subjects.forEach((subject: any) => subject?.chapters?.forEach((chapter: any) => chapter?.exercises?.forEach((exercise: any) => exercise?.questions?.forEach((item: any) => {
    if (!item?.id || !item?.question || !Array.isArray(item?.options) || item.options.length !== 4 || !isChoice(item?.correctAnswer)) return;
    questions.push({ id: String(item.id), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), chapter: String(chapter?.name ?? "Practice"), question: String(item.question), options: item.options as [string, string, string, string], correctAnswer: item.correctAnswer, explanation: typeof item.explanation === "string" ? item.explanation : "" });
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
