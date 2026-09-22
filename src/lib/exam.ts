export type Option = "A" | "B" | "C" | "D";

export type Verdict = "correct" | "incorrect" | null;

export type QuestionState = {
  answer: Option | null;
  marked: boolean;
  visited: boolean;
};

export type MarkingScheme = { positive: number; negative: number };

export type McqQuestion = {
  question: string;
  options: [string, string, string, string];
  correctAnswer: Option;
  explanation?: string;
};

export type TestRecord = {
  id: string;
  date: string;
  subject: string;
  chapter: string;
  exercise?: string;
  startNumber: number;
  durationMinutes: number | null;
  timeTakenSeconds: number;
  answers: (Option | null)[];
  answerKey?: (Option | null)[];
  questions?: McqQuestion[] | undefined;

  evaluations?: Verdict[];
  correct: number | null;
  wrong: number | null;
  marking: MarkingScheme;
  score: number | null;
};

export type Exercise = {
  name: string;
  questionCount: number | null;
  answerKey: (Option | null)[] | null;
  questions?: McqQuestion[] | undefined;
};

export type Chapter = {
  name: string;
  questionCount: number | null;
  answerKey: (Option | null)[] | null;
  exercises: Exercise[];
};

export type Subject = { name: string; chapters: Chapter[] };

export const DEFAULT_EXERCISE = "Exercise 1";

const HISTORY_KEY = "cbt-history";
const SUBJECTS_KEY = "cbt-subjects";
const MARKING_KEY = "cbt-marking";

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

/* ---------- Subjects & chapters ---------- */

type RawChapter = {
  name: string;
  questionCount?: number | null;
  answerKey?: (Option | null)[] | null;
  exercises?: Exercise[];
};
type RawSubject = { name: string; chapters: (string | RawChapter)[] };

function normalizeChapter(c: string | RawChapter): Chapter {
  if (typeof c === "string") {
    return {
      name: c,
      questionCount: null,
      answerKey: null,
      exercises: [{ name: DEFAULT_EXERCISE, questionCount: null, answerKey: null }],
    };
  }
  const exercises =
    c.exercises && c.exercises.length > 0
      ? c.exercises
      : [
          {
            name: DEFAULT_EXERCISE,
            questionCount: c.questionCount ?? null,
            answerKey: c.answerKey ?? null,
          },
        ];
  return {
    name: c.name,
    questionCount: exercises[0]?.questionCount ?? null,
    answerKey: exercises[0]?.answerKey ?? null,
    exercises,
  };
}

export function loadSubjects(): Subject[] {
  const raw = read<RawSubject[]>(SUBJECTS_KEY, []);
  return raw.map((s) => ({
    name: s.name,
    chapters: (s.chapters ?? []).map(normalizeChapter),
  }));
}

export function saveSubjects(subjects: Subject[]) {
  write(SUBJECTS_KEY, subjects);
}

export function addSubject(name: string): Subject[] {
  const subjects = loadSubjects();
  if (!subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    subjects.push({ name, chapters: [] });
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
    chapter = { name: chapterName, questionCount: null, answerKey: null, exercises: [] };
    subject.chapters.push(chapter);
  }

  const name = exerciseName.trim() || DEFAULT_EXERCISE;
  const existing = chapter.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.questionCount = questionCount;
    existing.answerKey = answerKey;
    existing.questions = questions;
  } else {
    chapter.exercises.push({ name, questionCount, answerKey, questions });
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
  return chapter.exercises.find((e) => e.name === exerciseName) ?? chapter.exercises[0] ?? null;
}

/* ---------- History ---------- */

export function loadHistory(): TestRecord[] {
  return read<TestRecord[]>(HISTORY_KEY, []);
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
  return `${r.subject}||${r.chapter}||${r.exercise ?? ""}||${r.startNumber}||${r.answers.length}`;
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
