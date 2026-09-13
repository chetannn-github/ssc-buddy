import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { loadTrackerData } from "@/lib/tracker-store";
import type { TrackerData } from "@/lib/tracker";

type TestType = "all" | "Sectional" | "Pre" | "Mains";

export const Route = createFileRoute("/mock-tests")({
  head: () => ({ meta: [{ title: "Mock Tests" }] }),
  component: MockTests,
});

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

function MockTests() {
  const [tracker, setTracker] = useState<TrackerData>(() => loadTrackerData());
  const [type, setType] = useState<TestType>("all");
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

  const tests = useMemo(
    () =>
      tracker.tests.log
        .map((test, index) => ({ test, index }))
        .filter(({ test }) => type === "all" || test.type === type)
        .filter(
          ({ test }) => type !== "Sectional" || subjectId === "all" || test.subjectId === subjectId,
        )
        .sort(
          (a, b) =>
            (b.test.createdAt || b.test.date).localeCompare(a.test.createdAt || a.test.date) ||
            a.index - b.index,
        )
        .map(({ test }) => test),
    [subjectId, tracker.tests.log, type],
  );

  return (
    <AppShell title="Mock Tests">
      <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 py-7 text-zinc-100 sm:-mx-6 sm:px-6">
        <main className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
                Mock test records
              </p>
              <h1 className="mt-1 text-2xl font-semibold">All mock tests</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterMenu
                value={type}
                options={[
                  { value: "all", label: "All types" },
                  { value: "Sectional", label: "Sectional" },
                  { value: "Pre", label: "Pre" },
                  { value: "Mains", label: "Mains" },
                ]}
                onChange={(next) => {
                  setType(next);
                  if (next !== "Sectional") setSubjectId("all");
                }}
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
                disabled={type !== "Sectional"}
              />
            </div>
          </div>

          <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
            <div className="border-b border-white/10 px-4 py-3 text-sm text-zinc-400">
              {tests.length} {tests.length === 1 ? "test" : "tests"}
            </div>
            {tests.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Type</th>
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
                        <td className="px-4 py-3">{test.type}</td>
                        <td className="px-4 py-3">
                          {test.type === "Sectional"
                            ? (tracker.subjects.find((subject) => subject.id === test.subjectId)
                                ?.name ?? "—")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {test.score ?? "—"} / {test.total ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-emerald-300">
                          {test.accuracy != null ? `${test.accuracy}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-16 text-center text-sm text-zinc-500">
                No mock tests match this selection yet.
              </p>
            )}
          </section>
        </main>
      </div>
    </AppShell>
  );
}
