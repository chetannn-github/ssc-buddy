import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TrackerProvider } from "@/lib/tracker-store";
import { Revision } from "../../tracker/src/components/tracker/Revision";
import { Syllabus } from "../../tracker/src/components/tracker/Syllabus";
import { Tests } from "../../tracker/src/components/tracker/Tests";
import { TrackerDialogProvider } from "../../tracker/src/components/tracker/dialog";

const TABS = ["Syllabus", "Revision", "Mock Test"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/track")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: TABS.includes(search["tab"] as Tab) ? (search["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Tracker" }] }),
  component: () => (
    <TrackerProvider>
      <TrackerDialogProvider>
        <TrackPage />
      </TrackerDialogProvider>
    </TrackerProvider>
  ),
});

function TrackPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "Syllabus");
  return (
    <AppShell title="Tracker">
      <div className="tracker-theme -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-3 py-4 text-zinc-100 sm:-mx-6 sm:px-4 sm:py-5">
        <main className="mx-auto w-full max-w-2xl">
          <nav className="grid grid-cols-3 gap-0.5 rounded-full bg-card p-0.5">
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
          <div className="mt-2">
            {tab === "Syllabus" && <Syllabus />}
            {tab === "Revision" && <Revision />}
            {tab === "Mock Test" && <Tests />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
