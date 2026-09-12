import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { daysLeft, fmtDate, fmtMonth, overallSyllabus, pct } from "@/lib/tracker";
import { TrackerProvider, useTracker } from "@/lib/tracker-store";
import { Revision } from "../../tracker/src/components/tracker/Revision";
import { Syllabus } from "../../tracker/src/components/tracker/Syllabus";
import { Tests } from "../../tracker/src/components/tracker/Tests";

const TABS = ["Syllabus", "Revision", "Mock Test"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/track")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: TABS.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Tracker" }] }),
  component: () => (
    <TrackerProvider>
      <TrackPage />
    </TrackerProvider>
  ),
});

function TrackerHeader() {
  const { data, update } = useTracker();
  const [editing, setEditing] = useState(false);
  const overall = overallSyllabus(data);
  const chip =
    "inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground";

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Study control panel
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {data.meta.examName}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {editing ? (
            <>
              <label className={chip}>
                Syllabus{" "}
                <input
                  type="date"
                  className="bg-transparent text-foreground outline-none"
                  value={data.meta.syllabusDeadline}
                  onChange={(event) =>
                    update((next) => {
                      next.meta.syllabusDeadline = event.target.value;
                    })
                  }
                />
              </label>
              <label className={chip}>
                Target{" "}
                <input
                  type="date"
                  className="bg-transparent text-foreground outline-none"
                  value={data.meta.targetDate}
                  onChange={(event) =>
                    update((next) => {
                      next.meta.targetDate = event.target.value;
                    })
                  }
                />
              </label>
              <button
                type="button"
                className={`${chip} text-accent-blue`}
                onClick={() => setEditing(false)}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <span className={chip}>Syllabus · {fmtDate(data.meta.syllabusDeadline)}</span>
              <span className={chip}>Target · {fmtMonth(data.meta.targetDate)}</span>
              <span className={chip}>T-{daysLeft(data.meta.syllabusDeadline)} days</span>
              <button
                type="button"
                className={`${chip} text-accent-blue`}
                onClick={() => setEditing(true)}
              >
                Edit dates
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-card text-sm font-semibold sm:h-14 sm:w-14">
        {pct(overall.done, overall.total)}%
      </div>
    </header>
  );
}

function TrackPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "Syllabus");
  return (
    <AppShell title="Tracker">
      <div className="tracker-theme -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-3 py-5 text-zinc-100 sm:-mx-6 sm:px-5 sm:py-6">
        <main className="mx-auto w-full max-w-3xl">
          <TrackerHeader />
          <nav className="mt-4 grid grid-cols-3 gap-0.5 rounded-full bg-card p-0.5">
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={
                  tab === item
                    ? "rounded-full bg-accent-blue py-2 text-[13px] font-medium text-card"
                    : "rounded-full py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-3">
            {tab === "Syllabus" && <Syllabus />}
            {tab === "Revision" && <Revision />}
            {tab === "Mock Test" && <Tests />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
