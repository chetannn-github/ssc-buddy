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

function migrate(raw: unknown): TrackerData {
  const base = defaultData();
  const d = raw as Partial<TrackerData>;
  if (!d || typeof d !== "object" || !Array.isArray(d.subjects)) return base;
  const out: TrackerData = {
    version: 1,
    meta: {
      ...base.meta,
      ...(d.meta ?? {}),
      countdowns: Array.isArray(d.meta?.countdowns)
        ? d.meta.countdowns.slice(0, 2).map((countdown, index) => ({
            id: String(countdown?.id ?? `countdown-${index + 1}`),
            name: String(countdown?.name ?? ""),
            date: String(countdown?.date ?? ""),
          }))
        : [
            d.meta?.syllabusDeadline
              ? { id: "countdown-1", name: "Syllabus deadline", date: d.meta.syllabusDeadline }
              : null,
            d.meta?.targetDate
              ? { id: "countdown-2", name: "Target date", date: d.meta.targetDate }
              : null,
          ].filter(
            (countdown): countdown is { id: string; name: string; date: string } => !!countdown,
          ),
    },
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
    const types = (r?.types ?? []).map((t) => ({
      id: String(t.id ?? Math.random()),
      name: String(t.name ?? "Revision"),
      target: Number(t.target) || 5,
    }));
    out.revision[s.id] = { types, done: r?.done ?? {}, targets: r?.targets ?? {} };
    if (out.tests.targets[s.id] == null) out.tests.targets[s.id] = 0;
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
