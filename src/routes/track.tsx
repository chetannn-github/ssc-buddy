import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TrackerProvider } from "@/lib/tracker-store";
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

function TrackPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "Syllabus");
  return (
    <AppShell title="Tracker" fullBleed>
      <div className="tracker-theme min-h-[calc(100vh-3.5rem)] bg-[#121212] px-3 py-5 text-zinc-100 sm:px-5 sm:py-6 md:min-h-[calc(100vh-4rem)]">
        <main className="mx-auto w-full max-w-3xl">
          <div className="mb-4 px-1">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
              Study plan
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Tracker</h1>
          </div>
          <nav className="grid grid-cols-3 gap-0.5 rounded-full bg-card p-1">
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
