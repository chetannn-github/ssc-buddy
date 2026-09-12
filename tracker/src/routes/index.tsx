import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrackerProvider, useTracker } from "@/lib/tracker-store";
import { daysLeft, fmtDate, fmtMonth, overallSyllabus, pct } from "@/lib/tracker";
import { Dashboard } from "@/components/tracker/Dashboard";
import { Syllabus } from "@/components/tracker/Syllabus";
import { Revision } from "@/components/tracker/Revision";
import { Tests } from "@/components/tracker/Tests";
import { DataPanel } from "@/components/tracker/DataPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SSC CGL 2027 Tracker — Study Control Panel" },
      {
        name: "description",
        content:
          "A personal SSC CGL 2027 study control panel: syllabus completion, revisions, sectional tests and full mocks, all stored in your browser.",
      },
      { property: "og:title", content: "SSC CGL 2027 Tracker — Study Control Panel" },
      {
        property: "og:description",
        content:
          "Track SSC CGL 2027 syllabus progress, revisions, sectional tests and full mocks in one simple panel.",
      },
    ],
  }),
  component: () => (
    <TrackerProvider>
      <TrackerPage />
    </TrackerProvider>
  ),
});

const TABS = ["Dashboard", "Syllabus", "Revision", "Tests"] as const;
type Tab = (typeof TABS)[number];

function Header() {
  const { data, update } = useTracker();
  const [editing, setEditing] = useState(false);
  const overall = overallSyllabus(data);
  const left = daysLeft(data.meta.syllabusDeadline);

  const chip =
    "inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 font-mono text-[13px] text-muted-foreground";

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">
          Study control panel
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {data.meta.examName}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <label className={chip}>
                Syllabus
                <input
                  type="date"
                  aria-label="Syllabus deadline"
                  className="bg-transparent text-foreground outline-none"
                  value={data.meta.syllabusDeadline}
                  onChange={(e) =>
                    update((d) => {
                      d.meta.syllabusDeadline = e.target.value;
                    })
                  }
                />
              </label>
              <label className={chip}>
                Target
                <input
                  type="date"
                  aria-label="Final preparation target"
                  className="bg-transparent text-foreground outline-none"
                  value={data.meta.targetDate}
                  onChange={(e) =>
                    update((d) => {
                      d.meta.targetDate = e.target.value;
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={`${chip} text-accent-blue`}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <span className={chip}>Syllabus · {fmtDate(data.meta.syllabusDeadline)}</span>
              <span className={chip}>Target · {fmtMonth(data.meta.targetDate)}</span>
              <span className={chip}>T-{left} days</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`${chip} text-accent-blue`}
              >
                Edit dates
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-card font-semibold sm:h-20 sm:w-20 sm:text-lg">
        {pct(overall.done, overall.total)}%
      </div>
    </header>
  );
}

function TrackerPage() {
  const [tab, setTab] = useState<Tab>("Dashboard");

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Header />

      <nav className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-card p-1 sm:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t}
            className={`rounded-full py-2.5 text-sm transition-colors ${
              tab === t
                ? "bg-accent-blue font-medium text-card"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
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
  );
}
