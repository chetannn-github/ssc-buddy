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
import { defaultData, type TrackerData } from "./tracker";

const KEY = "ssc-cgl-2027-tracker-v1";

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
        subjectId: String(t.subjectId ?? ""),
        type: String(t.type ?? ""),
        score: t.score ?? null,
        total: t.total ?? null,
        accuracy: t.accuracy ?? null,
        notes: String(t.notes ?? ""),
      })),
    },
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
  return out;
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TrackerData>(() => defaultData());
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData(migrate(JSON.parse(raw)));
    } catch {
      /* ignore corrupt storage */
    }
    loaded.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage full */
    }
  }, [data]);

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
