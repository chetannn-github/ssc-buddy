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
  meta: { examName: string; syllabusDeadline: string; targetDate: string };
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
      examName: "SSC CGL 2027",
      syllabusDeadline: "2026-11-15",
      targetDate: "2027-02-01",
    },
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

export const IMPORT_PROMPT = `I am preparing for SSC CGL 2027 and I use a personal tracker website.
I will upload photos / screenshots of my syllabus (chapter names) and the number of lectures or questions in each chapter.

Read them carefully and give me ONLY a valid JSON file (no explanation, no markdown fences) in exactly this format so I can import it into my tracker:

{
  "version": 1,
  "meta": { "examName": "SSC CGL 2027", "syllabusDeadline": "2026-11-15", "targetDate": "2027-02-01" },
  "subjects": [
    {
      "id": "maths",
      "name": "Maths",
      "chapters": [
        { "id": "maths-1", "name": "Number System", "total": 12, "completed": 0 }
      ]
    }
  ],
  "revision": {
    "maths": {
      "types": [
        { "id": "maths-tq", "name": "Teacher Questions", "target": 5 },
        { "id": "maths-cn", "name": "Concept Notes", "target": 5 }
      ],
      "done": {},
      "targets": {}
    }
  },
  "tests": {
    "targets": { "maths": 50 },
    "mocks": { "pre": { "target": 20, "done": 0 }, "mains": { "target": 20, "done": 0 } },
    "log": []
  }
}

Rules:
- Subjects must be: Maths, GS, Reasoning, English (use the same subject "id" strings in "revision" and "tests.targets").
- "total" = number of lectures/questions in that chapter from my photos. "completed" = 0 unless I say otherwise.
- For GS use revision types "Notes" and "Little Book". For all other subjects use "Teacher Questions" and "Concept Notes", target 5 each.
- Keep every id unique and lowercase with hyphens.
- Output raw JSON only.`;
