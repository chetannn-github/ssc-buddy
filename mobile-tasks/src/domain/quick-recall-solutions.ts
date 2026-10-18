export type RecallQuestionInput = {
  id: string;
  correctAnswer: string;
  question?: string;
  options?: readonly string[];
  explanation?: string;
};
export type RecallQuestionSnapshot = {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: "A" | "B" | "C" | "D";
  explanation?: string;
};
type RecallRecord = {
  answers: unknown[];
  questionIds?: string[] | undefined;
  questions?: RecallQuestionInput[] | undefined;
  quickRecallQuestions?: Record<string, RecallQuestionSnapshot>;
};

function snapshot(question?: RecallQuestionInput): RecallQuestionSnapshot | undefined {
  if (
    !question ||
    typeof question.question !== "string" ||
    !Array.isArray(question.options) ||
    question.options.length !== 4 ||
    !question.options.every((option) => typeof option === "string") ||
    !["A", "B", "C", "D"].includes(question.correctAnswer)
  )
    return undefined;
  return {
    id: question.id,
    question: question.question,
    options: [...question.options] as RecallQuestionSnapshot["options"],
    correctAnswer: question.correctAnswer as RecallQuestionSnapshot["correctAnswer"],
    ...(typeof question.explanation === "string" ? { explanation: question.explanation } : {}),
  };
}

/** Index by answer position so older answers without text never shift newer snapshots. */
export function appendRecallQuestionSnapshots(
  record: Partial<RecallRecord>,
  questions: RecallQuestionInput[],
) {
  const saved = { ...record.quickRecallQuestions };
  const offset = Array.isArray(record.answers) ? record.answers.length : 0;
  questions.forEach((question, index) => {
    const next = snapshot(question);
    if (next) saved[String(offset + index)] = next;
  });
  return saved;
}

/** Recover legacy text from the bank only when its ID identifies one question. */
export function resolveRecallQuestions(
  record: RecallRecord,
  subjects: Array<{
    chapters: Array<{ exercises: Array<{ questions?: RecallQuestionInput[] | undefined }> }>;
  }>,
) {
  const byId = new Map<string, RecallQuestionInput[]>();
  for (const subject of subjects)
    for (const chapter of subject.chapters)
      for (const exercise of chapter.exercises) {
        for (const question of exercise.questions ?? []) {
          byId.set(question.id, [...(byId.get(question.id) ?? []), question]);
        }
      }
  return record.answers.map((_, index) => {
    const saved =
      snapshot(record.quickRecallQuestions?.[String(index)]) ?? snapshot(record.questions?.[index]);
    if (saved) return saved;
    const candidates = byId.get(record.questionIds?.[index] ?? "") ?? [];
    return candidates.length === 1 ? snapshot(candidates[0]) : undefined;
  });
}
