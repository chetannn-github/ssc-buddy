import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { defaultData, type TrackerActivity, type TrackerData } from "./tracker";

export const TRACKER_STORAGE_KEY = "ssc-cgl-2027-tracker-v1";

type Ctx = {
  data: TrackerData;
  update: (fn: (d: TrackerData) => void) => void;
  replace: (d: TrackerData) => void;
  reset: () => void;
};

const TrackerCtx = createContext<Ctx | null>(null);

const LEGACY_SEED_CHAPTERS: Record<string, string[]> = {
  Maths: [
    "Number System",
    "Percentage",
    "Ratio & Proportion",
    "Time, Speed & Distance",
    "Algebra",
    "Geometry",
    "Trigonometry",
  ],
  GS: ["History", "Geography", "Polity", "Economy", "Science"],
  Reasoning: ["Verbal Reasoning", "Non-Verbal Reasoning"],
  English: ["Grammar", "Vocabulary"],
};

function migrate(raw: unknown): TrackerData {
  const base = defaultData();
  const d = raw as Partial<TrackerData>;
  if (!d || typeof d !== "object" || !Array.isArray(d.subjects)) return base;
  const out: TrackerData = {
    version: 1,
    meta: { ...base.meta, ...(d.meta ?? {}) },
    subjects: d.subjects.map((s) => ({
      id: String(s.id ?? Math.random()),
      name: String(s.name ?? "Subject"),
      chapters: (s.chapters ?? []).map((c) => ({
        id: String(c.id ?? Math.random()),
        name: String(c.name ?? "Chapter"),
        total: Number(c.total) || 0,
        completed: Number(c.completed) || 0,
      })),
    })),
    revision: {},
    tests: {
      targets: { ...(d.tests?.targets ?? {}) },
      mocks: {
        pre: { ...base.tests.mocks.pre, ...(d.tests?.mocks?.pre ?? {}) },
        mains: { ...base.tests.mocks.mains, ...(d.tests?.mocks?.mains ?? {}) },
      },
      log: (d.tests?.log ?? []).map((t) => ({
        id: String(t.id ?? Math.random()),
        date: String(t.date ?? ""),
        createdAt: String(t.createdAt ?? t.date ?? ""),
        subjectId: String(t.subjectId ?? ""),
        type: String(t.type ?? ""),
        score: t.score ?? null,
        total: t.total ?? null,
        accuracy: t.accuracy ?? null,
        notes: String(t.notes ?? ""),
      })),
    },
    activity: (d.activity ?? [])
      .filter(
        (entry): entry is TrackerActivity =>
          !!entry &&
          typeof entry === "object" &&
          (entry.type === "lecture" || entry.type === "revision" || entry.type === "mock-test"),
      )
      .map((entry) => ({
        id: String(entry.id ?? Math.random()),
        date: String(entry.date ?? ""),
        type: entry.type,
        count: Number(entry.count) || 1,
      })),
  };
  for (const s of out.subjects) {
    const r = d.revision?.[s.id];
    let types = (r?.types ?? []).map((t) => ({
      id: String(t.id ?? Math.random()),
      name: String(t.name ?? "Revision"),
      target: Number(t.target) || 5,
    }));
    if (types.length === 0) {
      types =
        s.name.toUpperCase() === "GS"
          ? [
              { id: s.id + "-notes", name: "Notes", target: 5 },
              { id: s.id + "-lb", name: "Little Book", target: 5 },
            ]
          : [
              { id: s.id + "-tq", name: "Teacher Questions", target: 5 },
              { id: s.id + "-cn", name: "Concept Notes", target: 5 },
            ];
    }
    out.revision[s.id] = { types, done: r?.done ?? {}, targets: r?.targets ?? {} };
    if (out.tests.targets[s.id] == null) out.tests.targets[s.id] = 50;
  }

  // Earlier versions shipped a full sample syllabus. Remove it when the user
  // has not yet recorded any work, while preserving any chapters they added.
  const hasRecordedProgress = out.tests.log.length > 0 || out.activity.length > 0;
  if (!hasRecordedProgress) {
    out.subjects = out.subjects
      .map((subject) => {
        const seedChapters = LEGACY_SEED_CHAPTERS[subject.name];
        if (!seedChapters) return subject;
        return {
          ...subject,
          chapters: subject.chapters.filter((chapter) => !seedChapters.includes(chapter.name)),
        };
      })
      .filter((subject) => subject.chapters.length > 0 || !LEGACY_SEED_CHAPTERS[subject.name]);
    const subjectIds = new Set(out.subjects.map((subject) => subject.id));
    out.revision = Object.fromEntries(
      Object.entries(out.revision).filter(([subjectId]) => subjectIds.has(subjectId)),
    );
    out.tests.targets = Object.fromEntries(
      Object.entries(out.tests.targets).filter(([subjectId]) => subjectIds.has(subjectId)),
    );
    out.tests.mocks = { pre: { target: 0, done: 0 }, mains: { target: 0, done: 0 } };
  }
  return out;
}

export function loadTrackerData() {
  try {
    const raw = localStorage.getItem(TRACKER_STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultData();
  } catch {
    return defaultData();
  }
}

export function saveTrackerData(data: TrackerData) {
  const next = migrate(data);
  localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("cbt-tracker-updated"));
  return next;
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TrackerData>(() => defaultData());
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      setData(loadTrackerData());
    } catch {
      /* ignore corrupt storage */
    }
    loaded.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loaded.current || !ready) return;
    try {
      localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(data));
      window.dispatchEvent(new Event("cbt-tracker-updated"));
    } catch {
      /* storage full */
    }
  }, [data, ready]);

  const update = useCallback((fn: (d: TrackerData) => void) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as TrackerData;
      fn(next);
      return next;
    });
  }, []);

  const replace = useCallback((d: TrackerData) => setData(migrate(d)), []);
  const reset = useCallback(() => setData(defaultData()), []);

  const value = useMemo(() => ({ data, update, replace, reset }), [data, update, replace, reset]);

  if (!ready) return null;
  return <TrackerCtx.Provider value={value}>{children}</TrackerCtx.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerCtx);
  if (!ctx) throw new Error("useTracker must be used inside TrackerProvider");
  return ctx;
}
