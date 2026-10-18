import type { QuickRecallSeed } from "./firebase";
import { filterRecallScope, selectRecallQuestions } from "../../../mobile-tasks/src/domain/recall-selection";

export type QuizChoice = "A" | "B" | "C" | "D";
export type QuickRecallQuestion = {
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
export type QuickRecallSession = { runId: string; startedAt: string; subject: string; chapter: string; questions: QuickRecallQuestion[] };
export type QuickRecallScope = { subjectId: string; chapter: string; exerciseId?: string };
export const RANDOM_RECALL_SCOPE = "random";
const makeRunId = () => `quick-recall-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`;

const choices: QuizChoice[] = ["A", "B", "C", "D"];
const isChoice = (value: unknown): value is QuizChoice => typeof value === "string" && choices.includes(value as QuizChoice);
type PracticePerformance = { askedCount: number; correctCount: number; wrongCount: number };

/** Same balanced three-question selection used by web and Android. */
export function createQuickRecallSession(seed: QuickRecallSeed, scope: QuickRecallScope = { subjectId: RANDOM_RECALL_SCOPE, chapter: RANDOM_RECALL_SCOPE }): QuickRecallSession | null {
  const questions: QuickRecallQuestion[] = [];
  (seed.subjects as Array<Record<string, unknown>>).forEach((subject) => {
    const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
    chapters.forEach((chapter) => {
      const exercises = chapter && typeof chapter === "object" && Array.isArray((chapter as Record<string, unknown>).exercises) ? (chapter as Record<string, unknown>).exercises as Array<Record<string, unknown>> : [];
      exercises.forEach((exercise) => {
        const items = Array.isArray(exercise.questions) ? exercise.questions : [];
        items.forEach((item, index) => {
          if (!item || typeof item !== "object") return;
          const record = item as Record<string, unknown>;
          if (!record.id || !record.question || !Array.isArray(record.options) || record.options.length !== 4 || !isChoice(record.correctAnswer)) return;
          questions.push({
            id: String(record.id ?? index), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), chapter: String((chapter as Record<string, unknown>).name ?? "Practice"), exerciseId: String(exercise.id ?? exercise.name ?? "Exercise 1"), exercise: String(exercise.name ?? "Exercise 1"), question: String(record.question),
            options: record.options.map(String) as [string, string, string, string], correctAnswer: record.correctAnswer,
            explanation: typeof record.explanation === "string" ? record.explanation : undefined,
          });
        });
      });
    });
  });
  const scopedQuestions = filterRecallScope(questions, scope);
  if (!scopedQuestions.length) return null;

  const practice = new Map<string, PracticePerformance>();
  (seed.attempts as Array<Record<string, unknown>>).forEach((attempt) => {
    if (attempt.testMode === "quick-recall") return;
    const ids = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    const key = Array.isArray(attempt.answerKey) ? attempt.answerKey : Array.isArray(attempt.key) ? attempt.key : [];
    const subjectId = String(attempt.subjectId ?? "");
    ids.forEach((id, index) => {
      if (typeof id !== "string" || !isChoice(answers[index]) || !isChoice(key[index])) return;
      const statKey = `${subjectId}:${id}`;
      const prior = practice.get(statKey) ?? { askedCount: 0, correctCount: 0, wrongCount: 0 };
      prior.askedCount += 1;
      if (answers[index] === key[index]) prior.correctCount += 1;
      else prior.wrongCount += 1;
      practice.set(statKey, prior);
    });
  });
  const favourites = new Set(seed.favouriteQuestionIds);
  const learning = seed.learningStats ?? {};
  const selected = selectRecallQuestions(scopedQuestions, favourites, learning, practice);
  return selected.length ? { runId: makeRunId(), startedAt: new Date().toISOString(), subject: selected[0].subject, chapter: selected[0].chapter, questions: selected } : null;
}
