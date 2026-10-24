import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  head: () => ({ meta: [{ title: "Tracker · SSC Buddy" }, { property: "og:title", content: "Tracker · SSC Buddy" }] }),
  component: () => (
    <TrackerProvider>
      <TrackerDialogProvider>
        <TrackPage />
      </TrackerDialogProvider>
    </TrackerProvider>
  ),
});

function TrackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "Syllabus");
  return (
    <AppShell title="Tracker">
      <div className="tracker-theme -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-3 py-4 text-zinc-100 sm:-mx-6 sm:px-4 sm:py-5">
        <main className="mx-auto w-full max-w-4xl">
          <nav className="relative grid grid-cols-3 gap-0.5 rounded-full bg-card p-0.5">
            <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(33.333%-0.25rem)] rounded-full bg-accent-blue transition-transform duration-300 ease-out ${tab === "Revision" ? "translate-x-full" : tab === "Mock Test" ? "translate-x-[200%]" : ""}`} />
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={
                  tab === item
                    ? "relative z-10 rounded-full py-2 text-[13px] font-medium text-card transition-colors duration-200"
                    : "relative z-10 rounded-full py-2 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
                }
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="tracker-tab-panel mt-2">
            {tab === "Syllabus" && <Syllabus />}
            {tab === "Revision" && <Revision />}
            {tab === "Mock Test" && <Tests onOpenAnalysis={() => void navigate({ to: "/progress" })} />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
