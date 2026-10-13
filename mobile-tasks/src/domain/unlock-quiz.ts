import AsyncStorage from "@react-native-async-storage/async-storage";

export type QuizChoice = "A" | "B" | "C" | "D";
export type UnlockQuestion = {
  id: string;
  subjectId: string;
  subject: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: QuizChoice;
  explanation?: string;
};

type LearningStat = { askedCount: number; correctCount: number; wrongCount: number; lastAskedAt: string; lastOutcome: "correct" | "wrong" };
export type UnlockQuizState = {
  /** Stable for one three-question sprint; used to make its cloud write idempotent. */
  runId: string;
  startedAt: string;
  status: "active" | "correction" | "complete";
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
const makeRunId = () => `quick-recall-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isChoice = (value: unknown): value is QuizChoice => typeof value === "string" && choices.includes(value as QuizChoice);
const questionKey = (question: Pick<UnlockQuestion, "subjectId" | "id">) => `${question.subjectId}:${question.id}`;

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
        id: String(item.id), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"),
        question: String(item.question), options: item.options as [string, string, string, string], correctAnswer: answer, explanation: typeof item.explanation === "string" ? item.explanation : "",
      });
    }))));
    const wrongs = new Map<string, number>();
    history.forEach((record) => {
      const ids = Array.isArray(record?.questionIds) ? record.questionIds : [];
      const answers = Array.isArray(record?.answers) ? record.answers : [];
      const key = Array.isArray(record?.answerKey) ? record.answerKey : Array.isArray(record?.key) ? record.key : [];
      const subjectId = String(record?.subjectId ?? "");
      ids.forEach((id: unknown, index: number) => {
        if (typeof id !== "string" || !isChoice(answers[index]) || !isChoice(key[index]) || answers[index] === key[index]) return;
        const statKey = `${subjectId}:${id}`;
        wrongs.set(statKey, (wrongs.get(statKey) ?? 0) + 1);
      });
    });
    return { questions, favourites: new Set(favourites), wrongs };
  });
}

export async function loadUnlockQuiz(): Promise<UnlockQuizState | null> {
  try { return JSON.parse((await AsyncStorage.getItem(STORE)) ?? "null") as UnlockQuizState | null; } catch { return null; }
}

async function save(state: UnlockQuizState) { await AsyncStorage.setItem(STORE, JSON.stringify(state)); return state; }

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

/** Builds a 3-question same-subject session, favouring favourites and earlier mistakes. */
export async function startUnlockQuiz(): Promise<UnlockQuizState | null> {
  const { questions, favourites, wrongs } = await asQuestions();
  if (!questions.length) return null;
  const old = await loadUnlockQuiz();
  const stats = old?.stats ?? {};
  const allSubjects = [...new Set(questions.map((item) => item.subjectId))];
  // A full unlock sprint must remain within one subject. Prefer only subjects
  // with at least three question-bank questions; fall back gracefully while a
  // new bank is still being built.
  const subjects = allSubjects.filter((id) => questions.filter((item) => item.subjectId === id).length >= 3);
  const eligibleSubjects = subjects.length ? subjects : allSubjects;
  const subjectId = eligibleSubjects
    .map((id) => {
      const items = questions.filter((item) => item.subjectId === id);
      const score = items.reduce((total, item) => {
        const stat = stats[questionKey(item)];
        return total + (favourites.has(item.id) ? 24 : 0) + (wrongs.get(questionKey(item)) ?? 0) * 16 + (stat?.wrongCount ?? 0) * 8 - (stat?.askedCount ?? 0) * 1.5;
      }, 0);
      return { id, score: score + Math.random() * 4 };
    })
    .sort((a, b) => b.score - a.score)[0]?.id;
  const pool = questions.filter((item) => item.subjectId === subjectId);
  const ordered = shuffle(pool).sort((left, right) => {
    const leftScore = (favourites.has(left.id) ? 1000 : 0) + (wrongs.get(questionKey(left)) ?? 0) * 100 + (stats[questionKey(left)]?.wrongCount ?? 0) * 50 - (stats[questionKey(left)]?.askedCount ?? 0);
    const rightScore = (favourites.has(right.id) ? 1000 : 0) + (wrongs.get(questionKey(right)) ?? 0) * 100 + (stats[questionKey(right)]?.wrongCount ?? 0) * 50 - (stats[questionKey(right)]?.askedCount ?? 0);
    return rightScore - leftScore;
  });
  const selected = ordered.slice(0, Math.min(3, ordered.length));
  return save({ runId: makeRunId(), startedAt: new Date().toISOString(), status: "active", subject: selected[0]?.subject ?? "General", questions: selected, index: 0, correct: 0, answers: [], stats });
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
    // The home-screen widget must stay one-tap simple. A correct choice moves
    // on immediately; Android widget taps are not reliable enough for a
    // second, mandatory Next interaction.
    if (state.index + 1 >= state.questions.length) state.status = "complete";
    else {
      state.status = "active";
      state.index += 1;
      state.selected = undefined;
      state.lockedUntil = undefined;
    }
  } else {
    // Keep the correction visible, but do not make the unlock interaction feel
    // punitive. The widget counts this down live for fifteen seconds.
    stat.wrongCount += 1; stat.lastOutcome = "wrong"; state.status = "correction"; state.lockedUntil = Date.now() + 15_000;
  }
  return save(state);
}

export async function advanceUnlockQuiz(): Promise<UnlockQuizState | null> {
  const state = await loadUnlockQuiz();
  if (!state || state.status !== "correction" || (state.lockedUntil ?? 0) > Date.now()) return state;
  if (state.index + 1 >= state.questions.length) state.status = "complete";
  else { state.status = "active"; state.index += 1; state.selected = undefined; state.lockedUntil = undefined; }
  return save(state);
}
