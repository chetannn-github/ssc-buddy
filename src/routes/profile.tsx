import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, LoaderCircle, Pencil, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aggregateRecords, metricsForRecord } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { downloadPracticeBackup } from "@/lib/backup";
import {
  overallSyllabus,
  pct,
  subjectRevision,
  subjectSyllabus,
  testsDone,
  type TrackerData,
} from "@/lib/tracker";
import { loadTrackerData } from "@/lib/tracker-store";
import { cn } from "@/lib/utils";

const title = "Profile";
const description = "Your yearly practice activity and progress.";
type ActivityRange = "today" | "week" | "year" | "all";

const rangeLabels: Record<ActivityRange, string> = {
  today: "Today",
  week: "This week",
  year: "This year",
  all: "All time",
};

function isInRange(dateValue: string, range: ActivityRange) {
  if (range === "all") return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(0, 0, 0, 0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "year") start.setDate(start.getDate() - 364);
  return date >= start;
}

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

function ActivityHeatmap({
  records,
  tracker,
  range,
}: {
  records: TestRecord[];
  tracker: TrackerData | null;
  range: ActivityRange;
}) {
  const { days, monthLabels, totalActivity, activeDays, maxStreak } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const datedActivity = [
      ...records.map((record) => record.date),
      ...(tracker?.tests.log ?? []).map((test) => test.date),
      ...(tracker?.activity ?? []).map((entry) => entry.date),
    ].filter(Boolean);
    const dayCount =
      range === "today"
        ? 1
        : range === "week"
          ? 7
          : range === "year"
            ? 365
            : Math.max(
                1,
                Math.ceil(
                  (today.getTime() -
                    Math.min(
                      ...datedActivity
                        .map((date) => new Date(date).getTime())
                        .filter(Number.isFinite),
                      today.getTime(),
                    )) /
                    86400000,
                ) + 1,
              );
    const entries = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (dayCount - 1 - index));
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
    tracker?.tests.log.forEach((test) => {
      if (!test.date) return;
      activity.set(test.date, (activity.get(test.date) ?? 0) + 1);
    });
    tracker?.activity.forEach((entry) => {
      if (!entry.date) return;
      activity.set(entry.date, (activity.get(entry.date) ?? 0) + entry.count);
    });
    const values = entries.map((date) => Math.max(0, activity.get(localDay(date)) ?? 0));
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

    let longest = 0;
    let current = 0;
    values.forEach((value) => {
      current = value > 0 ? current + 1 : 0;
      longest = Math.max(longest, current);
    });

    return {
      days: entries.map((date, index) => ({ date, value: values[index] ?? 0, maximum })),
      monthLabels: labels,
      totalActivity: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter(Boolean).length,
      maxStreak: longest,
    };
  }, [records, tracker, range]);

  return (
    <section className="overflow-hidden py-5 text-zinc-100 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm">
        <p className="text-zinc-400">
          {totalActivity} activities · {rangeLabels[range].toLowerCase()}
        </p>
        <p className="text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span className="font-semibold text-zinc-100">{activeDays}</span>
            <span>active days</span>
          </span>
          <span className="mx-3 text-zinc-600 sm:mx-4">·</span>
          <span className="inline-flex items-center gap-2">
            <span className="font-semibold text-zinc-100">{maxStreak}</span>
            <span>max streak</span>
          </span>
        </p>
      </div>

      <div className="mt-5">
        <div>
          <div className="relative mb-2 h-4 text-[10px] text-zinc-400">
            {monthLabels.map(({ label, index }) => (
              <span
                key={`${label}-${index}`}
                className="absolute"
                style={{ left: `${(index / Math.max(1, days.length - 1)) * 100}%` }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px] [grid-auto-columns:minmax(0,1fr)]">
            {days.map(({ date, value, maximum }, index) => {
              const intensity = value === 0 ? 0 : Math.min(4, Math.ceil((value / maximum) * 4));
              const startsMonth = index > 0 && date.getMonth() !== days[index - 1]?.date.getMonth();
              return (
                <span
                  key={localDay(date)}
                  title={`${formatDate(localDay(date))}: ${value} activit${value === 1 ? "y" : "ies"}`}
                  className={cn(
                    "aspect-square w-full rounded-[3px] ring-1 ring-inset ring-white/5",
                    startsMonth && "ml-px",
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

function defaultAvatar(name: string, files: string[]) {
  if (!files.length) return undefined;
  const hash = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return files[hash % files.length];
}

function avatarUrl(file: string) {
  return `/avatars/${encodeURIComponent(file)}`;
}

function TargetProgress({
  attempted,
  goal,
  tests,
  correct,
  wrong,
  lectures,
  revisions,
  mockTests,
  range,
  onRangeChange,
}: {
  attempted: number;
  goal: number;
  tests: number;
  correct: number;
  wrong: number;
  lectures: number;
  revisions: number;
  mockTests: number;
  range: ActivityRange;
  onRangeChange: (range: ActivityRange) => void;
}) {
  const progress = Math.min(100, Math.round((attempted / Math.max(1, goal)) * 100));
  const practiceStats = [
    ["Question goal", goal],
    ["Completed", `${attempted} · ${progress}%`],
    ["Practice sessions", tests],
    ["Correct", correct],
    ["Wrong", wrong],
  ];
  const trackerStats = [
    ["Lectures", lectures],
    ["Revisions", revisions],
    ["Mock tests", mockTests],
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-5">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Practice
        </span>
        <select
          value={range}
          onChange={(event) => onRangeChange(event.target.value as ActivityRange)}
          aria-label="Activity range"
          className="h-7 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-zinc-300 outline-none hover:bg-white/10 focus:border-zinc-500"
        >
          {(Object.keys(rangeLabels) as ActivityRange[]).map((option) => (
            <option key={option} value={option} className="bg-[#1a1a1a]">
              {rangeLabels[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 divide-x-0 divide-y divide-white/10 px-2 py-2 sm:grid-cols-5 sm:divide-x sm:divide-y-0 sm:px-3">
        {practiceStats.map(([label, value]) => (
          <div key={String(label)} className="px-3 py-2 text-center sm:px-2">
            <p className="text-base font-semibold text-zinc-100">{value}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{label}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 pt-3 text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase sm:px-5">
        Study tracker
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/10 px-2 py-2 sm:px-3">
        {trackerStats.map(([label, value]) => (
          <div key={String(label)} className="px-3 py-2 text-center sm:px-4">
            <p className="text-base font-semibold text-zinc-100">{value}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackerRow({
  label,
  done,
  total,
  tone = "bg-blue-500",
}: {
  label: string;
  done: number;
  total: number;
  tone?: string;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
      <span className="truncate text-zinc-300">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.min(100, pct(done, total))}%` }}
        />
      </div>
      <span className="font-mono text-xs text-zinc-500">
        {done}/{total}
      </span>
    </div>
  );
}

function StudyTrackerOverview({ tracker }: { tracker: TrackerData | null }) {
  if (!tracker) return null;
  const syllabus = overallSyllabus(tracker);
  const mockDone = tracker.tests.mocks.pre.done + tracker.tests.mocks.mains.done;
  const mockTarget = tracker.tests.mocks.pre.target + tracker.tests.mocks.mains.target;

  return (
    <section className="border-t border-white/10 pt-5 sm:pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Study tracker</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Lectures, revision and mock-test progress</p>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          {syllabus.done}/{syllabus.total} syllabus
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <p className="text-xs font-medium text-zinc-400">Syllabus</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {pct(syllabus.done, syllabus.total)}%
          </p>
          <div className="mt-3 divide-y divide-white/5">
            {tracker.subjects.map((subject) => {
              const progress = subjectSyllabus(subject);
              return (
                <TrackerRow
                  key={subject.id}
                  label={subject.name}
                  done={progress.done}
                  total={progress.total}
                />
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <p className="text-xs font-medium text-zinc-400">Revision</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">By subject</p>
          <div className="mt-3 divide-y divide-white/5">
            {tracker.subjects.map((subject) => {
              const progress = subjectRevision(tracker, subject);
              return (
                <TrackerRow
                  key={subject.id}
                  label={subject.name}
                  done={progress.done}
                  total={progress.total}
                  tone="bg-emerald-500"
                />
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
          <p className="text-xs font-medium text-zinc-400">Mock tests</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">Practice progress</p>
          <div className="mt-3 divide-y divide-white/5">
            {tracker.subjects.map((subject) => (
              <TrackerRow
                key={subject.id}
                label={subject.name}
                done={testsDone(tracker, subject.id)}
                total={tracker.tests.targets[subject.id] ?? 0}
                tone="bg-violet-500"
              />
            ))}
            <TrackerRow
              label="Full mocks"
              done={mockDone}
              total={mockTarget}
              tone="bg-violet-500"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Profile() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [tracker, setTracker] = useState<TrackerData | null>(null);
  const [range, setRange] = useState<ActivityRange>("year");
  const [profile, setProfile] = useState<PracticeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [previewingAvatar, setPreviewingAvatar] = useState(false);
  const [avatarFiles, setAvatarFiles] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");

  useEffect(() => {
    let loaderTimer: ReturnType<typeof setTimeout> | undefined;
    let loaderFailSafe: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const startedAt = Date.now();
      const saved = loadPracticeProfile();
      setRecords(loadHistory());
      setTracker(loadTrackerData());
      setProfile(saved);
      setNameDraft(saved?.name ?? "");
      setGoalDraft(saved ? String(saved.questionGoal) : "100");
      // Never leave the screen blocked if a static avatar file stalls on a weak connection.
      loaderFailSafe = setTimeout(() => setIsLoading(false), 1500);
      try {
        const response = await fetch("/avatars/manifest.json", { cache: "no-store" });
        if (response.ok) {
          const files = (await response.json()) as unknown;
          if (Array.isArray(files)) {
            setAvatarFiles(files.filter((file): file is string => typeof file === "string"));
          }
        }
      } catch {
        setAvatarFiles([]);
      } finally {
        if (loaderFailSafe) clearTimeout(loaderFailSafe);
        loaderTimer = setTimeout(
          () => setIsLoading(false),
          Math.max(0, 700 - (Date.now() - startedAt)),
        );
      }
    };
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    window.addEventListener("cbt-tracker-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      if (loaderTimer) clearTimeout(loaderTimer);
      if (loaderFailSafe) clearTimeout(loaderFailSafe);
      window.removeEventListener("cbt-profile-updated", refresh);
      window.removeEventListener("cbt-tracker-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const filteredRecords = useMemo(
    () => records.filter((record) => isInRange(record.date, range)),
    [records, range],
  );
  const totals = useMemo(() => aggregateRecords(filteredRecords), [filteredRecords]);
  const trackerTotals = useMemo(() => {
    if (!tracker) return { lectures: 0, revisions: 0, mockTests: 0 };
    const activity = tracker.activity.filter((entry) => isInRange(entry.date, range));
    const totalFor = (type: "lecture" | "revision" | "mock-test") =>
      Math.max(
        0,
        activity
          .filter((entry) => entry.type === type)
          .reduce((total, entry) => total + entry.count, 0),
      );
    const lectures = totalFor("lecture");
    const revisions = totalFor("revision");
    const mockTests =
      totalFor("mock-test") +
      tracker.tests.log.filter((test) => isInRange(test.date, range)).length;
    return { lectures, revisions, mockTests };
  }, [range, tracker]);
  const recent = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  const saveProfile = () => {
    if (!nameDraft.trim() || Number(goalDraft) < 1) return;
    const next = {
      name: nameDraft.trim(),
      questionGoal: Math.min(100000, Number(goalDraft)),
      ...(profile?.avatar ? { avatar: profile.avatar } : {}),
    };
    savePracticeProfile(next);
    setProfile(next);
    setEditingProfile(false);
  };
  const displayName = profile?.name ?? "Your profile";
  const questionGoal = profile?.questionGoal ?? 100;
  const avatar = profile?.avatar ?? defaultAvatar(displayName, avatarFiles);
  const updateAvatar = () => {
    const options = avatarFiles.filter((file) => file !== avatar);
    const nextAvatar = options[Math.floor(Math.random() * options.length)] ?? avatar;
    if (!nextAvatar) return;
    const next = { name: displayName, questionGoal, avatar: nextAvatar };
    savePracticeProfile(next);
    setProfile(next);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#121212] text-zinc-300 backdrop-blur-xl">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1d1d1d] px-4 py-3 shadow-2xl">
          <LoaderCircle className="h-4 w-4 animate-spin text-emerald-400" />
          <span className="text-sm font-medium">Loading profile</span>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Your Profile">
      <div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 pt-6 pb-10 text-zinc-100 sm:-mx-6 sm:px-6 sm:pt-8 sm:pb-14">
        <div className="mx-auto max-w-4xl space-y-7">
          <section className="flex flex-col items-center text-center">
            <div className="relative flex w-40 min-w-0 flex-col items-center gap-3">
              {avatar ? (
                <button
                  type="button"
                  onClick={() => setPreviewingAvatar(true)}
                  className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-full ring-2 ring-white/10 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  aria-label="Preview profile image"
                >
                  <img
                    src={avatarUrl(avatar)}
                    alt="Profile avatar"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                </button>
              ) : (
                <div className="h-20 w-20 rounded-full bg-white/10" />
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute top-28 left-2 h-8 w-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                onClick={() => setEditingProfile(true)}
                aria-label="Edit profile"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute top-28 right-2 h-8 w-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                onClick={updateAvatar}
                disabled={avatarFiles.length < 2}
                aria-label="Change profile image"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <div className="min-w-0 pt-1">
                <h2 className="truncate text-2xl font-semibold text-zinc-50">{displayName}</h2>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                onClick={downloadPracticeBackup}
              >
                <Download className="h-3.5 w-3.5" /> Export backup
              </Button>
            </div>
          </section>

          <TargetProgress
            attempted={totals.attempted}
            goal={questionGoal}
            tests={totals.tests}
            correct={totals.correct}
            wrong={totals.wrong}
            lectures={trackerTotals.lectures}
            revisions={trackerTotals.revisions}
            mockTests={trackerTotals.mockTests}
            range={range}
            onRangeChange={setRange}
          />

          <ActivityHeatmap records={records} tracker={tracker} range="year" />

          <StudyTrackerOverview tracker={tracker} />

          <section className="border-t border-white/10 pt-5 sm:pt-6">
            <h2 className="text-base font-semibold">Recent practice sessions</h2>
            <div className="mt-3">
              {recent.length ? (
                recent.map((record) => {
                  const metrics = metricsForRecord(record);
                  return (
                    <Link
                      key={record.id}
                      to="/history/$id"
                      params={{ id: record.id }}
                      className="flex items-center justify-between gap-3 border-b border-white/10 py-3 last:border-b-0"
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
                <p className="py-4 text-sm text-muted-foreground">
                  No practice sessions recorded yet.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
      {previewingAvatar && avatar && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6 backdrop-blur-md"
          onClick={() => setPreviewingAvatar(false)}
          aria-label="Close profile image preview"
        >
          <img
            src={avatarUrl(avatar)}
            alt="Profile avatar preview"
            className="max-h-[80vh] max-w-[min(80vw,32rem)] rounded-2xl object-contain shadow-2xl"
          />
        </button>
      )}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1e1e1e] p-6 text-zinc-100 shadow-2xl sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-50">
              Setup your profile
            </h2>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-zinc-200">
                Your name
                <Input
                  className="mt-2 h-11 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Question goal
                <Input
                  className="mt-2 h-11 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  inputMode="numeric"
                  value={goalDraft}
                  onChange={(event) => setGoalDraft(event.target.value.replace(/\D/g, ""))}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                onClick={() => setEditingProfile(false)}
              >
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
