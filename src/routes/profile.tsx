import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Copy,
  Download,
  FilePenLine,
  LoaderCircle,
  Music2,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aggregateRecords } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { downloadPracticeBackup, restorePracticeBackup } from "@/lib/backup";
import {
  overallSyllabus,
  pct,
  subjectRevision,
  subjectSyllabus,
  testsDone,
  type TrackerData,
} from "@/lib/tracker";
import { IMPORT_PROMPT } from "@/lib/tracker";
import { loadTrackerData, saveTrackerData } from "@/lib/tracker-store";
import { cn } from "@/lib/utils";
import { MockTestLogDialog } from "../../tracker/src/components/tracker/MockTestLogDialog";

const title = "Profile";
const description = "Your yearly practice activity and progress.";
type ActivityRange = "today" | "week" | "month" | "year" | "all";
let hasShownProfileLoader = false;

const rangeLabels: Record<ActivityRange, string> = {
  today: "Today",
  week: "This week",
  month: "Last month",
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
  if (range === "month") start.setMonth(start.getMonth() - 1);
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

function activityDay(value: string) {
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  if (dateOnly) return dateOnly;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localDay(date);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatHeatmapTooltipDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type DayActivityDetail = { label: string; detail: string; count: number };

function DayActivityDetails({ date, items }: { date: string; items: DayActivityDetail[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="mt-3 min-h-16 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-300">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-100">{formatDate(date)}</span>
        <span className="text-zinc-500">
          {total} activit{total === 1 ? "y" : "ies"}
        </span>
      </div>
      {items.length ? (
        <ul className="mt-2 space-y-1">
          {items.map((item, index) => (
            <li
              key={`${item.label}-${item.detail}-${index}`}
              className="flex justify-between gap-3"
            >
              <span>
                <span className="text-zinc-100">{item.label}</span> · {item.detail}
              </span>
              <span className="shrink-0 font-mono text-zinc-500">×{item.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-zinc-500">No activity recorded on this day.</p>
      )}
    </div>
  );
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
      ...records.map((record) => activityDay(record.date)),
      ...(tracker?.tests.log ?? []).map((test) => activityDay(test.date)),
      ...(tracker?.activity ?? []).map((entry) => activityDay(entry.date)),
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
                        .map((date) => new Date(`${date}T00:00:00`).getTime())
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
    const details = new Map<string, DayActivityDetail[]>();
    const addDetail = (date: string, detail: DayActivityDetail) => {
      const dayDetails = details.get(date) ?? [];
      const matching = dayDetails.find(
        (item) => item.label === detail.label && item.detail === detail.detail,
      );
      if (matching) matching.count += detail.count;
      else details.set(date, [...dayDetails, detail]);
    };
    records.forEach((record) => {
      const key = activityDay(record.date);
      if (!key) return;
      const count = Math.max(1, record.answers.filter(Boolean).length);
      activity.set(key, (activity.get(key) ?? 0) + count);
      addDetail(key, {
        label: "Practice test",
        detail: `${record.subject} · ${record.chapter}`,
        count,
      });
    });
    tracker?.tests.log.forEach((test) => {
      const key = activityDay(test.date);
      if (!key) return;
      activity.set(key, (activity.get(key) ?? 0) + 1);
      const subject =
        test.subjectId === "__all__"
          ? test.type
          : (tracker.subjects.find((item) => item.id === test.subjectId)?.name ?? test.type);
      addDetail(key, {
        label: `${test.type} mock test`,
        detail:
          test.score !== null && test.total !== null
            ? `${subject} · ${test.score}/${test.total}`
            : subject,
        count: 1,
      });
    });
    tracker?.activity.forEach((entry) => {
      const key = activityDay(entry.date);
      if (!key) return;
      activity.set(key, (activity.get(key) ?? 0) + entry.count);
      const subject = tracker.subjects.find((item) => item.id === entry.subjectId);
      const chapter = subject?.chapters.find((item) => item.id === entry.chapterId);
      const chapterLabel =
        subject && chapter ? `${subject.name} · ${chapter.name}` : "Earlier saved activity";
      const revisionType = tracker.revision[subject?.id ?? ""]?.types.find(
        (item) => item.id === entry.revisionTypeId,
      );
      addDetail(key, {
        label:
          entry.type === "lecture"
            ? "Lectures"
            : entry.type === "revision"
              ? `Revision${revisionType ? ` · ${revisionType.name}` : ""}`
              : "Mock-test activity",
        detail: chapterLabel,
        count: Math.abs(entry.count),
      });
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
      days: entries.map((date, index) => ({
        date,
        value: values[index] ?? 0,
        maximum,
        details: details.get(localDay(date)) ?? [],
      })),
      monthLabels: labels,
      totalActivity: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter(Boolean).length,
      maxStreak: longest,
    };
  }, [records, tracker, range]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = days.find(({ date }) => localDay(date) === selectedDay) ?? days.at(-1);

  return (
    <section className="overflow-visible py-5 text-zinc-100 sm:py-6">
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
                <button
                  type="button"
                  key={localDay(date)}
                  onClick={() => setSelectedDay(localDay(date))}
                  aria-label={`${formatDate(localDay(date))}: ${value} activit${value === 1 ? "y" : "ies"}`}
                  className={cn(
                    "group relative aspect-square w-full rounded-[3px] ring-1 ring-inset ring-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                    startsMonth && "ml-px",
                    intensity === 0 && "bg-zinc-700",
                    intensity === 1 && "bg-emerald-200",
                    intensity === 2 && "bg-emerald-300",
                    intensity === 3 && "bg-emerald-500",
                    intensity === 4 && "bg-emerald-700",
                  )}
                >
                  <span className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#1d1d1d] px-2 py-1 text-[10px] font-medium text-zinc-200 shadow-lg group-hover:block group-focus-visible:block">
                    {value} activit{value === 1 ? "y" : "ies"} on {formatHeatmapTooltipDate(date)}
                  </span>
                </button>
              );
            })}
          </div>
          {activeDay && (
            <DayActivityDetails date={localDay(activeDay.date)} items={activeDay.details} />
          )}
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

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const displayValueRef = useRef(value);

  useEffect(() => {
    const startValue = displayValueRef.current;
    const difference = value - startValue;
    if (!difference) return;
    const startedAt = performance.now();
    const duration = 360;
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(startValue + difference * eased);
      displayValueRef.current = next;
      setDisplayValue(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{displayValue}</>;
}

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2 text-center sm:px-2">
      <p className="text-base font-semibold text-zinc-100">{children}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{label}</p>
    </div>
  );
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
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const practiceStats = [
    { label: "Practice sessions", value: tests },
    { label: "Correct", value: correct },
    { label: "Wrong", value: wrong },
  ];
  const trackerStats = [
    { label: "Lectures", value: lectures },
    { label: "Revisions", value: revisions },
    { label: "Mock tests", value: mockTests },
  ];

  useEffect(() => {
    if (!rangeOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rangeMenuRef.current?.contains(event.target as Node)) setRangeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRangeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rangeOpen]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-5">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Practice
        </span>
        <div ref={rangeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRangeOpen((open) => !open)}
            className="flex h-7 items-center gap-1 rounded-md bg-white/5 px-2 text-xs text-zinc-300 transition-colors hover:bg-white/10"
            aria-haspopup="listbox"
            aria-expanded={rangeOpen}
          >
            {rangeLabels[range]} <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </button>
          {rangeOpen && (
            <div
              role="listbox"
              className="absolute top-8 right-0 z-20 min-w-28 overflow-hidden rounded-md bg-[#202020] py-1 shadow-lg ring-1 ring-white/5"
            >
              {(Object.keys(rangeLabels) as ActivityRange[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === range}
                  onClick={() => {
                    onRangeChange(option);
                    setRangeOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {rangeLabels[option]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x-0 divide-y divide-white/10 px-2 py-2 sm:grid-cols-5 sm:divide-x sm:divide-y-0 sm:px-3">
        <StatCell label="Question goal">
          <AnimatedNumber value={goal} />
        </StatCell>
        <StatCell label="Practice sessions">
          <AnimatedNumber value={tests} />
        </StatCell>
        <StatCell label="Questions done">
          <AnimatedNumber value={attempted} />
        </StatCell>
        {practiceStats.slice(1).map(({ label, value }) => (
          <StatCell key={label} label={label}>
            <AnimatedNumber value={value} />
          </StatCell>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 pt-3 text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase sm:px-5">
        Study tracker
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/10 px-2 py-2 sm:px-3">
        {trackerStats.map(({ label, value }) => (
          <StatCell key={label} label={label}>
            <AnimatedNumber value={value} />
          </StatCell>
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
          <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
            Study tracker
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-50">{tracker.meta.examName}</h2>
        </div>
        <span className="font-mono text-xs text-zinc-400">
          {syllabus.done}/{syllabus.total} Lectures
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Link
          to="/track"
          search={{ tab: "Syllabus" }}
          className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06] sm:p-4"
        >
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
        </Link>

        <Link
          to="/track"
          search={{ tab: "Revision" }}
          className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06] sm:p-4"
        >
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
        </Link>

        <Link
          to="/track"
          search={{ tab: "Mock Test" }}
          className="rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06] sm:p-4"
        >
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
        </Link>
      </div>
    </section>
  );
}

export function Profile() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [tracker, setTracker] = useState<TrackerData | null>(null);
  const [range, setRange] = useState<ActivityRange>("today");
  const [profile, setProfile] = useState<PracticeProfile | null>(null);
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    const navigation = window.performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const legacyNavigation = window.performance.navigation;
    return (
      !hasShownProfileLoader &&
      (navigation?.type === "reload" || legacyNavigation?.type === legacyNavigation.TYPE_RELOAD)
    );
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const [previewingAvatar, setPreviewingAvatar] = useState(false);
  const [loggingMockTest, setLoggingMockTest] = useState(false);
  const [avatarFiles, setAvatarFiles] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [manifestationDraft, setManifestationDraft] = useState("");
  const [examNameDraft, setExamNameDraft] = useState("");
  const [examDateDraft, setExamDateDraft] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hasShownProfileLoader = true;
    let loaderTimer: ReturnType<typeof setTimeout> | undefined;
    let loaderFailSafe: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const startedAt = Date.now();
      const saved = loadPracticeProfile();
      setRecords(loadHistory());
      const trackerData = loadTrackerData();
      setTracker(trackerData);
      setExamNameDraft(trackerData.meta.examName);
      setExamDateDraft(trackerData.meta.examDate);
      setProfile(saved);
      setNameDraft(saved?.name ?? "");
      setGoalDraft(saved ? String(saved.questionGoal) : "100");
      setManifestationDraft(saved?.manifestation ?? "");
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
  const saveProfile = () => {
    if (!nameDraft.trim() || Number(goalDraft) < 1) return;
    const next = {
      name: nameDraft.trim(),
      questionGoal: Math.min(100000, Number(goalDraft)),
      ...(profile?.avatar ? { avatar: profile.avatar } : {}),
      ...(manifestationDraft.trim() ? { manifestation: manifestationDraft.trim() } : {}),
    };
    savePracticeProfile(next);
    if (tracker) {
      const nextTracker = saveTrackerData({
        ...tracker,
        meta: {
          ...tracker.meta,
          examName: examNameDraft.trim() || tracker.meta.examName,
          prepStartDate: tracker.meta.prepStartDate || localDay(new Date()),
          examDate: examDateDraft,
        },
      });
      setTracker(nextTracker);
    }
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
    const next = {
      name: displayName,
      questionGoal,
      avatar: nextAvatar,
      ...(profile?.manifestation ? { manifestation: profile.manifestation } : {}),
    };
    savePracticeProfile(next);
    setProfile(next);
  };
  const importJson = async (file: File) => {
    try {
      await restorePracticeBackup(file);
      const saved = loadPracticeProfile();
      const trackerData = loadTrackerData();
      setRecords(loadHistory());
      setTracker(trackerData);
      setProfile(saved);
      setNameDraft(saved?.name ?? "");
      setGoalDraft(saved ? String(saved.questionGoal) : "100");
      setManifestationDraft(saved?.manifestation ?? "");
      setExamDateDraft(trackerData.meta.examDate);
      setImportMessage("Data imported successfully.");
    } catch {
      setImportMessage("Choose a valid full backup or Tracker JSON file.");
    }
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
      <div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 pt-5 pb-10 text-zinc-100 sm:-mx-6 sm:px-6 sm:pt-6 sm:pb-14">
        <div className="mx-auto max-w-4xl space-y-7">
          <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            <div className="relative flex w-28 min-w-0 flex-col items-center">
              {avatar ? (
                <button
                  type="button"
                  onClick={() => setPreviewingAvatar(true)}
                  className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-white/10 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
                <div className="h-24 w-24 rounded-full bg-white/10" />
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-0 bottom-0 h-8 w-8 rounded-full bg-[#202020] text-zinc-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-zinc-100"
                onClick={updateAvatar}
                disabled={avatarFiles.length < 2}
                aria-label="Change profile image"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="min-w-0 flex-1">
              {tracker?.meta.examName && (
                <p className="font-mono text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  {tracker.meta.examName}
                </p>
              )}
              <h2 className="mt-0.5 truncate text-xl font-semibold text-zinc-50">{displayName}</h2>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
                  onClick={() => setLoggingMockTest(true)}
                >
                  <FilePenLine className="h-4 w-4" /> Log mock test
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <Link to="/history">
                    <FilePenLine className="h-4 w-4" /> Previous sessions
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
                  onClick={() => window.dispatchEvent(new Event("ssc-videos-open"))}
                >
                  <Play className="h-4 w-4" /> Videos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    window.dispatchEvent(new Event("ssc-music-open"));
                    window.dispatchEvent(new Event("ssc-music-expand"));
                  }}
                >
                  <Music2 className="h-4 w-4" /> Music
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  onClick={() => setEditingProfile(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  onClick={downloadPracticeBackup}
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-1.5 px-2.5 text-sm text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  onClick={() => {
                    setImportMessage("");
                    setImportingData(true);
                  }}
                >
                  <Upload className="h-3.5 w-3.5" /> Import
                </Button>
              </div>
            </div>
          </section>

          {tracker && (
            <MockTestLogDialog
              open={loggingMockTest}
              data={tracker}
              onClose={() => setLoggingMockTest(false)}
              onSave={(next) => setTracker(saveTrackerData(next))}
            />
          )}

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
              <label className="block text-sm font-medium text-zinc-200">
                Daily manifestation <span className="font-normal text-zinc-500">(optional)</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 uppercase placeholder:text-zinc-500 focus-visible:border-zinc-500 focus-visible:outline-none"
                  value={manifestationDraft}
                  onChange={(event) => setManifestationDraft(event.target.value.toUpperCase())}
                  placeholder="Write the sentence you want to type daily"
                />
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  Leave blank to keep the daily manifestation disabled.
                </span>
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Exam name
                <Input
                  className="mt-2 h-11 border-white/10 bg-[#151515] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  value={examNameDraft}
                  onChange={(event) => setExamNameDraft(event.target.value)}
                  placeholder="e.g. SSC CGL 2027"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Exam date <span className="font-normal text-zinc-500">(optional)</span>
                <Input
                  className="mt-2 h-11 border-white/10 bg-[#151515] text-zinc-100 focus-visible:border-zinc-500"
                  type="date"
                  value={examDateDraft}
                  onChange={(event) => setExamDateDraft(event.target.value)}
                />
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  Your preparation start is automatically saved from today.
                </span>
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
      {importingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1e1e1e] p-6 text-zinc-100 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Import data</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Upload a complete Profile backup or a Tracker JSON file.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:bg-white/10 hover:text-white"
                onClick={() => setImportingData(false)}
              >
                Close
              </Button>
            </div>
            <div className="mt-6 space-y-5">
              <div className="rounded-xl bg-white/[0.04] p-4">
                <p className="text-sm font-medium">1. Choose a JSON file</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Full backups restore Profile, Practice Sessions, and Study Tracker data.
                  Tracker-only JSON updates only the Study Tracker.
                </p>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) await importJson(file);
                    event.target.value = "";
                  }}
                />
                <Button
                  className="mt-3 bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => importFileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Choose JSON file
                </Button>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4">
                <p className="text-sm font-medium">2. Create syllabus JSON with ChatGPT</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Copy the prompt, share your chapter list or lecture screenshots with ChatGPT, then
                  save its raw JSON response and upload it above. Revision, mock tests, and practice
                  sessions can be added directly in the website later.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(IMPORT_PROMPT);
                      setPromptCopied(true);
                      window.setTimeout(() => setPromptCopied(false), 2000);
                    } catch {
                      setImportMessage("Copy failed. Please allow clipboard access and try again.");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" /> {promptCopied ? "Prompt copied" : "Copy prompt"}
                </Button>
              </div>
              {importMessage && <p className="text-sm text-emerald-300">{importMessage}</p>}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
