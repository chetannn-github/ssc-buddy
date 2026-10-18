export const ALL_PRACTICE_EXERCISES = "__all_question_exercises__";
export const ALL_PRACTICE_EXERCISES_LABEL = "All exercises";

/** A temporary paper source; never persist it as a real editable exercise. */
export function combineQuestionExercises<T extends { id: string; correctAnswer: string }>(
  exercises: Array<{ questions?: T[] | undefined }>,
) {
  const questions = exercises
    .flatMap((exercise) => exercise.questions ?? [])
    .map((question, index) => ({ ...question, number: index + 1 }));
  if (!questions.length) return null;
  return {
    id: ALL_PRACTICE_EXERCISES,
    name: ALL_PRACTICE_EXERCISES_LABEL,
    questionCount: questions.length,
    answerKey: questions.map((question): T["correctAnswer"] => question.correctAnswer),
    questions,
  };
}

/** Count-only mixed papers sample the whole pool without replacing questions. */
export function samplePracticeQuestions<T>(
  questions: T[],
  count: number,
  random = Math.random,
): T[] {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  const target = Number.isFinite(count) ? Math.max(1, Math.min(500, Math.floor(count))) : 1;
  return shuffled.slice(0, target);
}
