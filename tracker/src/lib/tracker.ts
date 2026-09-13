export type Chapter = { id: string; name: string; total: number; completed: number };
export type Subject = { id: string; name: string; chapters: Chapter[] };
export type RevType = { id: string; name: string; target: number };
/** revision[subjectId] = { types, done: { [chapterId]: { [typeId]: number } }, targets: { [chapterId]: { [typeId]: number } } } */
export type RevisionSubject = {
  types: RevType[];
  done: Record<string, Record<string, number>>;
  targets: Record<string, Record<string, number>>;
};
export type TestEntry = {
  id: string;
  date: string;
  createdAt: string;
  subjectId: string;
  type: string;
  score: number | null;
  total: number | null;
  accuracy: number | null;
  notes: string;
};
export type MockKind = "pre" | "mains";
export type TrackerActivityType = "lecture" | "revision" | "mock-test";
export type TrackerActivity = {
  id: string;
  date: string;
  type: TrackerActivityType;
  count: number;
};
export type TrackerData = {
  version: 1;
  meta: {
    examName: string;
    syllabusDeadline: string;
    targetDate: string;
    countdowns: Array<{ id: string; name: string; date: string }>;
  };
  pinnedChapterIds: string[];
  subjects: Subject[];
  revision: Record<string, RevisionSubject>;
  tests: {
    targets: Record<string, number>;
    mocks: Record<MockKind, { target: number; done: number }>;
    log: TestEntry[];
  };
  activity: TrackerActivity[];
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export function defaultData(): TrackerData {
  return {
    version: 1,
    meta: {
      examName: "",
      syllabusDeadline: "",
      targetDate: "",
      countdowns: [],
    },
    pinnedChapterIds: [],
    subjects: [],
    revision: {},
    tests: {
      targets: {},
      mocks: { pre: { target: 0, done: 0 }, mains: { target: 0, done: 0 } },
      log: [],
    },
    activity: [],
  };
}

/* ---------- derived helpers ---------- */

export const pct = (done: number, total: number) =>
  total <= 0 ? 0 : Math.round((done / total) * 100);

export function subjectSyllabus(s: Subject) {
  return s.chapters.reduce(
    (a, c) => ({ done: a.done + Math.min(c.completed, c.total), total: a.total + c.total }),
    { done: 0, total: 0 },
  );
}

export function overallSyllabus(d: TrackerData) {
  return d.subjects.reduce(
    (a, s) => {
      const x = subjectSyllabus(s);
      return { done: a.done + x.done, total: a.total + x.total };
    },
    { done: 0, total: 0 },
  );
}

export function revTarget(d: TrackerData, subjectId: string, chapterId: string, t: RevType) {
  return d.revision[subjectId]?.targets?.[chapterId]?.[t.id] ?? t.target;
}

export function revDone(d: TrackerData, subjectId: string, chapterId: string, typeId: string) {
  return d.revision[subjectId]?.done?.[chapterId]?.[typeId] ?? 0;
}

export function subjectRevision(d: TrackerData, s: Subject) {
  const r = d.revision[s.id];
  if (!r) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  for (const c of s.chapters)
    for (const t of r.types) {
      total += revTarget(d, s.id, c.id, t);
      done += Math.min(revDone(d, s.id, c.id, t.id), revTarget(d, s.id, c.id, t));
    }
  return { done, total };
}

export function chapterStatus(c: Chapter) {
  if (c.completed <= 0) return "NOT STARTED";
  if (c.completed >= c.total) return "COMPLETED";
  return "IN PROGRESS";
}

export function testsDone(d: TrackerData, subjectId: string) {
  return d.tests.log.filter((t) => t.subjectId === subjectId).length;
}

export function daysLeft(iso: string) {
  const t = new Date(iso + "T00:00:00").getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

export function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtMonth(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Keep tracker work date-aware so an undo can cancel the original completion. */
export function recordActivity(
  data: TrackerData,
  type: TrackerActivityType,
  count: number,
  date = todayISO(),
) {
  if (count === 0) return;
  data.activity.unshift({ id: uid(), date, type, count });
}

/** Dates with a net-positive tracker contribution, used for the shared streak. */
export function trackerActiveDates(data: TrackerData) {
  const byDay = new Map<string, number>();
  data.tests.log.forEach((test) => {
    if (test.date) byDay.set(test.date, (byDay.get(test.date) ?? 0) + 1);
  });
  data.activity.forEach((entry) => {
    if (entry.date) byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + entry.count);
  });
  return Array.from(byDay.entries())
    .filter(([, count]) => count > 0)
    .map(([date]) => date);
}

export const IMPORT_PROMPT = `I use a personal Study Tracker website. I will provide a list or screenshots of my syllabus chapters along with the total number of lectures for each chapter.

Create ONLY the syllabus data for my tracker. Return one valid raw JSON object only: no explanation, no markdown fences, and no text before or after the JSON.

Use this exact data shape:

{
  "version": 1,
  "meta": { "examName": "", "syllabusDeadline": "", "targetDate": "", "countdowns": [] },
  "subjects": [
    {
      "id": "maths",
      "name": "Maths",
      "chapters": [
        { "id": "maths-number-system", "name": "Number System", "total": 12, "completed": 0 }
      ]
    }
  ],
  "revision": {},
  "tests": {
    "targets": {},
    "mocks": { "pre": { "target": 0, "done": 0 }, "mains": { "target": 0, "done": 0 } },
    "log": []
  },
  "activity": []
}

Rules:
- Make one subject object for every subject I provide. Do not invent subjects or chapters.
- "total" is the number of lectures I provide for that chapter. "completed" must always be 0.
- Use unique lowercase hyphenated ids. A chapter id should include its subject id, for example "maths-number-system".
- Keep revision, mock tests, practice sessions, activity, and all targets empty exactly as shown. I will add those myself in the website.
- If a lecture total is missing or unclear, ask me for it instead of guessing.
- Output raw JSON only.`;
