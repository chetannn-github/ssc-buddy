import type { QuickRecallSeed } from "./firebase";

export type QuizChoice = "A" | "B" | "C" | "D";
export type QuickRecallQuestion = {
  id: string;
  subjectId: string;
  subject: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: QuizChoice;
  explanation?: string;
};
export type QuickRecallSession = { subject: string; questions: QuickRecallQuestion[] };

const choices: QuizChoice[] = ["A", "B", "C", "D"];
const isChoice = (value: unknown): value is QuizChoice => typeof value === "string" && choices.includes(value as QuizChoice);
const questionKey = (question: Pick<QuickRecallQuestion, "subjectId" | "id">) => `${question.subjectId}:${question.id}`;

/** Same three-question, one-subject priority used by the Android Quick Recall widget. */
export function createQuickRecallSession(seed: QuickRecallSeed): QuickRecallSession | null {
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
            id: String(record.id ?? index), subjectId: String(subject.id ?? subject.name ?? "general"), subject: String(subject.name ?? "General"), question: String(record.question),
            options: record.options.map(String) as [string, string, string, string], correctAnswer: record.correctAnswer,
            explanation: typeof record.explanation === "string" ? record.explanation : undefined,
          });
        });
      });
    });
  });
  if (!questions.length) return null;

  const wrongs = new Map<string, number>();
  (seed.attempts as Array<Record<string, unknown>>).forEach((attempt) => {
    const ids = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
    const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
    const key = Array.isArray(attempt.answerKey) ? attempt.answerKey : Array.isArray(attempt.key) ? attempt.key : [];
    const subjectId = String(attempt.subjectId ?? "");
    ids.forEach((id, index) => {
      if (typeof id !== "string" || !isChoice(answers[index]) || !isChoice(key[index]) || answers[index] === key[index]) return;
      const statKey = `${subjectId}:${id}`;
      wrongs.set(statKey, (wrongs.get(statKey) ?? 0) + 1);
    });
  });
  const favourites = new Set(seed.favouriteQuestionIds);
  const learning = seed.learningStats ?? {};
  const subjectIds = [...new Set(questions.map((item) => item.subjectId))];
  const eligible = subjectIds.filter((id) => questions.filter((item) => item.subjectId === id).length >= 3);
  const subjectId = (eligible.length ? eligible : subjectIds)
    .map((id) => ({ id, score: questions.filter((item) => item.subjectId === id).reduce((total, item) => { const stat = learning[questionKey(item)]; return total + (favourites.has(item.id) ? 24 : 0) + (wrongs.get(questionKey(item)) ?? 0) * 16 + (stat?.wrongCount ?? 0) * 8 - (stat?.askedCount ?? 0) * 1.5; }, 0) + Math.random() * 4 }))
    .sort((left, right) => right.score - left.score)[0]?.id;
  const selected = questions.filter((item) => item.subjectId === subjectId).sort((left, right) => {
    const score = (item: QuickRecallQuestion) => { const stat = learning[questionKey(item)]; return (favourites.has(item.id) ? 1000 : 0) + (wrongs.get(questionKey(item)) ?? 0) * 100 + (stat?.wrongCount ?? 0) * 50 - (stat?.askedCount ?? 0) + Math.random() * 3; };
    return score(right) - score(left);
  }).slice(0, 3);
  return selected.length ? { subject: selected[0].subject, questions: selected } : null;
}
