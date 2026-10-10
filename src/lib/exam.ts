export type Option = "A" | "B" | "C" | "D";

export type Verdict = "correct" | "incorrect" | null;

export type QuestionState = {
  answer: Option | null;
  marked: boolean;
  visited: boolean;
};

export type MarkingScheme = { positive: number; negative: number };

export type McqQuestion = {
  id: string;
  number?: number;
  question: string;
  options: [string, string, string, string];
  correctAnswer: Option;
  explanation?: string;
};

export type TestRecord = {
  id: string;
  date: string;
  testMode?: "standard" | "random";
  attemptGroupId?: string;
  subjectId?: string;
  subject: string;
  chapterId?: string;
  chapter: string;
  exercise?: string;
  exerciseId?: string;
  startNumber: number;
  durationMinutes: number | null;
  timeTakenSeconds: number;
  answers: (Option | null)[];
  questionNumbers?: number[];
  questionIds?: string[];
  answerKey?: (Option | null)[];
  questions?: McqQuestion[] | undefined;

  evaluations?: Verdict[];
  correct: number | null;
  wrong: number | null;
  marking: MarkingScheme;
  score: number | null;
};

export type Exercise = {
  id: string;
  name: string;
  questionCount: number | null;
  answerKey: (Option | null)[] | null;
  questions?: McqQuestion[] | undefined;
};

export type Chapter = {
  id: string;
  name: string;
  questionCount: number | null;
  answerKey: (Option | null)[] | null;
  exercises: Exercise[];
};

export type Subject = { id: string; name: string; chapters: Chapter[] };

/** Stable links used by CBT attempts; display labels remain on records for fast, offline rendering. */
export type CbtSourceRef = {
  subjectId?: string;
  chapterId?: string;
  exerciseId?: string;
  questionIds?: string[];
};

export const DEFAULT_EXERCISE = "Exercise 1";

const HISTORY_KEY = "cbt-history";
const SUBJECTS_KEY = "cbt-subjects";
const MARKING_KEY = "cbt-marking";
const TEST_THEME_KEY = "cbt-test-dark-mode";
const FAVORITE_QUESTIONS_KEY = "cbt-favorite-questions";
const STUDY_STORE_VERSION_KEY = "cbt-study-store-version";

export function newDocumentId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/* ---------- Marking scheme ---------- */

export const DEFAULT_MARKING: MarkingScheme = { positive: 4, negative: 1 };

export function loadMarking(): MarkingScheme | null {
  return read<MarkingScheme | null>(MARKING_KEY, null);
}

export function saveMarking(m: MarkingScheme) {
  write(MARKING_KEY, m);
}

export function loadTestDarkMode(): boolean | null {
  return read<boolean | null>(TEST_THEME_KEY, null);
}

export function saveTestDarkMode(darkMode: boolean) {
  write(TEST_THEME_KEY, darkMode);
}

export function clearTestDarkMode() {
  try {
    localStorage.removeItem(TEST_THEME_KEY);
  } catch {
    /* storage unavailable */
  }
}

/* ---------- Subjects & chapters ---------- */

type RawQuestion = Omit<McqQuestion, "id"> & { id?: string };
type RawExercise = Omit<Exercise, "id" | "questions"> & { id?: string; questions?: RawQuestion[] };
type RawChapter = {
  id?: string;
  name: string;
  questionCount?: number | null;
  answerKey?: (Option | null)[] | null;
  exercises?: RawExercise[];
};
type RawSubject = { id?: string; name: string; chapters: (string | RawChapter)[] };

function normalizeQuestion(question: RawQuestion, index: number): McqQuestion {
  return { ...question, id: question.id || newDocumentId(`question_${index + 1}`) };
}

function normalizeExercise(exercise: RawExercise): Exercise {
  return {
    ...exercise,
    id: exercise.id || newDocumentId("exercise"),
    ...(exercise.questions
      ? { questions: exercise.questions.map(normalizeQuestion) }
      : {}),
  };
}

function normalizeChapter(c: string | RawChapter): Chapter {
  if (typeof c === "string") {
    return {
      id: newDocumentId("chapter"),
      name: c,
      questionCount: null,
      answerKey: null,
      exercises: [{ id: newDocumentId("exercise"), name: DEFAULT_EXERCISE, questionCount: null, answerKey: null }],
    };
  }
  const exercises =
    c.exercises && c.exercises.length > 0
      ? c.exercises.map(normalizeExercise)
      : [
          {
            id: newDocumentId("exercise"), name: DEFAULT_EXERCISE,
            questionCount: c.questionCount ?? null,
            answerKey: c.answerKey ?? null,
          },
        ];
  return {
    id: c.id || newDocumentId("chapter"),
    name: c.name,
    questionCount: exercises[0]?.questionCount ?? null,
    answerKey: exercises[0]?.answerKey ?? null,
    exercises,
  };
}

