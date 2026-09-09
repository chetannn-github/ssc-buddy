import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aggregateRecords, getStreaks, metricsForRecord } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

const title = "Practice Profile — MCQ Practice";
const description = "Your yearly practice activity and progress.";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: Profile,
});

function localDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ActivityHeatmap({ records, maxStreak }: { records: TestRecord[]; maxStreak: number }) {
  const { days, monthLabels, totalActivity, activeDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = Array.from({ length: 365 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (364 - index));
      return date;
    });
    const activity = new Map<string, number>();
    records.forEach((record) => {
      const key = localDay(new Date(record.date));
      activity.set(
        key,
        (activity.get(key) ?? 0) + Math.max(1, record.answers.filter(Boolean).length),
      );
    });
    const values = entries.map((date) => activity.get(localDay(date)) ?? 0);
    const maximum = Math.max(...values, 1);
    const labels = entries
      .map((date, index) => ({ date, index }))
      .filter(
        ({ date, index }) => index === 0 || date.getMonth() !== entries[index - 1]?.getMonth(),
      )
      .map(({ date, index }) => ({
        label: date.toLocaleDateString(undefined, { month: "short" }),
        index,
      }));

    return {
      days: entries.map((date, index) => ({ date, value: values[index] ?? 0, maximum })),
      monthLabels: labels,
      totalActivity: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter(Boolean).length,
    };
  }, [records]);

  return (
    <section className="overflow-hidden rounded-2xl bg-[#222] p-5 text-zinc-100 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.8)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Yearly activity</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {totalActivity} questions practiced in the last year
          </p>
        </div>
        <div className="flex gap-5 text-right text-xs">
          <div>
            <p className="font-semibold text-zinc-100">{activeDays}</p>
            <p className="text-zinc-400">Active days</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-100">{maxStreak}</p>
            <p className="text-zinc-400">Max streak</p>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="min-w-[720px]">
          <div className="relative mb-2 h-4 text-[10px] text-zinc-400">
            {monthLabels.map(({ label, index }) => (
              <span
                key={`${label}-${index}`}
                className="absolute"
                style={{ left: `${(index / 364) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {days.map(({ date, value, maximum }, index) => {
              const intensity = value === 0 ? 0 : Math.min(4, Math.ceil((value / maximum) * 4));
              const startsMonth = index > 0 && date.getMonth() !== days[index - 1]?.date.getMonth();
              return (
                <span
                  key={localDay(date)}
                  title={`${formatDate(localDay(date))}: ${value} question${value === 1 ? "" : "s"}`}
                  className={cn(
                    "h-3 w-3 rounded-[3px] ring-1 ring-inset ring-white/5",
                    startsMonth && "ml-2",
                    intensity === 0 && "bg-zinc-700",
                    intensity === 1 && "bg-emerald-200",
                    intensity === 2 && "bg-emerald-300",
                    intensity === 3 && "bg-emerald-500",
                    intensity === 4 && "bg-emerald-700",
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-400">
        Less
        {[0, 1, 2, 3, 4].map((intensity) => (
          <span
            key={intensity}
            className={cn(
              "h-3 w-3 rounded-[3px]",
              intensity === 0 && "bg-zinc-700",
              intensity === 1 && "bg-emerald-200",
              intensity === 2 && "bg-emerald-300",
              intensity === 3 && "bg-emerald-500",
              intensity === 4 && "bg-emerald-700",
            )}
          />
        ))}
        More
      </div>
    </section>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function avatarColor(name: string) {
  const colors = ["bg-violet-500", "bg-sky-500", "bg-rose-500", "bg-teal-500", "bg-orange-500"];
  const hash = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? "bg-primary";
}

function TargetProgress({
  attempted,
  goal,
  subjectStats,
  tests,
  correct,
  wrong,
}: {
  attempted: number;
  goal: number;
  subjectStats: Array<{ subject: string; attempted: number }>;
  tests: number;
  correct: number;
  wrong: number;
}) {
  const progress = Math.min(100, Math.round((attempted / Math.max(1, goal)) * 100));

  return (
    <section className="rounded-2xl border border-white/10 bg-[#202020] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Target progress</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions completed against your goal
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {progress}% complete
        </span>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[132px_1fr]">
        <div
          className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-primary) 0 ${progress}%, var(--color-muted) ${progress}% 100%)`,
          }}
        >
          <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-[#202020]">
            <span className="text-2xl font-semibold">{attempted}</span>
            <span className="text-[10px] text-muted-foreground">/ {goal} target</span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subjectStats.length ? (
            subjectStats.map((item) => (
              <div key={item.subject} className="rounded-xl bg-muted/60 p-3">
                <p className="truncate text-xs font-semibold">{item.subject}</p>
                <p className="mt-1 text-lg font-semibold text-primary">{item.attempted}</p>
                <p className="text-[10px] text-muted-foreground">questions completed</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Your subjects will appear after your first test.
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-4">
        {[
          ["Tests", tests],
          ["Attempted", attempted],
          ["Correct", correct],
          ["Wrong", wrong],
        ].map(([label, value]) => (
          <div key={String(label)} className="text-center">
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Profile() {
  const records = useMemo(() => loadHistory(), []);
  const [profile, setProfile] = useState<PracticeProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");

  useEffect(() => {
    const refresh = () => {
      const saved = loadPracticeProfile();
      setProfile(saved);
      setNameDraft(saved?.name ?? "");
      setGoalDraft(saved ? String(saved.questionGoal) : "100");
    };
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    return () => window.removeEventListener("cbt-profile-updated", refresh);
  }, []);

  const totals = useMemo(() => aggregateRecords(records), [records]);
  const streaks = useMemo(() => getStreaks(records), [records]);
  const subjectStats = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.subject))).map((subject) => ({
        subject,
        ...aggregateRecords(records.filter((record) => record.subject === subject)),
      })),
    [records],
  );
  const recent = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [records],
  );
  const saveProfile = () => {
    if (!nameDraft.trim() || Number(goalDraft) < 1) return;
    const next = { name: nameDraft.trim(), questionGoal: Math.min(100000, Number(goalDraft)) };
    savePracticeProfile(next);
    setProfile(next);
    setEditingProfile(false);
  };
  const displayName = profile?.name ?? "Your profile";
  const questionGoal = profile?.questionGoal ?? 100;

  return (
    <AppShell title="Your Profile">
      <div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-5 bg-[#121212] px-4 py-6 text-zinc-100 sm:-mx-6 sm:px-6">
        <section className="rounded-2xl border border-white/10 bg-[#202020] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className={cn(
                  "group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl font-semibold text-white",
                  avatarColor(displayName),
                )}
              >
                <span className="transition-opacity group-hover:opacity-0">
                  {initials(displayName)}
                </span>
                <Pencil className="absolute h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-semibold">{displayName}</h2>
              </div>
            </div>
          </div>
        </section>

        <TargetProgress
          attempted={totals.attempted}
          goal={questionGoal}
          subjectStats={subjectStats.map(({ subject, attempted }) => ({ subject, attempted }))}
          tests={totals.tests}
          correct={totals.correct}
          wrong={totals.wrong}
        />

        <ActivityHeatmap records={records} maxStreak={streaks.longest} />

        <section className="rounded-2xl border border-white/10 bg-[#202020] p-5 sm:p-6">
          <h2 className="text-base font-semibold">Recent activity</h2>
          <div className="mt-3 divide-y divide-border">
            {recent.length ? (
              recent.map((record) => {
                const metrics = metricsForRecord(record);
                return (
                  <Link
                    key={record.id}
                    to="/history/$id"
                    params={{ id: record.id }}
                    className="flex items-center justify-between gap-3 py-3 hover:text-primary"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {record.subject} · {record.chapter}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.exercise ?? "Exercise 1"} · {formatDate(record.date)}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold">{record.score ?? "—"} marks</p>
                      <p className="text-muted-foreground">
                        {metrics.accuracy === null ? "—" : `${Math.round(metrics.accuracy)}%`}
                      </p>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No practice recorded yet.</p>
            )}
          </div>
        </section>
      </div>
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#202020] p-6 shadow-[0_24px_70px_-24px_black] sm:p-8">
            <h2 className="text-2xl font-semibold">Setup your profile</h2>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-zinc-200">
                Your name
                <Input
                  className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Question goal
                <Input
                  className="mt-2 h-11 border-white/10 bg-zinc-900 text-zinc-100"
                  inputMode="numeric"
                  value={goalDraft}
                  onChange={(event) => setGoalDraft(event.target.value.replace(/\D/g, ""))}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingProfile(false)}>
                Cancel
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={saveProfile}>
                <Save className="h-4 w-4" /> Save profile
              </Button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
