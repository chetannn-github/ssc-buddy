import { ProfileStudyLock } from "@/components/profile/ProfileStudyLock";
import { PublicFocusTime } from "@/components/profile/PublicFocusTime";
import * as focusReader from "../../shared/study-lock";
import { useProfileFocusData } from "../../shared/use-profile-focus";
import { getFirebaseFirestore } from "@/lib/firebase-sync";
import { AccentPicker } from "@/components/profile/AccentPicker";
import { applyWebAccent, normalizeAppAccent, type AppAccent } from "@/lib/app-accent";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  LogOut,
  Music2,
  Play,
  RefreshCw,
  Save,
  Settings,
  Upload,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RollingNumber, RollingDuration } from "@/components/ui/rolling-number";
import { LiquidProgressBar, ProfileXpBar } from "@/components/profile/ProfileXpBar";
import { StreakLiquidFlame } from "@/components/profile/StreakLiquidFlame";
import "@/components/profile/liquid-heatmap.css";
import { useRandomHeatmapFill } from "@/components/profile/use-random-heatmap-fill";
import { HEATMAP_EMPTY_COLOR, heatmapPaletteColor, heatmapCellColors, nextProfileColorTheme, type HeatmapColorCycle } from "../../mobile-tasks/src/domain/heatmap-colors";
import { layoutHeatmapMonths } from "../../mobile-tasks/src/domain/heatmap-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aggregateRecords, getStreaks } from "@/lib/analytics";
import { loadHistory, type TestRecord } from "@/lib/exam";
import { loadPracticeProfile, savePracticeProfile, type PracticeProfile } from "@/lib/profile";
import { restorePracticeBackup } from "@/lib/backup";
import {
  signOutFirebase,
} from "@/lib/firebase-sync";
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
import { useAuthUser } from "@/lib/auth-context";
import { checkUsernameAvailability, normalizeUsername, saveProfileWithUsername, usernameValidationMessage } from "@/lib/firebase-sync";
import type { PublicProfile } from "@/lib/firebase-sync";
import { formatDuration, loadDailyTasks, type DailyTask } from "@/lib/daily-tasks";
import { useWeeklyMedalCounts } from "@/lib/weekly-results";
import { getXpSummary, levelName, xpForLevel, xpSegmentProgress } from "@/lib/xp";

const title = "Profile";
const description = "Your yearly practice activity and progress.";
type ActivityRange = "today" | "week" | "month" | "lastMonth" | "year" | "all";

const rangeLabels: Record<ActivityRange, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  lastMonth: "Last month",
  year: "This year",
  all: "All time",
};

function isInRange(dateValue: string, range: ActivityRange) {
  if (range === "all") return true;
  const date = activityDay(dateValue);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let from = new Date(today);
  let to = new Date(today);
  if (range === "week") from.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (range === "month") from = new Date(today.getFullYear(), today.getMonth(), 1);
  if (range === "lastMonth") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 0);
  }
  if (range === "year") from = new Date(today.getFullYear(), 0, 1);
  return date >= localDay(from) && date <= localDay(to);
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

function activityDotClass(label: string) {
  if (label === "Lecture") return "bg-sky-400";
  if (label.startsWith("Revision")) return "bg-emerald-400";
  if (label.includes("Mock")) return "bg-violet-400";
  if (label === "Quick recall") return "bg-amber-400";
  return "bg-blue-400";
}