export function loadSubjects(): Subject[] {
  const raw = read<RawSubject[]>(SUBJECTS_KEY, []);
  const subjects = raw.map((s) => ({
    id: s.id || newDocumentId("subject"),
    name: s.name,
    chapters: (s.chapters ?? []).map(normalizeChapter),
  }));
  if (JSON.stringify(raw) !== JSON.stringify(subjects)) write(SUBJECTS_KEY, subjects);
  const favorites = read<string[]>(FAVORITE_QUESTIONS_KEY, []);
  const migratedFavorites = favorites.map((favorite) => {
    if (!favorite.includes("||")) return favorite;
    const [subjectName, chapterName, exerciseName, number] = favorite.split("||");
    const question = subjects
      .find((subject) => subject.name === subjectName)
      ?.chapters.find((chapter) => chapter.name === chapterName)
      ?.exercises.find((exercise) => exercise.name === exerciseName)
      ?.questions?.find((item, index) => String(item.number ?? index + 1) === number);
    return question?.id ?? favorite;
  });
  if (JSON.stringify(favorites) !== JSON.stringify(migratedFavorites))
    write(FAVORITE_QUESTIONS_KEY, migratedFavorites);
  write(STUDY_STORE_VERSION_KEY, 1);
  return subjects;
}

export function saveSubjects(subjects: Subject[]) {
  write(SUBJECTS_KEY, subjects);
}

export function addSubject(name: string): Subject[] {
  const subjects = loadSubjects();
  if (!subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    subjects.push({ id: newDocumentId("subject"), name, chapters: [] });
    saveSubjects(subjects);
  }
  return loadSubjects();
}

/** Create or update one exercise inside a chapter (chapter is created if missing). */
export function upsertExercise(
  subjectName: string,
  chapterName: string,
  exerciseName: string,
  questionCount: number | null = null,
  answerKey: (Option | null)[] | null = null,
  questions?: McqQuestion[],
): Subject[] {
  const subjects = loadSubjects();
  const subject = subjects.find((s) => s.name === subjectName);
  if (!subject) return subjects;

  let chapter = subject.chapters.find((c) => c.name.toLowerCase() === chapterName.toLowerCase());
  if (!chapter) {
    chapter = { id: newDocumentId("chapter"), name: chapterName, questionCount: null, answerKey: null, exercises: [] };
    subject.chapters.push(chapter);
  }

  const name = exerciseName.trim() || DEFAULT_EXERCISE;
  const existing = chapter.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.questionCount = questionCount;
    existing.answerKey = answerKey;
    existing.questions = questions?.map(normalizeQuestion);
  } else {
    chapter.exercises.push({ id: newDocumentId("exercise"), name, questionCount, answerKey, questions: questions?.map(normalizeQuestion) });
  }
  chapter.questionCount = chapter.exercises[0]?.questionCount ?? null;
  chapter.answerKey = chapter.exercises[0]?.answerKey ?? null;

  saveSubjects(subjects);
  return loadSubjects();
}

export function deleteExercise(
  subjectName: string,
  chapterName: string,
  exerciseName: string,
): Subject[] {
  const subjects = loadSubjects();
  const subject = subjects.find((subject) => subject.name === subjectName);
  const chapter = subject?.chapters.find((item) => item.name === chapterName);
  if (!chapter) return subjects;
  chapter.exercises = chapter.exercises.filter((exercise) => exercise.name !== exerciseName);
  chapter.questionCount = chapter.exercises[0]?.questionCount ?? null;
  chapter.answerKey = chapter.exercises[0]?.answerKey ?? null;
  saveSubjects(subjects);
  return loadSubjects();
}

export function addChapter(
  subjectName: string,
  chapter: string,
  questionCount: number | null = null,
  answerKey: (Option | null)[] | null = null,
): Subject[] {
  return upsertExercise(subjectName, chapter, DEFAULT_EXERCISE, questionCount, answerKey);
}

export function getChapter(subjectName: string, chapterName: string): Chapter | null {
  return (
    loadSubjects()
      .find((s) => s.name === subjectName)
      ?.chapters.find((c) => c.name === chapterName) ?? null
  );
}

export function getExercise(
  subjectName: string,
  chapterName: string,
  exerciseName?: string | null,
): Exercise | null {
  const chapter = getChapter(subjectName, chapterName);
  if (!chapter) return null;
  if (!exerciseName) return chapter.exercises[0] ?? null;
  // A named exercise must match exactly. Falling back to the first exercise
  // would apply an unrelated answer key after an exercise is deleted/renamed.
  return chapter.exercises.find((e) => e.name === exerciseName) ?? null;
}

/* ---------- Question-bank favourites ---------- */

