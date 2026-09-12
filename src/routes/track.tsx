import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { daysLeft, fmtDate, fmtMonth, overallSyllabus, pct } from "@/lib/tracker";
import { TrackerProvider, useTracker } from "@/lib/tracker-store";
import { Dashboard } from "../../tracker/src/components/tracker/Dashboard";
import { DataPanel } from "../../tracker/src/components/tracker/DataPanel";
import { Revision } from "../../tracker/src/components/tracker/Revision";
import { Syllabus } from "../../tracker/src/components/tracker/Syllabus";
import { Tests } from "../../tracker/src/components/tracker/Tests";

const TABS = ["Dashboard", "Syllabus", "Revision", "Tests"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/track")({
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
    "inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 font-mono text-xs text-muted-foreground";

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          Study control panel
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{data.meta.examName}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-card text-lg font-semibold sm:h-20 sm:w-20">
        {pct(overall.done, overall.total)}%
      </div>
    </header>
  );
}

function TrackPage() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  return (
    <AppShell title="Tracker">
      <div className="tracker-theme -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#f2efe8] px-4 py-8 text-[#474239] sm:-mx-6 sm:px-6 sm:py-10">
        <main className="mx-auto w-full max-w-4xl">
          <TrackerHeader />
          <nav className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-card p-1 sm:grid-cols-4">
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={
                  tab === item
                    ? "rounded-full bg-accent-blue py-2.5 text-sm font-medium text-card"
                    : "rounded-full py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-4">
            {tab === "Dashboard" && <Dashboard />}
            {tab === "Syllabus" && <Syllabus />}
            {tab === "Revision" && <Revision />}
            {tab === "Tests" && <Tests />}
          </div>
          <DataPanel />
        </main>
      </div>
    </AppShell>
  );
}
