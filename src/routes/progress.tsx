import { createFileRoute } from "@tanstack/react-router";
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
  data: Array<{ label: string; marks: number; accuracy: number }>;
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
            <Tooltip
              contentStyle={{
                background: "#202020",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "#e4e4e7" }}
              itemStyle={{ color }}
              formatter={(value: number) => [`${value}${suffix}`, title]}
            />
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
        // The log stores newest entries first. Reverse same-day order so the latest point is last.
        .sort((a, b) => a.test.date.localeCompare(b.test.date) || b.index - a.index)
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

  const chartData = tests.map((test, index) => ({
    label: `${index + 1}`,
    marks: test.score,
    accuracy: test.accuracy,
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
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as TestCategory)}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-200 outline-none"
              >
                <option className="bg-[#202020]">Sectional</option>
                <option className="bg-[#202020]">Pre</option>
                <option className="bg-[#202020]">Mains</option>
              </select>
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={category !== "Sectional"}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-200 outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                <option value="all" className="bg-[#202020]">
                  All subjects
                </option>
                {tracker.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id} className="bg-[#202020]">
                    {subject.name}
                  </option>
                ))}
              </select>
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
                <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">
                  Test history
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
                      {tests.map((test) => (
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
