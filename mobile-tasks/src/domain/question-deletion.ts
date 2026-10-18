type BankQuestion = { id: string; correctAnswer: string; number?: number };
type BankSubject = {
  id: string;
  deletedQuestionIds?: string[];
  chapters: Array<{ exercises: Array<{ id: string; questions?: BankQuestion[] | undefined }> }>;
};

/** Exercise-scoped tombstones survive stale/offline bank uploads. */
export const deletedQuestionKey = (exerciseId: string, questionId: string) =>
  JSON.stringify([exerciseId, questionId]);

export function applyQuestionDeletions<T extends BankSubject>(subject: T): T {
  const deleted = new Set(subject.deletedQuestionIds ?? []);
  if (!deleted.size) return subject;
  return {
    ...subject,
    chapters: subject.chapters.map((chapter) => ({
      ...chapter,
      exercises: chapter.exercises.map((exercise) => {
        if (!exercise.questions) return exercise;
        const remaining = exercise.questions.filter(
          (question) => !deleted.has(deletedQuestionKey(exercise.id, question.id)),
        );
        if (remaining.length === exercise.questions.length) return exercise;
        const questions = remaining.map((question, index) => ({ ...question, number: index + 1 }));
        return { ...exercise, questions, questionCount: questions.length, answerKey: questions.map((question) => question.correctAnswer) };
      }),
    })),
  } as T;
}

export function mergeQuestionDeletions<T extends BankSubject>(incoming: T, remote?: { deletedQuestionIds?: string[] }): T {
  const deletedQuestionIds = [...new Set([...(remote?.deletedQuestionIds ?? []), ...(incoming.deletedQuestionIds ?? [])])];
  return applyQuestionDeletions({ ...incoming, ...(deletedQuestionIds.length ? { deletedQuestionIds } : {}) });
}

export function removeBankQuestion<T extends BankSubject>(subject: T, exerciseId: string, questionId: string): T {
  const exists = subject.chapters.some((chapter) => chapter.exercises.some(
    (exercise) => exercise.id === exerciseId && exercise.questions?.some((question) => question.id === questionId),
  ));
  if (!exists) return subject;
  return mergeQuestionDeletions({ ...subject, deletedQuestionIds: [...(subject.deletedQuestionIds ?? []), deletedQuestionKey(exerciseId, questionId)] });
}

export const isQuestionAttempt = (record: { questions?: unknown[] | undefined; questionIds?: string[]; testMode?: string }) =>
  Boolean(record.questions?.length || record.questionIds?.length || record.testMode === "quick-recall");

export function snapshotQuestionPaper<T extends { options: readonly string[] }>(questions: T[], count = questions.length): T[] {
  return questions.slice(0, count).map((question) => ({ ...question, options: [...question.options] })) as T[];
}

/** Keep answered history, dropping only unanswered questions explicitly deleted from the bank. */
export function pruneDeletedRecall<T extends { id: string; subjectId: string; exerciseId: string }>(
  questions: T[], protectedCount: number, subjects: Array<{ id: string; deletedQuestionIds?: string[] }>,
): T[] {
  const deleted = new Map(subjects.map((subject) => [subject.id, new Set(subject.deletedQuestionIds ?? [])]));
  return questions.filter((question, index) => index < protectedCount || !deleted.get(question.subjectId)?.has(deletedQuestionKey(question.exerciseId, question.id)));
}