export function questionFavoriteId(
  subject: string,
  chapter: string,
  exercise: string,
  question: McqQuestion,
  index: number,
) {
  return question.id;
}

export function loadFavoriteQuestionIds(): string[] {
  return read<string[]>(FAVORITE_QUESTIONS_KEY, []);
}

export function saveFavoriteQuestionIds(ids: string[]) {
  write(FAVORITE_QUESTIONS_KEY, [...new Set(ids)]);
}

export function isFavoriteQuestion(id: string): boolean {
  return loadFavoriteQuestionIds().includes(id);
}

export function toggleFavoriteQuestion(id: string): string[] {
  const favorites = new Set(loadFavoriteQuestionIds());
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  const next = [...favorites];
  write(FAVORITE_QUESTIONS_KEY, next);
  return next;
}

/* ---------- History ---------- */

export function loadHistory(): TestRecord[] {
  const history = read<TestRecord[]>(HISTORY_KEY, []);
  const subjects = loadSubjects();
  const normalized = history.map((record) => {
    const recordId = record.id || newDocumentId("test");
    const questions = record.questions?.map(normalizeQuestion);
    const subject = subjects.find((item) => item.id === record.subjectId || item.name === record.subject);
    const chapter = subject?.chapters.find(
      (item) => item.id === record.chapterId || item.name === record.chapter,
    );
    const exercise = chapter?.exercises.find(
      (item) => item.id === record.exerciseId || item.name === record.exercise,
    );
    const isLegacyRandom = Boolean(
      record.questions?.length &&
        record.questionNumbers?.some((number, index) => number !== record.startNumber + index),
    );
    const testMode = record.testMode ?? (isLegacyRandom ? "random" : "standard");
    return {
      ...record,
      id: recordId,
      ...(testMode === "random" ? { testMode, attemptGroupId: record.attemptGroupId ?? recordId } : {}),
      ...(subject ? { subjectId: subject.id } : {}),
      ...(chapter ? { chapterId: chapter.id } : {}),
      ...(exercise ? { exerciseId: exercise.id } : {}),
      ...(questions ? { questions, questionIds: record.questionIds ?? questions.map((question) => question.id) } : {}),
    };
  });
  if (JSON.stringify(history) !== JSON.stringify(normalized)) write(HISTORY_KEY, normalized);
  return normalized;
}

export function saveRecord(record: TestRecord) {
  const history = loadHistory();
  const index = history.findIndex((r) => r.id === record.id);
  if (index >= 0) history[index] = record;
  else history.unshift(record);
  write(HISTORY_KEY, history);
}

export function saveHistory(records: TestRecord[]) {
  write(HISTORY_KEY, records);
}

export function getRecord(id: string): TestRecord | null {
  return loadHistory().find((r) => r.id === id) ?? null;
}

export function attemptKey(r: TestRecord) {
  if (r.testMode === "random") return r.attemptGroupId ?? r.id;
  return `${r.subjectId ?? r.subject}||${r.chapterId ?? r.chapter}||${r.exerciseId ?? r.exercise ?? ""}||${r.startNumber}||${r.answers.length}`;
}

/** Re-evaluates from the immutable answer-key snapshot stored with the attempt. */
export function reevaluateRecord(record: TestRecord): TestRecord {
  const evaluations = record.answerKey
    ? record.answers.map((answer, index) =>
        !answer || !record.answerKey?.[index]
          ? null
          : answer === record.answerKey[index]
            ? "correct"
            : "incorrect",
      )
    : undefined;
  const correct = evaluations?.filter((item) => item === "correct").length ?? null;
  const wrong = evaluations?.filter((item) => item === "incorrect").length ?? null;
  return {
    ...record,
    ...(evaluations ? { evaluations } : {}),
    correct,
    wrong,
    score: computeScore(correct, wrong, record.marking),
  };
}

/** All attempts (oldest → newest) that belong to the same test as `id`. */
export function getAttemptGroup(id: string): TestRecord[] {
  const history = loadHistory();
  const record = history.find((r) => r.id === id);
  if (!record) return [];
  return history
    .filter((r) => attemptKey(r) === attemptKey(record))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function deleteRecord(id: string) {
  write(
    HISTORY_KEY,
    loadHistory().filter((r) => r.id !== id),
  );
}

export function clearHistory() {
  write(HISTORY_KEY, []);
}

export function computeScore(
  correct: number | null,
  wrong: number | null,
  marking: MarkingScheme,
): number | null {
  if (correct === null && wrong === null) return null;
  return (correct ?? 0) * marking.positive - (wrong ?? 0) * marking.negative;
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatMarking(m: MarkingScheme) {
  const neg = m.negative === 0 ? "0" : `-${m.negative}`;
  return `+${m.positive} / ${neg}`;
}
