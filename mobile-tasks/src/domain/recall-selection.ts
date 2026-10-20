/** Shared by web, Android and the Windows widget. */
export type RecallLearning = {
  askedCount: number;
  correctCount: number;
  wrongCount: number;
  lastAskedAt: string;
  lastOutcome: "correct" | "wrong";
};

type Performance = Pick<RecallLearning, "askedCount" | "correctCount" | "wrongCount">;
type Question = { id: string; subjectId: string };

export const ALL_RECALL_EXERCISES = "all";
export const RECALL_QUESTION_COUNTS = [3, 5, 10] as const;
export type RecallQuestionCount = typeof RECALL_QUESTION_COUNTS[number];
export type RecallFilterScope = { subjectId: string; chapter: string; exerciseId?: string };

/** An omitted exercise keeps older widgets/saved scopes on all exercises. */
export function filterRecallScope<T extends Question & { chapter: string; exerciseId: string }>(
  questions: T[],
  scope: RecallFilterScope,
): T[] {
  return questions.filter(
    (question) =>
      (scope.subjectId === "random" || question.subjectId === scope.subjectId) &&
      (scope.chapter === "random" || question.chapter === scope.chapter) &&
      (!scope.exerciseId ||
        scope.exerciseId === ALL_RECALL_EXERCISES ||
        question.exerciseId === scope.exerciseId),
  );
}

/** Keep a just-answered question cooled down even before its cloud write arrives. */
export function mergeRecallLearning(
  remote: Record<string, RecallLearning>,
  local: Record<string, RecallLearning>,
): Record<string, RecallLearning> {
  const merged = { ...remote };
  for (const [key, value] of Object.entries(local)) {
    const previous = merged[key];
    if (!previous) {
      merged[key] = value;
      continue;
    }
    const latest = value.lastAskedAt > previous.lastAskedAt ? value : previous;
    merged[key] = {
      ...latest,
      askedCount: Math.max(previous.askedCount, value.askedCount),
      correctCount: Math.max(previous.correctCount, value.correctCount),
      wrongCount: Math.max(previous.wrongCount, value.wrongCount),
    };
  }
  return merged;
}

/**
 * Pick the requested number of distinct questions from one subject. Recent answers rank
 * behind every ready question: correct answers rest 30 minutes, mistakes 5.
 * When a small bank needs repeats, reuse the oldest answers first.
 */
export function selectRecallQuestions<T extends Question>(
  questions: T[],
  favourites: ReadonlySet<string>,
  learning: Record<string, RecallLearning>,
  practice: ReadonlyMap<string, Performance>,
  now = Date.now(),
  random: () => number = Math.random,
  questionCount: RecallQuestionCount = 3,
): T[] {
  const limit = RECALL_QUESTION_COUNTS.includes(questionCount) ? questionCount : 3;
  const unique = new Map(
    questions.map((question) => [`${question.subjectId}:${question.id}`, question]),
  );
  const ranked = [...unique.values()].map((question) => {
    const key = `${question.subjectId}:${question.id}`;
    const stat = learning[key];
    const normal = practice.get(key);
    const asked = Math.max(0, (stat?.askedCount ?? 0) + (normal?.askedCount ?? 0));
    const wrong = Math.max(0, (stat?.wrongCount ?? 0) + (normal?.wrongCount ?? 0));
    const lastAsked = Date.parse(stat?.lastAskedAt ?? "") || 0;
    const cooldown = (stat?.lastOutcome === "wrong" ? 5 : 30) * 60_000;
    const recent = lastAsked > 0 && now - lastAsked < cooldown;
    // Bounded weakness and a small favourite bonus prevent historical mistakes
    // or a star from permanently monopolising the next round.
    const score =
      (favourites.has(question.id) ? 6 : 0) +
      (asked ? Math.min(1, wrong / asked) * 24 : 12) -
      (stat?.lastOutcome === "correct" ? 6 : 0) -
      Math.min(10, Math.log2(asked + 1) * 2) +
      random() * 4;
    return { question, recent, lastAsked, score };
  });
  type Ranked = (typeof ranked)[number];
  const order = (a: Ranked, b: Ranked) =>
    Number(a.recent) - Number(b.recent) ||
    (a.recent && b.recent ? a.lastAsked - b.lastAsked : 0) ||
    b.score - a.score;
  const grouped = new Map<string, Ranked[]>();
  for (const item of ranked) {
    const group = grouped.get(item.question.subjectId) ?? [];
    group.push(item);
    grouped.set(item.question.subjectId, group);
  }
  const subjects = [...grouped.values()].map((items) => {
    items.sort(order);
    const ready = items.filter((item) => !item.recent);
    const top = items.slice(0, limit);
    return {
      items,
      ready: Math.min(limit, ready.length),
      size: Math.min(limit, items.length),
      oldest: Math.min(...top.map((item) => item.lastAsked)),
      score: top.reduce((sum, item) => sum + item.score, 0) / top.length,
    };
  });
  subjects.sort(
    (a, b) =>
      b.ready - a.ready ||
      b.size - a.size ||
      (a.ready === 0 && b.ready === 0 ? a.oldest - b.oldest : 0) ||
      b.score - a.score,
  );
  return subjects[0]?.items.slice(0, limit).map((item) => item.question) ?? [];
}