function DayActivityDetails({ date, items }: { date: string; items: DayActivityDetail[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="mt-3 min-h-16 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-zinc-300">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-100">{formatDate(date)}</span>
        <span className="text-zinc-500">
          <RollingNumber value={total} /> activit{total === 1 ? "y" : "ies"}
        </span>
      </div>
      {items.length ? (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item, index) => (
            <li
              key={`${item.label}-${item.detail}-${index}`}
              className="flex justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", activityDotClass(item.label))}
                />
                <span className="min-w-0 truncate">
                  <span className="text-zinc-100">{item.label}</span> · {item.detail}
                </span>
              </span>
              <span className="shrink-0 font-mono text-zinc-500"><RollingNumber value={item.count} prefix="×" /></span>
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
  colorTheme,
  records,
  tracker,
  tasks,
  range,
  activityEnabled = true,
  publicActivity,
  dataReady = true,
}: {
  colorTheme: HeatmapColorCycle;
  records: TestRecord[];
  tracker: TrackerData | null;
  tasks: DailyTask[];
  range: ActivityRange;
  activityEnabled?: boolean;
  publicActivity?: Record<string, number> | undefined;
  dataReady?: boolean;
}) {
  const { cycle: liquidCycle, enabled: liquidEnabled } = useRandomHeatmapFill(colorTheme);
  const todayKey = localDay(new Date());
  const hasTodayTask = tasks.some((task) => task.completed && activityDay(task.date) === todayKey);
  const hasTodayActivity = Boolean(
    publicActivity?.[todayKey]
    || records.some((record) => activityDay(record.date) === todayKey)
    || (tracker?.tests.log ?? []).some((test) => activityDay(test.date) === todayKey)
    || (tracker?.activity ?? []).some((entry) => activityDay(entry.date) === todayKey),
  );
  // Prefer the only heatmap that has something today. Activity remains the
  // deterministic default when both (or neither) have an entry.
  const defaultMode: "activity" | "tasks" = !activityEnabled ? "tasks" : (!hasTodayActivity && hasTodayTask ? "tasks" : "activity");
  const [mode, setMode] = useState<"activity" | "tasks">(defaultMode);
  const hasAppliedDefaultMode = useRef(false);
  useEffect(() => {
    if (!activityEnabled) { setMode("tasks"); return; }
    if (!dataReady || hasAppliedDefaultMode.current) return;
    hasAppliedDefaultMode.current = true;
    setMode(defaultMode);
  }, [activityEnabled, dataReady, defaultMode]);
  const { days, months, totalActivity, activeDays, maxStreak } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const datedActivity = mode === "tasks" ? tasks.map((task) => task.date) : [
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
    const taskActivity = new Map<string, number>();
    const taskDetails = new Map<string, DayActivityDetail[]>();
    const addDetail = (target: Map<string, DayActivityDetail[]>, date: string, detail: DayActivityDetail) => {
      const dayDetails = target.get(date) ?? [];
      const matching = dayDetails.find(
        (item) => item.label === detail.label && item.detail === detail.detail,
      );
      if (matching) matching.count += detail.count;
      else target.set(date, [...dayDetails, detail]);
    };
    tasks.forEach((task) => {
      if (!task.completed) return;
      const key = activityDay(task.date);
      if (!key) return;
      taskActivity.set(key, (taskActivity.get(key) ?? 0) + 1);
      addDetail(taskDetails, key, {
        label: task.type,
        detail: [task.subject, task.name, task.minutesSpent ? formatDuration(task.minutesSpent) : ""]
          .filter(Boolean)
          .join(" · "),
        count: 1,
      });
    });
    records.forEach((record) => {
      const key = activityDay(record.date);
      if (!key) return;
      // A completed practice session represents one daily activity, regardless of question count.
      const count = 1;
      const isQuickRecall = record.testMode === "quick-recall" || record.subject === "Quick Recall";
      const questionCount =
        record.questionIds?.length ??
        record.questions?.length ??
        record.questionNumbers?.length ??
        record.answers.length;
      activity.set(key, (activity.get(key) ?? 0) + count);
      addDetail(details, key, {
        label: isQuickRecall ? "Quick recall" : "Practice session",
        detail: isQuickRecall
          ? `${questionCount} question${questionCount === 1 ? "" : "s"}`
          : [record.subject, record.chapter, `${questionCount} question${questionCount === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
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
      addDetail(details, key, {
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
      const count = Math.max(1, Math.abs(Number(entry.count) || 1));
      activity.set(key, (activity.get(key) ?? 0) + count);
      const subject = tracker.subjects.find((item) => item.id === entry.subjectId);
      const chapter = subject?.chapters.find((item) => item.id === entry.chapterId);
      const chapterLabel =
        subject && chapter ? `${subject.name} · ${chapter.name}` : "Earlier saved activity";
      const revisionType = tracker.revision[subject?.id ?? ""]?.types.find(
        (item) => item.id === entry.revisionTypeId,
      );
      addDetail(details, key, {
        label:
          entry.type === "lecture"
            ? "Lecture"
            : entry.type === "revision"
              ? `Revision${revisionType ? ` · ${revisionType.name}` : ""}`
              : "Mock test",
        detail: chapterLabel,
        count,
      });
    });
    Object.entries(publicActivity ?? {}).forEach(([key, rawCount]) => {
      const count = Math.max(1, Math.round(Number(rawCount) || 1));
      activity.set(key, (activity.get(key) ?? 0) + count);
      addDetail(details, key, { label: "Study activity", detail: "Shared profile", count });
    });
    const sourceActivity = mode === "tasks" ? taskActivity : activity;
    const sourceDetails = mode === "tasks" ? taskDetails : details;
    const values = entries.map((date) => Math.max(0, sourceActivity.get(localDay(date)) ?? 0));
    const maximum = Math.max(...values, 1);
    let longest = 0;
    let current = 0;
    values.forEach((value) => {
      current = value > 0 ? current + 1 : 0;
      longest = Math.max(longest, current);
    });

    const mappedDays = entries.map((date, index) => ({
      date,
      value: values[index] ?? 0,
      maximum,
      details: sourceDetails.get(localDay(date)) ?? [],
    }));
    const monthGroups = layoutHeatmapMonths(mappedDays);

    return {
      days: mappedDays,
      months: monthGroups,
      totalActivity: values.reduce((sum, value) => sum + value, 0),
      activeDays: values.filter(Boolean).length,
      maxStreak: longest,
    };
  }, [mode, publicActivity, records, tasks, tracker, range]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const heatmapScrollRef = useRef<HTMLDivElement>(null);
  const activeDay = days.find(({ date }) => localDay(date) === selectedDay) ?? days.at(-1);

  useEffect(() => {
    const scroller = heatmapScrollRef.current;
    if (!scroller || !window.matchMedia("(max-width: 639px)").matches) return;
    const frame = requestAnimationFrame(() => {
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [months.length]);

  return (
    <section className="overflow-visible py-3 text-zinc-100 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm">
        <p className="text-zinc-400">
          <RollingNumber value={totalActivity} /> {mode === "tasks" ? "tasks completed" : "activities"} · {rangeLabels[range].toLowerCase()}
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <p className="text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold text-zinc-100"><RollingNumber value={activeDays} /></span>
              <span>active days</span>
            </span>
            <span className="mx-3 text-zinc-600 sm:mx-4">·</span>
            <span className="inline-flex items-center gap-2">
              <span className="font-semibold text-zinc-100"><RollingNumber value={maxStreak} /></span>
              <span>max streak</span>
            </span>
          </p>
          {activityEnabled && <div className="relative grid shrink-0 grid-cols-2 rounded-lg bg-white/[.04] p-1 text-xs">
            <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-zinc-100 shadow-sm transition-transform duration-300 ease-out", mode === "tasks" && "translate-x-full")} />
            {(["activity", "tasks"] as const).map((option) => <button key={option} type="button" onClick={() => setMode(option)} className={cn("relative z-10 rounded-md px-2.5 py-1 font-medium transition-colors duration-200", mode === option ? "text-zinc-900" : "text-zinc-400 hover:text-white")}>{option === "activity" ? "Activity" : "Tasks"}</button>)}
          </div>}
        </div>
      </div>

      <div className="mt-2">
        <div>
          <div
            ref={heatmapScrollRef}
            className="overflow-x-auto overflow-y-visible pt-1 pb-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-track]:bg-zinc-800 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
          >
            <div className="flex w-max items-start gap-2.5 sm:w-full">
              {months.map((month) => (
                <div key={month.key} className="shrink-0 sm:min-w-0 sm:basis-0" style={{ width: month.columns * 13 + (month.columns - 1) * 3, flexGrow: month.columns }}>
                  <div
                    className="grid grid-flow-col grid-rows-7 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${month.columns}, minmax(0, 1fr))` }}
                  >
                    {month.days.map(({ date, value, maximum, row, column }) => {
                      const intensity =
                        value === 0 ? 0 : Math.min(4, Math.ceil((value / maximum) * 4));
                      const liquidColors = heatmapCellColors(localDay(date), intensity, liquidCycle);
                      const cellColor = heatmapPaletteColor(intensity, liquidCycle, mode);
                      return (
                        <button
                          type="button"
                          key={localDay(date)}
                          style={{ gridRow: row + 1, gridColumn: column + 1, backgroundColor: HEATMAP_EMPTY_COLOR }}
                          onClick={() => setSelectedDay(localDay(date))}
                          onMouseEnter={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            setHoveredTooltip({
                              text: `${value} ${mode === "tasks" ? `task${value === 1 ? "" : "s"} completed` : `activit${value === 1 ? "y" : "ies"}`} on ${formatHeatmapTooltipDate(date)}`,
                              x: Math.max(10, Math.min(window.innerWidth - 10, box.left + box.width / 2)),
                              y: box.top - 8,
                            });
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                          onFocus={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            setHoveredTooltip({
                              text: `${value} ${mode === "tasks" ? `task${value === 1 ? "" : "s"} completed` : `activit${value === 1 ? "y" : "ies"}`} on ${formatHeatmapTooltipDate(date)}`,
                              x: Math.max(10, Math.min(window.innerWidth - 10, box.left + box.width / 2)),
                              y: box.top - 8,
                            });
                          }}
                          onBlur={() => setHoveredTooltip(null)}
                          aria-label={`${formatDate(localDay(date))}: ${value} ${mode === "tasks" ? "tasks completed" : "activities"}`}
                          className={cn(
                            "group relative aspect-square w-full rounded-[3px] ring-1 ring-inset ring-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                            "bg-zinc-700",
                          )}
                        >
                          {intensity > 0 && <span aria-hidden="true" className={cn("heatmap-liquid", !liquidEnabled && "heatmap-liquid-paused")} style={{ backgroundColor: HEATMAP_EMPTY_COLOR, "--heatmap-liquid-color": cellColor } as CSSProperties}>
                            <span key={`${mode}-${liquidCycle.seed}`} className="heatmap-liquid-fill heatmap-color-refill" style={{ height: "100%", animationDuration: "1200ms" }}>
                              <span className="heatmap-liquid-bubble" style={{ animationDelay: `-${liquidColors.delay}ms` }} />
                              <span className="heatmap-liquid-bubble heatmap-liquid-bubble-second" style={{ animationDelay: `-${liquidColors.delay + 1400}ms` }} />
                            </span>
                          </span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-center text-[10px] text-zinc-400">{month.label}</p>
                </div>
              ))}
            </div>
          </div>
          {activeDay && (
            <DayActivityDetails date={localDay(activeDay.date)} items={activeDay.details} />
          )}
        </div>
      </div>
      {hoveredTooltip && typeof document !== "undefined"
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-[#121212] px-2 py-1 text-[10px] font-medium text-zinc-200 shadow-lg"
              style={{ left: hoveredTooltip.x, top: hoveredTooltip.y }}
            >
              {hoveredTooltip.text}
            </span>,
            document.body,
          )
        : null}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-zinc-400">
        Less
        {[0, 1, 2, 3, 4].map((intensity) => (
          <span
            key={intensity}
            className={cn(
              "h-3 w-3 rounded-[3px]",
              intensity === 0 && "bg-zinc-700",
            )}
            style={{ backgroundColor: heatmapPaletteColor(intensity, liquidCycle, mode) }}
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
  studyMinutes,
  completedTasks,
  incompleteTasks,
  focusTime,
  range,
  onRangeChange,
  showPractice = true,
  showTracker = true,
}: {
  attempted: number;
  goal: number;
  tests: number;
  correct: number;
  wrong: number;
  lectures: number;
  revisions: number;
  mockTests: number;
  studyMinutes: number;
  completedTasks: number;
  incompleteTasks: number;
  focusTime: string;
  range: ActivityRange;
  onRangeChange: (range: ActivityRange) => void;
  showPractice?: boolean;
  showTracker?: boolean;
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
    <section className="overflow-visible rounded-2xl border border-white/10 bg-[#121212]">
      <div className="flex items-center justify-between gap-3 px-4 pt-2 sm:px-5">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          {showPractice ? "Practice" : showTracker ? "Study tracker" : "Tasks"}
        </span>
        <div ref={rangeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRangeOpen((open) => !open)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.045] px-2.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1]"
            aria-haspopup="listbox"
            aria-expanded={rangeOpen}
          >
            <span>{rangeLabels[range]}</span>
            <ChevronDown
              className={
                rangeOpen
                  ? "h-3.5 w-3.5 rotate-180 text-zinc-200 transition-transform duration-200"
                  : "h-3.5 w-3.5 text-zinc-500 transition-transform duration-200"
              }
            />
          </button>
          {rangeOpen && (
            <div
              role="listbox"
              className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute top-8 right-0 z-30 min-w-32 origin-top-right rounded-md border border-white/10 bg-[#121212] p-1 shadow-xl duration-200 ease-out"
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
                  className={
                    option === range
                      ? "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-medium text-zinc-900 bg-zinc-100"
                      : "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                  }
                >
                  {rangeLabels[option]}
                  {option === range && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {showPractice && <div className="grid grid-cols-2 divide-x-0 divide-y divide-white/10 px-2 py-1.5 sm:grid-cols-5 sm:divide-x sm:divide-y-0 sm:px-3">
        <StatCell label="Question goal">
          <RollingNumber value={goal} />
        </StatCell>
        <StatCell label="Practice sessions">
          <RollingNumber value={tests} />
        </StatCell>
        <StatCell label="Questions done">
          <RollingNumber value={attempted} />
        </StatCell>
        {practiceStats.slice(1).map(({ label, value }) => (
          <StatCell key={label} label={label}>
            <RollingNumber value={value} />
          </StatCell>
        ))}
      </div>}
      {showPractice && showTracker && <div className="border-t border-white/10 px-4 pt-2 text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase sm:px-5">
        Study tracker
      </div>}
      {showTracker && <div className="grid grid-cols-3 divide-x divide-y divide-white/10 px-2 py-1.5 sm:grid-cols-6 sm:divide-y-0 sm:px-3">
        {trackerStats.map(({ label, value }) => (
          <StatCell key={label} label={label}>
            <RollingNumber value={value} />
          </StatCell>
        ))}
        <StatCell label="Study time"><RollingDuration minutes={studyMinutes} /></StatCell>
        <StatCell label="Tasks completed">
          <RollingNumber value={completedTasks} />/{completedTasks + incompleteTasks}
        </StatCell>
        <StatCell label="Focus time">{focusTime}</StatCell>
      </div>}
      {!showTracker && <div className="grid grid-cols-3 divide-x divide-y divide-white/10 px-2 py-1.5 sm:divide-y-0 sm:px-3">
        <StatCell label="Study time"><RollingDuration minutes={studyMinutes} /></StatCell>
        <StatCell label="Tasks completed">
          <RollingNumber value={completedTasks} />/{completedTasks + incompleteTasks}
        </StatCell>
        <StatCell label="Focus time">{focusTime}</StatCell>
      </div>}
    </section>
  );
}

function TrackerRow({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
      <span className="truncate text-zinc-300">{label}</span>
      <LiquidProgressBar progress={pct(done, total) / 100} color="var(--app-accent)" />
      <span className="font-mono text-xs text-zinc-500">
        {done}/{total}
      </span>
    </div>
  );
}

function StudyTrackerOverview({ tracker, readOnly = false }: { tracker: TrackerData | null; readOnly?: boolean }) {
  if (!tracker) return null;
  const syllabus = overallSyllabus(tracker);
  const hasSubjects = tracker.subjects.length > 0;
  const hasRevision = tracker.subjects.some(
    (subject) => (tracker.revision[subject.id]?.types.length ?? 0) > 0,
  );
  const hasMockData =
    tracker.tests.log.length > 0 ||
    tracker.subjects.some((subject) => (tracker.tests.targets[subject.id] ?? 0) > 0) ||
    tracker.tests.mocks.pre.done > 0 ||
    tracker.tests.mocks.pre.target > 0 ||
    tracker.tests.mocks.mains.done > 0 ||
    tracker.tests.mocks.mains.target > 0;
  const showSyllabus = hasSubjects;
  const showRevision = hasSubjects && (!readOnly || hasRevision);
  const showMocks = !readOnly || hasMockData;
  const cardCount = Number(showSyllabus) + Number(showRevision) + Number(showMocks);
  if (readOnly && cardCount === 0) return null;

  return (
    <section className="-mt-3 border-t border-white/10 pt-4 sm:pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-zinc-500 uppercase">
            Study tracker
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-50">{tracker.meta.examName}</h2>
        </div>
        {hasSubjects && <span className="font-mono text-xs text-zinc-400">
          {syllabus.done}/{syllabus.total} Lectures
        </span>}
      </div>
      <div className={`mt-3 grid gap-2 ${cardCount > 1 ? cardCount === 3 ? "md:grid-cols-3" : "md:grid-cols-2" : "max-w-md"}`}>
        {showSyllabus && <Link
          to="/track"
          search={{ tab: "Syllabus" }}
          className={cn("rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06]", readOnly && "pointer-events-none")}
        >
          <p className="text-xs font-medium text-zinc-400">Syllabus</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">
            {pct(syllabus.done, syllabus.total)}%
          </p>
          <div className="mt-2 divide-y divide-white/5">
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
        </Link>}

        {showRevision && <Link
          to="/track"
          search={{ tab: "Revision" }}
          className={cn("rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06]", readOnly && "pointer-events-none")}
        >
          <p className="text-xs font-medium text-zinc-400">Revision</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">By subject</p>
          <div className="mt-2 divide-y divide-white/5">
            {tracker.subjects.map((subject) => {
              const progress = subjectRevision(tracker, subject);
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
        </Link>}

        {showMocks && <Link
          to="/track"
          search={{ tab: "Mock Test" }}
          className={cn("rounded-xl border border-white/10 bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.06]", readOnly && "pointer-events-none")}
        >
          <p className="text-xs font-medium text-zinc-400">Mock tests</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">Practice progress</p>
          <div className="mt-2 divide-y divide-white/5">
            {tracker.subjects.map((subject) => (
              <TrackerRow
                key={subject.id}
                label={subject.name}
                done={testsDone(tracker, subject.id)}
                total={tracker.tests.targets[subject.id] ?? 0}

              />
            ))}
            <TrackerRow
              label="Pre"
              done={tracker.tests.mocks.pre.done}
              total={tracker.tests.mocks.pre.target}

            />
            <TrackerRow
              label="Mains"
              done={tracker.tests.mocks.mains.done}
              total={tracker.tests.mocks.mains.target}

            />
          </div>
        </Link>}
      </div>
    </section>
  );
}

type ProfileProps = {
  /** Renders the same profile surface for a visitor, without personal controls. */
  readOnly?: boolean;
  publicProfile?: PublicProfile;
};

export function Profile({ readOnly = false, publicProfile }: ProfileProps) {
  const [colorTheme, setColorTheme] = useState<HeatmapColorCycle>({ seed: 0, previousShift: -1, shift: 0 });
  const themeChosen = useRef(false);
  useEffect(() => {
    if (themeChosen.current) return;
    themeChosen.current = true;
    setColorTheme(nextProfileColorTheme());
  }, []);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [tracker, setTracker] = useState<TrackerData | null>(null);
  const [range, setRange] = useState<ActivityRange>("week");
  const [profile, setProfile] = useState<PracticeProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [savingFeature, setSavingFeature] = useState<"practice" | "track" | "profileTracker" | "timers" | "habits" | "quotes" | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [previewingAvatar, setPreviewingAvatar] = useState(false);
  const [isAvatarChanging, setIsAvatarChanging] = useState(false);
  const [avatarFiles, setAvatarFiles] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [manifestationDraft, setManifestationDraft] = useState("");
  const [examNameDraft, setExamNameDraft] = useState("");
  const [practiceSessionEnabledDraft, setPracticeSessionEnabledDraft] = useState(true);
  const [trackProgressEnabledDraft, setTrackProgressEnabledDraft] = useState(true);
  const [showTrackerOnProfileDraft, setShowTrackerOnProfileDraft] = useState(true);
  const [timersEnabledDraft, setTimersEnabledDraft] = useState(true);
  const [habitsEnabledDraft, setHabitsEnabledDraft] = useState(true);
  const [randomQuotesEnabledDraft, setRandomQuotesEnabledDraft] = useState(true);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [savingAccent, setSavingAccent] = useState(false);
  const [accentError, setAccentError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [xpTimelineOpen, setXpTimelineOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const authUser = useAuthUser();
  const focusData = useProfileFocusData(getFirebaseFirestore, focusReader, readOnly ? publicProfile?.uid : authUser?.uid, readOnly ? publicProfile?.username : undefined, readOnly, date => isInRange(date, range));
  const resultUid = readOnly ? publicProfile?.uid : authUser?.uid;
  const medalCounts = useWeeklyMedalCounts(resultUid, dailyTasks.map((task) => task.date));

  useEffect(() => {
    if (readOnly) {
      const sharedProfile: PracticeProfile | null = publicProfile
        ? {
            name: publicProfile.name,
            username: publicProfile.username,
            questionGoal: publicProfile.questionGoal,
            ...(publicProfile.avatar ? { avatar: publicProfile.avatar } : {}),
            ...(publicProfile.examName ? { examName: publicProfile.examName } : {}),
            practiceSessionEnabled: publicProfile.practiceSessionEnabled !== false,
            trackProgressEnabled: publicProfile.trackProgressEnabled !== false,
            showTrackerOnProfile: publicProfile.showTrackerOnProfile !== false,
          }
        : null;
      setRecords(publicProfile?.dashboard?.records ?? []);
      setDailyTasks(publicProfile?.dashboard?.dailyTasks ?? []);
      setTracker(publicProfile?.dashboard?.tracker ?? null);
      setProfile(sharedProfile);
      setNameDraft(sharedProfile?.name ?? "");
      setUsernameDraft(sharedProfile?.username ?? "");
      setGoalDraft(sharedProfile ? String(sharedProfile.questionGoal) : "100");
      setManifestationDraft("");
      setExamNameDraft(sharedProfile?.examName ?? "");
      return;
    }
    let avatarsLoaded = false;
    let refreshPending = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) { refreshPending = true; return; }
      refreshing = true;
      const saved = loadPracticeProfile();
      setRecords(loadHistory());
      setDailyTasks(loadDailyTasks());
      const trackerData = loadTrackerData();
      setTracker(trackerData);
      setExamNameDraft(trackerData.meta.examName);
      setPracticeSessionEnabledDraft(saved?.practiceSessionEnabled !== false);
      setTrackProgressEnabledDraft(saved?.trackProgressEnabled !== false);
      setShowTrackerOnProfileDraft(saved?.showTrackerOnProfile !== false);
      setTimersEnabledDraft(saved?.timersEnabled !== false);
      setHabitsEnabledDraft(saved?.habitsEnabled !== false);
      setRandomQuotesEnabledDraft(saved?.randomQuotesEnabled !== false);
      setProfile(saved);
      setNameDraft(saved?.name ?? "");
      setUsernameDraft(saved?.username ?? ""); setUsernameTouched(false);
      setGoalDraft(saved ? String(saved.questionGoal) : "100");
      setManifestationDraft(saved?.manifestation ?? "");
      try {
        if (!avatarsLoaded) {
          const response = await fetch("/avatars/manifest.json", { cache: "no-store" });
          if (response.ok) {
            const files = (await response.json()) as unknown;
            if (Array.isArray(files)) {
              setAvatarFiles(files.filter((file): file is string => typeof file === "string"));
            }
          }
          avatarsLoaded = true;
        }
      } catch {
        setAvatarFiles([]);
      } finally {
        refreshing = false;
        if (refreshPending) {
          refreshPending = false;
          void refresh();
        }
      }
    };
    refresh();
    window.addEventListener("cbt-profile-updated", refresh);
    window.addEventListener("cbt-tracker-updated", refresh);
    window.addEventListener("ssc-daily-tasks-updated", refresh);
    return () => {
      window.removeEventListener("cbt-profile-updated", refresh);
      window.removeEventListener("cbt-tracker-updated", refresh);
      window.removeEventListener("ssc-daily-tasks-updated", refresh);
    };
  }, [publicProfile, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!authUser) return;
    const value = normalizeUsername(usernameDraft);
    if (!usernameTouched) { setUsernameStatus(value ? "available" : "idle"); setUsernameMessage(""); return; }
    const validationError = usernameValidationMessage(value);
    if (validationError) { setUsernameStatus(value ? "invalid" : "idle"); setUsernameMessage(value ? validationError : ""); return; }
    setUsernameStatus("checking"); setUsernameMessage("Checking availability…");
    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(authUser, value).then((result) => {
        setUsernameStatus(result.available ? "available" : "taken");
        setUsernameMessage(result.available ? "Username is available." : result.reason);
      }).catch((error) => { const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""; setUsernameStatus("idle"); setUsernameMessage(code === "permission-denied" ? "Username checks need the latest Firestore rules." : "Could not check availability. Try again."); });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [authUser, readOnly, usernameDraft, usernameTouched]);

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
  const dailyTaskTotals = useMemo(() => {
    const tasks = dailyTasks.filter((task) => isInRange(task.date, range));
    const completed = tasks.filter((task) => task.completed);
    return {
      studyMinutes: completed.reduce((total, task) => total + (task.minutesSpent ?? 0), 0),
      completed: completed.length,
      incomplete: tasks.length - completed.length,
    };
  }, [dailyTasks, range]);
  const xpSummary = useMemo(() => getXpSummary(dailyTasks, focusData.totalPoints), [dailyTasks, focusData.totalPoints]);
  const xpNextLabel = xpSummary.level === 0 ? "Reach 0 XP to begin" : `${Math.max(0, xpSummary.nextLevelXp - xpSummary.xp)} XP to Level ${xpSummary.level + 1}`;
  const xpTimelineStart = Math.max(0, xpSummary.level - 3);
  const xpTimelineLevels = Array.from({ length: 6 }, (_, index) => xpTimelineStart + index);
  const saveProfile = async () => {
    if (!nameDraft.trim() || Number(goalDraft) < 1 || isSavingProfile || (authUser && usernameStatus !== "available")) return;
    setIsSavingProfile(true);
    const next = {
      accentColor: normalizeAppAccent(profile?.accentColor),
      name: nameDraft.trim(),
      ...(usernameDraft.trim() ? { username: normalizeUsername(usernameDraft) } : {}),
      questionGoal: Math.min(100000, Number(goalDraft)),
      ...(profile?.avatar ? { avatar: profile.avatar } : {}),
      ...(manifestationDraft.trim() ? { manifestation: manifestationDraft.trim() } : {}),
      ...(examNameDraft.trim() ? { examName: examNameDraft.trim() } : {}),
      practiceSessionEnabled: practiceSessionEnabledDraft,
      trackProgressEnabled: trackProgressEnabledDraft,
      showTrackerOnProfile: showTrackerOnProfileDraft,
      timersEnabled: timersEnabledDraft,
      habitsEnabled: habitsEnabledDraft,
      randomQuotesEnabled: randomQuotesEnabledDraft,
    };
    try {
      if (authUser) await saveProfileWithUsername(authUser, next);
      savePracticeProfile(next);
      if (tracker) {
        const nextTracker = saveTrackerData({
          ...tracker,
          meta: {
            ...tracker.meta,
            examName: examNameDraft.trim() || tracker.meta.examName,
            prepStartDate: tracker.meta.prepStartDate || localDay(new Date()),
          },
        });
        setTracker(nextTracker);
      }
      // Keep the confirmation visible through the local-to-cloud handoff.
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      setProfile(next);
      setEditingProfile(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your username. Try again.";
      setUsernameStatus(message.toLowerCase().includes("taken") ? "taken" : "idle");
      setUsernameMessage(message);
    } finally {
      setIsSavingProfile(false);
    }
  };
  const chooseAccent = async (color: AppAccent) => {
    if (!profile || savingAccent || savingFeature || isSavingProfile) return;
    const previous = normalizeAppAccent(profile.accentColor);
    const next = { ...profile, accentColor: color };
    setSavingAccent(true); setAccentError(""); applyWebAccent(color);
    try {
      if (authUser && next.username) await saveProfileWithUsername(authUser, next);
      savePracticeProfile(next); setProfile(next);
    } catch { applyWebAccent(previous); setAccentError("Could not save accent. Please try again."); }
    finally { setSavingAccent(false); }
  };
  const saveFeature = async (feature: "practice" | "track" | "profileTracker" | "timers" | "habits" | "quotes") => {
    if (savingFeature || savingAccent || isSavingProfile) return;
    const nextPractice = feature === "practice" ? !practiceSessionEnabledDraft : practiceSessionEnabledDraft;
    const nextTrack = feature === "track" ? !trackProgressEnabledDraft : trackProgressEnabledDraft;
    const previousProfileTracker = showTrackerOnProfileDraft;
    const nextProfileTracker = feature === "profileTracker" ? !showTrackerOnProfileDraft : showTrackerOnProfileDraft;
    setShowTrackerOnProfileDraft(nextProfileTracker);
    const nextHabits = feature === "habits" ? !habitsEnabledDraft : habitsEnabledDraft;
    const previousHabits = habitsEnabledDraft;
    const nextQuotes = feature === "quotes" ? !randomQuotesEnabledDraft : randomQuotesEnabledDraft;
    const previousQuotes = randomQuotesEnabledDraft;
    const nextTimers = feature === "timers" ? !timersEnabledDraft : timersEnabledDraft;
    const previousTimers = timersEnabledDraft;
    const previousPractice = practiceSessionEnabledDraft;
    const previousTrack = trackProgressEnabledDraft;
    setPracticeSessionEnabledDraft(nextPractice);
    setTrackProgressEnabledDraft(nextTrack);
    setTimersEnabledDraft(nextTimers);
    setHabitsEnabledDraft(nextHabits);
    setRandomQuotesEnabledDraft(nextQuotes);
    setSavingFeature(feature);
    setAccentError("");
    const next = {
      ...profile,
      accentColor: normalizeAppAccent(profile?.accentColor),
      name: profile?.name || "Student",
      questionGoal: profile?.questionGoal || 100,
      practiceSessionEnabled: nextPractice,
      trackProgressEnabled: nextTrack,
      showTrackerOnProfile: nextProfileTracker,
      timersEnabled: nextTimers,
      habitsEnabled: nextHabits,
      randomQuotesEnabled: nextQuotes,
    };
    try {
      if (authUser && next.username) await saveProfileWithUsername(authUser, next);
      savePracticeProfile(next);
      setProfile(next);
    } catch (error) {
      setPracticeSessionEnabledDraft(previousPractice);
      setTrackProgressEnabledDraft(previousTrack);
      setShowTrackerOnProfileDraft(previousProfileTracker);
      setTimersEnabledDraft(previousTimers);
      setHabitsEnabledDraft(previousHabits);
      setRandomQuotesEnabledDraft(previousQuotes);
      const message = error instanceof Error ? error.message : "Could not update this setting.";
      setAccentError(message);
    } finally {
      setSavingFeature(null);
    }
  };
  const displayName = profile?.name ?? "Your profile";
  const questionGoal = profile?.questionGoal ?? 100;
  const avatar = profile?.avatar && (!avatarFiles.length || avatarFiles.includes(profile.avatar)) ? profile.avatar : defaultAvatar(displayName, avatarFiles);
  const consistencyStreak = useMemo(
    () => getStreaks([
      ...records.map((record) => ({ date: record.date })),
      ...(tracker?.tests.log ?? []).map((test) => ({ date: test.date })),
      ...(tracker?.activity ?? []).map((entry) => ({ date: entry.date })),
      ...dailyTasks.filter((task) => task.completed).map((task) => ({ date: task.completedAt ?? task.date })),
    ]).current,
    [dailyTasks, records, tracker],
  );
  const updateAvatar = () => {
    const options = avatarFiles.filter((file) => file !== avatar);
    const nextAvatar = options[Math.floor(Math.random() * options.length)] ?? avatar;
    if (!nextAvatar) return;
    const next = {
      name: displayName,
      ...(profile?.username ? { username: profile.username } : {}),
      questionGoal,
      avatar: nextAvatar,
      ...(profile?.manifestation ? { manifestation: profile.manifestation } : {}),
      ...(profile?.examName ? { examName: profile.examName } : {}),
      practiceSessionEnabled: profile?.practiceSessionEnabled !== false,
      trackProgressEnabled: profile?.trackProgressEnabled !== false,
      showTrackerOnProfile: profile?.showTrackerOnProfile !== false,
      timersEnabled: profile?.timersEnabled !== false,
      habitsEnabled: profile?.habitsEnabled !== false,
      randomQuotesEnabled: profile?.randomQuotesEnabled !== false,
    };
    savePracticeProfile(next);
    if (authUser && next.username) void saveProfileWithUsername(authUser, next).catch(() => undefined);
    setProfile(next);
    setIsAvatarChanging(true);
    window.setTimeout(() => setIsAvatarChanging(false), 550);
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
      setImportMessage("Data imported successfully.");
    } catch {
      setImportMessage("Choose a valid full backup or Tracker JSON file.");
    }
  };
  const logout = async () => {
    setIsLoggingOut(true);
    try {
      localStorage.removeItem("ssc-buddy-firebase-sync-enabled");
      await signOutFirebase();
      await navigate({ to: "/auth", replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <AppShell title={readOnly ? displayName : "Your Profile"}>
      <div className="profile-dark -mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#121212] px-4 pt-5 pb-10 text-zinc-100 sm:-mx-6 sm:px-6 sm:pt-6 sm:pb-14">
        <div className="mx-auto max-w-4xl space-y-7">
          <section className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <div className="relative flex w-28 min-w-0 flex-col items-center">
              {avatar ? (
                <button
                  type="button"
                  onClick={() => setPreviewingAvatar(true)}
                  className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  aria-label="Preview profile image"
                >
                  <img
                    src={avatarUrl(avatar)}
                    alt="Profile avatar"
                    className="relative z-10 h-full w-full rounded-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                </button>
              ) : (
                <div className="h-24 w-24 rounded-full bg-white/10" />
              )}
              {!readOnly && <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-0 bottom-0 z-20 h-8 w-8 rounded-full bg-[#121212] text-zinc-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-zinc-100"
                onClick={updateAvatar}
                disabled={avatarFiles.length < 2}
                aria-label="Change profile image"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isAvatarChanging && "animate-spin")} />
              </Button>}
            </div>
            <div className="min-w-0 flex-1">
              {tracker?.meta.examName && (
                <p className="font-mono text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
                  {tracker.meta.examName}
                </p>
              )}

              <div className="mt-0.5 flex items-center justify-center gap-2 sm:justify-start">
                <h2 className="truncate text-xl font-semibold text-zinc-50">{displayName}</h2>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1" aria-label="Weekly medals">
                {(["gold", "silver", "bronze"] as const).map((medal) => (
                  <span key={medal} title={`${medal}: ${medalCounts[medal]} weekly medals`} aria-label={`${medal} medals: ${medalCounts[medal]}`} className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums text-zinc-200">
                    <img src={`/${medal}-medal.png`} alt="" className="h-4 w-4 object-contain" />
                    <RollingNumber value={medalCounts[medal]} prefix="×" />
                  </span>
                ))}
              </div>
                {readOnly && (
                  <span
                    title={`${consistencyStreak}-day consistency streak`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-200"
                  >
                    <StreakLiquidFlame active={consistencyStreak > 0} className="h-3.5 w-3.5" />
                    {consistencyStreak}
                  </span>
                )}
                {!readOnly && <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-0 right-0 h-7 w-7 shrink-0 bg-transparent text-zinc-500 hover:bg-transparent hover:text-zinc-100"
                  onClick={() => { setUsernameTouched(false); setUsernameStatus(usernameDraft ? "available" : "idle"); setUsernameMessage(""); setEditingProfile(true); }}
                  aria-label="Profile settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>}
              </div>
              <button type="button" onClick={() => setXpTimelineOpen(true)} className="mt-1 w-full max-w-52 text-center outline-none sm:text-left">
                <span className={`text-xs font-semibold ${xpSummary.xp > 0 ? "text-emerald-300" : xpSummary.xp < 0 ? "text-red-300" : "text-zinc-400"}`}>Lv. <RollingNumber value={xpSummary.level} /> · {levelName(xpSummary.level)} · <RollingNumber value={xpSummary.xp} prefix={xpSummary.xp > 0 ? "+" : ""} suffix=" XP" /></span>
                {xpSummary.level > 0 && <ProfileXpBar progress={xpSummary.progress} />}
              </button>
              {readOnly && publicProfile?.username && <div className="mt-0 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <Button type="button" variant="ghost" className="h-9 gap-1.5 px-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => void navigate({ to: "/weekly-stats/$username", params: { username: publicProfile.username } })}>
                  <Trophy className="h-4 w-4" /> Weekly stats
                </Button>
              </div>}
              {!readOnly && <div className="mt-0 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <Button type="button" variant="ghost" className="h-9 gap-1.5 pr-2.5 pl-0 text-sm text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => void navigate({ to: "/leaderboard" })}>
                  <Trophy className="h-4 w-4" /> Leaderboard
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
              </div>}
            </div>
          </section>

          {!readOnly && authUser && <ProfileStudyLock key={authUser.uid} uid={authUser.uid} />}
          {readOnly && publicProfile && <PublicFocusTime uid={publicProfile.uid} username={publicProfile.username} />}

          <div className="space-y-3">
            <TargetProgress
              attempted={totals.attempted}
              goal={questionGoal}
              tests={totals.tests}
              correct={totals.correct}
              wrong={totals.wrong}
              lectures={trackerTotals.lectures}
              revisions={trackerTotals.revisions}
              mockTests={trackerTotals.mockTests}
              studyMinutes={dailyTaskTotals.studyMinutes}
              completedTasks={dailyTaskTotals.completed}
              incompleteTasks={dailyTaskTotals.incomplete}
              focusTime={focusData.text}
              range={range}
              onRangeChange={setRange}
              showPractice={profile?.practiceSessionEnabled !== false}
              showTracker={profile?.trackProgressEnabled !== false && profile?.showTrackerOnProfile !== false}
            />

            <ActivityHeatmap colorTheme={colorTheme} records={records} tracker={tracker} tasks={dailyTasks} range="year" activityEnabled={profile?.practiceSessionEnabled !== false || profile?.trackProgressEnabled !== false} publicActivity={readOnly && !publicProfile?.dashboard ? publicProfile?.activity : undefined} dataReady={readOnly || profile !== null} />
          </div>

          {profile?.trackProgressEnabled !== false && profile?.showTrackerOnProfile !== false && <StudyTrackerOverview tracker={tracker} readOnly={readOnly} />}
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
      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent onOpenAutoFocus={(event) => event.preventDefault()} className="border-white/10 bg-[#121212] p-5 text-zinc-100 sm:max-w-sm">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Sign out?</DialogTitle>
            <DialogDescription className="text-sm text-zinc-400">
              Your synced SSC Buddy data will remain safely in your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLogoutConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setLogoutConfirmOpen(false);
                void logout();
              }}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingProfile(false); }}>
          <section className="profile-settings-scroll relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#121212] p-4 text-zinc-100 shadow-2xl sm:p-5" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight text-zinc-50">{profile ? "Edit your profile" : "Setup your profile"}</h2><div className="flex items-center gap-1"><button type="button" aria-label="Profile settings" onClick={() => setProfileSettingsOpen((open) => !open)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"><Settings className="h-4 w-4" /></button><button type="button" aria-label="Log out" disabled={isLoggingOut} onClick={() => { setEditingProfile(false); setLogoutConfirmOpen(true); }} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"><LogOut className="h-4 w-4" /></button></div></div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-zinc-200">
                Your name
                <Input
                  className="mt-1.5 h-10 border-white/10 bg-[#121212] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value.toUpperCase())}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Username
                <div className="relative mt-2">
                  <Input
                    className="h-10 border-white/10 bg-[#121212] pr-10 text-zinc-100 lowercase placeholder:text-zinc-500 focus-visible:border-zinc-500"
                    value={usernameDraft}
                    onChange={(event) => { setUsernameTouched(true); setUsernameDraft(event.target.value.toLowerCase()); }}
                    placeholder="e.g. ssc_aspirant"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  {usernameStatus === "checking" && <span className="absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500">…</span>}
                  {usernameStatus === "available" && <span className="absolute inset-y-0 right-3 flex items-center text-emerald-400">✓</span>}
                  {usernameStatus === "taken" && <span className="absolute inset-y-0 right-3 flex items-center text-red-400">×</span>}
                </div>
                {usernameMessage && <span className={cn("mt-1 block text-xs font-normal", usernameStatus === "available" ? "text-emerald-400" : "text-red-300")}>{usernameMessage}</span>}
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Question goal
                <Input
                  className="mt-1.5 h-10 border-white/10 bg-[#121212] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  inputMode="numeric"
                  value={goalDraft}
                  onChange={(event) => setGoalDraft(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Daily manifestation <span className="font-normal text-zinc-500">(optional)</span>
                <Input
                  className="mt-1.5 h-10 border-white/10 bg-[#121212] text-zinc-100 uppercase placeholder:text-zinc-500 focus-visible:border-primary"
                  value={manifestationDraft}
                  onChange={(event) => setManifestationDraft(event.target.value.toUpperCase())}
                  placeholder="Write the sentence you want to type daily"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-200">
                Exam name
                <Input
                  className="mt-1.5 h-10 border-white/10 bg-[#121212] text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  value={examNameDraft}
                  onChange={(event) => setExamNameDraft(event.target.value.toUpperCase())}
                  placeholder="e.g. SSC CGL 2027"
                />
              </label>
              {false && <button type="button" onClick={() => setPracticeSessionEnabledDraft((value) => !value)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#121212] px-3 py-3 text-left transition hover:bg-white/[.04]">
                <span><span className="block text-sm font-medium text-zinc-200">Practice session</span><span className="mt-0.5 block text-xs font-normal text-zinc-500">Show the practice tab and practice statistics.</span></span>
                <span className={cn("relative h-5 w-9 rounded-full border transition-colors", practiceSessionEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", practiceSessionEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>
              </button>}
            </div>
            {profileSettingsOpen && <div className="profile-settings-scroll absolute inset-0 z-10 overflow-y-auto rounded-2xl bg-[#121212] p-6 sm:p-8"><div className="flex items-center gap-2"><button type="button" aria-label="Back to profile form" onClick={() => setProfileSettingsOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"><ArrowLeft className="h-4 w-4" /></button><h3 className="text-lg font-semibold">Settings</h3></div><div className="mt-6 space-y-4"><AccentPicker value={profile?.accentColor} onChange={(color) => void chooseAccent(color)} disabled={!profile || savingAccent || savingFeature !== null} saving={savingAccent} />{accentError && <p role="alert" className="text-xs text-red-300">{accentError}</p>}<div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-[#121212]"><button type="button" disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("practice")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Practice session</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Take practice tests, review answers and track your results.</span></span>{savingFeature === "practice" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", practiceSessionEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", practiceSessionEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button><button type="button" disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("track")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Track</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Track syllabus, revision and mock test progress.</span></span>{savingFeature === "track" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", trackProgressEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", trackProgressEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button><button type="button" role="switch" aria-checked={showTrackerOnProfileDraft} disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("profileTracker")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Show tracker on profile</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Display Study Tracker statistics and progress on your profile.</span></span>{savingFeature === "profileTracker" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", showTrackerOnProfileDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", showTrackerOnProfileDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button><button type="button" role="switch" aria-checked={timersEnabledDraft} disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("timers")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Timers</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Countdowns for important dates and deadlines.</span></span>{savingFeature === "timers" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", timersEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", timersEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button><button type="button" role="switch" aria-checked={habitsEnabledDraft} disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("habits")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Habits</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Daily heatmaps, streaks and personal challenges.</span></span>{savingFeature === "habits" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", habitsEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", habitsEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button><button type="button" role="switch" aria-checked={randomQuotesEnabledDraft} disabled={savingFeature !== null || savingAccent} onClick={() => void saveFeature("quotes")} className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-3 py-3 text-left disabled:cursor-wait disabled:opacity-70"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Random quotes</span><span className="mt-0.5 block text-xs leading-4 text-zinc-500">Show a random motivational image when opening the app.</span></span>{savingFeature === "quotes" ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <span className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors", randomQuotesEnabledDraft ? "border-primary bg-primary" : "border-zinc-500 bg-transparent")}><span className={cn("absolute top-1 h-3 w-3 rounded-full transition-transform", randomQuotesEnabledDraft ? "translate-x-5 bg-primary-foreground" : "translate-x-1 bg-zinc-400")} /></span>}</button></div></div></div>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
                onClick={() => setEditingProfile(false)}
              >
                Cancel
              </Button>
              <Button disabled={isSavingProfile || (Boolean(authUser) && usernameStatus !== "available")} className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveProfile}>
                {isSavingProfile ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
              </Button>
            </div>
          </section>
        </div>
      )}
      {importingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121212] p-6 text-zinc-100 shadow-2xl sm:p-7">
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
      {isLoggingOut && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#121212] text-zinc-300">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121212] px-4 py-3 shadow-2xl">
            <LoaderCircle className="h-4 w-4 animate-spin text-emerald-400" />
            <span className="text-sm font-medium">Signing out</span>
          </div>
        </div>
      )}
      <Dialog open={xpTimelineOpen} onOpenChange={setXpTimelineOpen}>
        <DialogContent className="border-white/10 bg-[#121212] p-5 text-zinc-100 sm:max-w-sm">
          <DialogHeader><DialogTitle>Level {xpSummary.level} · {levelName(xpSummary.level)}</DialogTitle><DialogDescription className="text-zinc-400">Your all-time XP path</DialogDescription></DialogHeader>
          <div className="relative space-y-2 pt-2">{xpTimelineLevels.map((level) => { const current = level === xpSummary.level; const reached = level <= xpSummary.level; const detail = current ? `${xpSummary.xp > 0 ? "+" : ""}${xpSummary.xp} XP · ${Math.max(0, xpSummary.nextLevelXp - xpSummary.xp)} XP to Level ${xpSummary.level + 1}` : level === 0 ? "Below 0 XP" : `${xpForLevel(level)} XP`; return <div key={level} className="relative flex items-start gap-3">{level < xpTimelineStart + 5 && <div className="absolute left-[2px] top-[13px] w-1.5" style={{ height: "calc(100% + 8px)" }}><LiquidProgressBar vertical height={6} progress={xpSegmentProgress(xpSummary.xp, level)} color="#a78bfa" label={`Level ${level} to ${level + 1} progress`} /></div>}<span className={`z-10 mt-2 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#1b1b1b] ${current ? "bg-violet-300 ring-4 ring-violet-400/15" : reached ? "bg-violet-400" : "bg-zinc-700"}`} /><div className={`min-w-0 flex-1 rounded-lg px-3 py-2 ${current ? "border border-violet-300/20 bg-violet-400/[0.09]" : "bg-white/[0.025]"}`}><p className={`text-sm font-semibold ${current ? "text-white" : "text-zinc-300"}`}>Lv. {level} · {levelName(level)}</p><p className="text-xs text-zinc-500">{detail}</p></div></div>; })}</div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
