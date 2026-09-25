import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { loadTrackerData } from "@/lib/tracker-store";
import type { TestEntry, TrackerData } from "@/lib/tracker";

type TestCategory = "Sectional" | "Pre" | "Mains";

type ChartPoint = {
  label: string;
  marks: number;
  accuracy: number;
  total: number;
  date: string;
  subject: string;
  category: string;
};

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Progress" }] }),
  component: Progress,
});

function Stat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-100">
        {value}
        <span className="ml-1 text-sm font-medium text-zinc-500">{suffix}</span>
      </p>
    </div>
  );
}

function ChartCard({
  title,
  data,
  dataKey,
  color,
  suffix,
}: {
  title: string;
  data: ChartPoint[];
  dataKey: "marks" | "accuracy";
  color: string;
  suffix: string;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ProgressTooltip title={title} color={color} suffix={suffix} />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ProgressTooltip({
  active,
  payload,
  title,
  color,
  suffix,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  title: string;
  color: string;
  suffix: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const metric = title === "Marks trend" ? point.marks : point.accuracy;
  const date = new Date(point.date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="min-w-48 rounded-lg border border-white/10 bg-[#202020] px-3 py-2.5 shadow-xl">
      <div className="flex items-center justify-between gap-5">
        <p className="text-xs font-semibold text-zinc-100">Test {point.label}</p>
        <span className="text-[11px] text-zinc-500">{date}</span>
      </div>
      <p className="mt-1 truncate text-xs text-zinc-400">
        {point.subject} · {point.category}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-2.5">
        <div>
          <p className="text-[10px] tracking-wide text-zinc-500 uppercase">
            {title.replace(" trend", "")}
          </p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color }}>
            {metric}
            {suffix}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-zinc-500 uppercase">Full result</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-200">
            {point.marks}/{point.total} · {point.accuracy}%
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterMenu<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((option) => option.value === value)?.label ?? value;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-2 rounded-lg bg-white/5 px-3 text-sm text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label} <ChevronDown className="h-4 w-4 text-zinc-500" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute top-10 right-0 z-20 min-w-full overflow-hidden rounded-lg bg-[#202020] py-1 shadow-xl ring-1 ring-white/5"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Progress() {
  const [tracker, setTracker] = useState<TrackerData>(() => loadTrackerData());
  const [category, setCategory] = useState<TestCategory>("Sectional");
  const [subjectId, setSubjectId] = useState("all");

  useEffect(() => {
    const refresh = () => setTracker(loadTrackerData());
    window.addEventListener("cbt-tracker-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("cbt-tracker-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const tests = useMemo(() => {
    return (
      tracker.tests.log
        .map((test, index) => ({ test, index }))
        .filter(({ test }) => test.type === category)
        .filter(
          ({ test }) =>
            category !== "Sectional" || subjectId === "all" || test.subjectId === subjectId,
        )
        .filter(
          (
            entry,
          ): entry is {
            test: TestEntry & { score: number; total: number; accuracy: number };
            index: number;
          } =>
            entry.test.score !== null && entry.test.total !== null && entry.test.accuracy !== null,
        )
        // Saved time is the stable source of truth for latest test ordering.
        .sort(
          (a, b) =>
            (b.test.createdAt || b.test.date).localeCompare(a.test.createdAt || a.test.date) ||
            a.index - b.index,
        )
        .map(({ test }) => test)
    );
  }, [category, subjectId, tracker.tests.log]);

  const summary = useMemo(() => {
    const marks = tests.map((test) => test.score);
    const accuracy = tests.map((test) => test.accuracy);
    return {
      highest: marks.length ? Math.max(...marks) : 0,
      lowest: marks.length ? Math.min(...marks) : 0,
      averageMarks: marks.length
        ? (marks.reduce((sum, value) => sum + value, 0) / marks.length).toFixed(1)
        : "0",
      averageAccuracy: accuracy.length
        ? (accuracy.reduce((sum, value) => sum + value, 0) / accuracy.length).toFixed(1)
        : "0",
    };
  }, [tests]);

  const chartData: ChartPoint[] = [...tests].reverse().map((test, index) => ({
    label: `${index + 1}`,
    marks: test.score,
    accuracy: test.accuracy,
    total: test.total,
    date: test.date,
    subject:
      category === "Sectional"
        ? (tracker.subjects.find((subject) => subject.id === test.subjectId)?.name ?? "—")
        : category,
    category,
  }));

  return (
    <AppShell title="Progress">
      <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-7 text-zinc-100 sm:-mx-6 sm:px-6">
        <main className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
                Mock test analysis
              </p>
              <h1 className="mt-1 text-2xl font-semibold">Progress</h1>
            </div>
            <div className="flex gap-2">
              <FilterMenu
                value={category}
                options={[
                  { value: "Sectional", label: "Sectional" },
                  { value: "Pre", label: "Pre" },
                  { value: "Mains", label: "Mains" },
                ]}
                onChange={setCategory}
              />
              <FilterMenu
                value={subjectId}
                options={[
                  { value: "all", label: "All subjects" },
                  ...tracker.subjects.map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  })),
                ]}
                onChange={setSubjectId}
                disabled={category !== "Sectional"}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Tests" value={tests.length} />
            <Stat label="Highest" value={summary.highest} suffix="marks" />
            <Stat label="Lowest" value={summary.lowest} suffix="marks" />
            <Stat label="Average" value={summary.averageMarks} suffix="marks" />
            <Stat label="Avg. accuracy" value={summary.averageAccuracy} suffix="%" />
          </div>

          {tests.length ? (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Marks trend"
                  data={chartData}
                  dataKey="marks"
                  color="#60a5fa"
                  suffix=" marks"
                />
                <ChartCard
                  title="Accuracy trend"
                  data={chartData}
                  dataKey="accuracy"
                  color="#34d399"
                  suffix="%"
                />
              </div>
              <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <span className="text-sm font-semibold">Test history</span>
                  <Link
                    to="/mock-tests"
                    className="text-xs font-medium text-blue-300 transition-colors hover:text-blue-200"
                  >
                    View all
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium">Marks</th>
                        <th className="px-4 py-3 font-medium">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tests.slice(0, 10).map((test) => (
                        <tr key={test.id} className="border-t border-white/5">
                          <td className="px-4 py-3 text-zinc-400">
                            {new Date(test.date).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            {category === "Sectional"
                              ? (tracker.subjects.find((subject) => subject.id === test.subjectId)
                                  ?.name ?? "—")
                              : category}
                          </td>
                          <td className="px-4 py-3">
                            {test.score} / {test.total}
                          </td>
                          <td className="px-4 py-3 text-emerald-300">{test.accuracy}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-white/10 py-16 text-center text-sm text-zinc-500">
              No {category.toLowerCase()} mock tests match this selection yet.
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
