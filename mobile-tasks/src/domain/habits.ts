import { HABIT_ICON_CATALOG } from "./habit-icons";
import { HABIT_COLORS } from "./habit-colors";
export { HABIT_COLORS } from "./habit-colors";
export type HabitColor = keyof typeof HABIT_COLORS;
export type Habit = {
  id: string;
  name: string;
  color: HabitColor;
  createdAt: string;
  targetDays: number | null;
  completedDates: string[];
  settings?: HabitSettings;
  entries?: Record<string, HabitEntry>;
};
export function habitDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function isHabitDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00");
  return Number.isFinite(date.getTime()) && habitDay(date) === value;
}
export function normalizeHabit(id: string, value: Record<string, unknown>): Habit | null {
  if (
    typeof value["name"] !== "string" ||
    !value["name"].trim() ||
    typeof value["createdAt"] !== "string" ||
    !Number.isFinite(Date.parse(value["createdAt"]))
  )
    return null;
  return {
    settings: normalizeHabitSettings(value["settings"]),
    entries: normalizeHabitEntries(value["entries"]),
    id,
    name: value["name"].trim().slice(0, 80),
    color: Object.hasOwn(HABIT_COLORS, String(value["color"]))
      ? (value["color"] as HabitColor)
      : "purple",
    createdAt: value["createdAt"],
    targetDays:
      typeof value["targetDays"] === "number" &&
      Number.isInteger(value["targetDays"]) &&
      value["targetDays"] > 0
        ? value["targetDays"]
        : null,
    completedDates: [
      ...new Set(
        Array.isArray(value["completedDates"]) ? value["completedDates"].filter(isHabitDay) : [],
      ),
    ].sort(),
  };
}
export function habitDetails(name: string, color: HabitColor, target: string) {
  if (!name.trim()) throw new Error("Enter a habit name.");
  const targetDays = target.trim() ? Number(target) : null;
  if (
    targetDays !== null &&
    (!Number.isInteger(targetDays) || targetDays < 1 || targetDays > 10000)
  )
    throw new Error("Target must be between 1 and 10,000 days.");
  return { name: name.trim().slice(0, 80), color, targetDays };
}
export function habitStats(habit: Habit, today = habitDay()) {
  const days = new Set(
    habit.completedDates.filter(
      (day) => day >= habitDay(new Date(habit.createdAt)) && day <= today,
    ),
  );
  const settings = normalizeHabitSettings(habit.settings);
  if (settings.type === "quit") {
    const cursor = new Date(habit.createdAt);
    cursor.setHours(12, 0, 0, 0);
    days.clear();
    while (habitDay(cursor) <= today) {
      const key = habitDay(cursor);
      if (habitIsComplete(habit, key)) days.add(key);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  let streak = 0;
  const date = new Date(today + "T12:00:00");
  if (settings.frequency === "period") {
    let anchor = periodStart(today, settings.period);
    if (periodCount(habit, today) < settings.perPeriod)
      anchor = previousPeriod(anchor, settings.period);
    while (anchor >= periodStart(habitDay(new Date(habit.createdAt)), settings.period)) {
      const end = periodEnd(anchor, settings.period);
      if (periodCount(habit, end < today ? end : today) < settings.perPeriod) break;
      streak++;
      anchor = previousPeriod(anchor, settings.period);
    }
  } else {
    if (!days.has(today) && settings.type !== "quit") date.setDate(date.getDate() - 1);
    const first = habitDay(new Date(habit.createdAt));
    while (habitDay(date) >= first) {
      const key = habitDay(date);
      if (habitScheduled(habit, key)) {
        if (!days.has(key)) break;
        streak++;
      }
      date.setDate(date.getDate() - 1);
    }
  }
  return {
    streak,
    total: days.size,
    markedToday: days.has(today),
    progress: habit.targetDays ? Math.min(1, days.size / habit.targetDays) : 0,
  };
}
/** A continuous calendar: Sunday is row 0, each following Sunday starts a column. */
export function habitCalendar(today = habitDay(), months = 6) {
  const end = new Date(today + "T12:00:00"),
    start = new Date(end);
  start.setMonth(start.getMonth() - months);
  start.setDate(start.getDate() - start.getDay());
  const cells: { key: string; column: number; row: number; future: boolean; month: string }[] = [];
  const date = new Date(start);
  let index = 0;
  do {
    const key = habitDay(date);
    cells.push({
      key,
      column: Math.floor(index / 7),
      row: date.getDay(),
      future: key > today,
      month:
        date.getDate() === 1 || index === 0
          ? date.toLocaleDateString(undefined, { month: "short" })
          : "",
    });
    index++;
    date.setDate(date.getDate() + 1);
  } while (index % 7 !== 0 || habitDay(date) <= today);
  return cells;
}

export const HABIT_ICONS: readonly string[] = HABIT_ICON_CATALOG.map((icon) => icon.name);
export type HabitTracking = "tick" | "count" | "checklist";
export type HabitEntry = { count: number; checks: string[]; note: string };
export type HabitSettings = {
  description: string;
  icon: string;
  type: "build" | "quit";
  frequency: "daily" | "weekdays" | "monthdays" | "period";
  weekdays: number[];
  monthdays: number[];
  period: "week" | "month";
  perPeriod: number;
  tracking: HabitTracking;
  dailyGoal: number;
  unit: string;
  step: number;
  checklist: { id: string; title: string; reminder?: string | null }[];
  reminder: string | null;
  category: string;
  showStreak: boolean;
};
const integerList = (value: unknown, min: number, max: number) => [
  ...new Set(
    Array.isArray(value)
      ? value.filter(
          (item): item is number =>
            typeof item === "number" && Number.isInteger(item) && item >= min && item <= max,
        )
      : [],
  ),
];
export function normalizeHabitSettings(value?: unknown): HabitSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const positive = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback;
  return {
    description: typeof v["description"] === "string" ? v["description"].slice(0, 300) : "",
    icon: (HABIT_ICONS as readonly string[]).includes(v["icon"]) ? v["icon"] : "medal",
    type: v["type"] === "quit" ? "quit" : "build",
    frequency:
      v["type"] === "quit"
        ? "daily"
        : ["daily", "weekdays", "monthdays", "period"].includes(v["frequency"])
          ? v["frequency"]
          : "daily",
    weekdays: integerList(v["weekdays"] ?? [1, 2, 3, 4, 5], 0, 6),
    monthdays: integerList(v["monthdays"] ?? [1], 1, 31),
    period: v["period"] === "month" ? "month" : "week",
    perPeriod: Math.max(
      1,
      Math.min(v["period"] === "month" ? 31 : 7, Math.round(positive(v["perPeriod"], 3))),
    ),
    tracking: ["count", "checklist"].includes(v["tracking"]) ? v["tracking"] : "tick",
    dailyGoal:
      v["type"] === "quit" &&
      typeof v["dailyGoal"] === "number" &&
      Number.isFinite(v["dailyGoal"]) &&
      v["dailyGoal"] >= 0
        ? v["dailyGoal"]
        : positive(v["dailyGoal"], v["type"] === "quit" ? 0 : 1),
    unit: typeof v["unit"] === "string" ? v["unit"].slice(0, 30) : "",
    step: positive(v["step"], 1),
    checklist: Array.isArray(v["checklist"])
      ? v["checklist"]
          .filter(
            (item: any) =>
              typeof item?.id === "string" && typeof item?.title === "string" && item.title.trim(),
          )
          .slice(0, 30)
          .map((item: any) => ({
            id: item.id,
            title: item.title.trim().slice(0, 80),
            reminder:
              typeof item.reminder === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.reminder)
                ? item.reminder
                : null,
          }))
      : [],
    reminder:
      typeof v["reminder"] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v["reminder"])
        ? v["reminder"]
        : null,
    category: typeof v["category"] === "string" ? v["category"].slice(0, 40) : "",
    showStreak: true,
  };
}
function normalizeHabitEntries(value: unknown): Record<string, HabitEntry> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => isHabitDay(key))
      .map(([key, entry]) => {
        const e = entry as Partial<HabitEntry> | null;
        return [
          key,
          {
            count:
              typeof e?.count === "number" && Number.isFinite(e.count) ? Math.max(0, e.count) : 0,
            checks: Array.isArray(e?.checks)
              ? [...new Set(e.checks.filter((item): item is string => typeof item === "string"))]
              : [],
            note: typeof e?.note === "string" ? e.note.slice(0, 1000) : "",
          },
        ];
      }),
  );
}
export function validateHabitSettings(settings: HabitSettings) {
  if (settings.reminder !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminder))
    throw new Error("Enter reminder time as HH:MM (24-hour).");
  if (settings.frequency === "weekdays" && !settings.weekdays.length)
    throw new Error("Choose at least one weekday.");
  if (settings.frequency === "monthdays" && !settings.monthdays.length)
    throw new Error("Choose at least one day of the month.");
  if (settings.checklist.length > 30) throw new Error("Use up to 30 checklist items per habit.");
  if (settings.tracking === "checklist" && !settings.checklist.length)
    throw new Error("Add at least one checklist item.");
  if (
    !Number.isFinite(settings.dailyGoal) ||
    settings.dailyGoal < (settings.type === "quit" ? 0 : Number.MIN_VALUE) ||
    !Number.isFinite(settings.step) ||
    settings.step <= 0
  )
    throw new Error("Use a positive tap amount and goal (quit limits may be zero).");
  return settings;
}
export function habitScheduled(habit: Habit, day: string) {
  if (day < habitDay(new Date(habit.createdAt))) return false;
  const s = normalizeHabitSettings(habit.settings),
    date = new Date(day + "T12:00:00");
  return s.frequency === "weekdays"
    ? s.weekdays.includes(date.getDay())
    : s.frequency === "monthdays"
      ? s.monthdays.includes(date.getDate())
      : true;
}
export function habitDue(habit: Habit, day: string) {
  if (!habitScheduled(habit, day) || habitIsComplete(habit, day)) return false;
  const s = normalizeHabitSettings(habit.settings);
  return s.frequency !== "period" || periodCount(habit, day) < s.perPeriod;
}
export function periodStart(day: string, period: "week" | "month") {
  const d = new Date(day + "T12:00:00");
  if (period === "month") d.setDate(1);
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return habitDay(d);
}
function previousPeriod(day: string, period: "week" | "month") {
  const d = new Date(day + "T12:00:00");
  if (period === "month") d.setMonth(d.getMonth() - 1);
  else d.setDate(d.getDate() - 7);
  return habitDay(d);
}
function periodEnd(day: string, period: "week" | "month") {
  const d = new Date(day + "T12:00:00");
  if (period === "month") {
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
  } else d.setDate(d.getDate() + 6);
  return habitDay(d);
}
export function periodCount(habit: Habit, day: string) {
  const s = normalizeHabitSettings(habit.settings),
    from = periodStart(day, s.period);
  return new Set(habit.completedDates.filter((key) => key >= from && key <= day)).size;
}
export function habitEntry(habit: Habit, day: string): HabitEntry {
  return (
    habit.entries?.[day] ?? {
      count:
        normalizeHabitSettings(habit.settings).type === "quit"
          ? 0
          : habit.completedDates.includes(day)
            ? 1
            : 0,
      checks: [],
      note: "",
    }
  );
}
export type HabitDayAction =
  | { type: "toggle" }
  | { type: "increment"; amount: number }
  | { type: "count"; value: number }
  | { type: "check"; id: string }
  | { type: "note"; note: string };
export function applyHabitAction(
  habit: Habit,
  day: string,
  action: HabitDayAction,
  today = habitDay(),
) {
  if (!canEditHabitDay(day, today) || !habitScheduled(habit, day))
    throw new Error("Only today and yesterday can be changed.");
  const s = normalizeHabitSettings(habit.settings),
    old = habitEntry(habit, day),
    entry = { ...old, checks: [...old.checks] };
  if (action.type === "note") entry.note = action.note.slice(0, 1000);
  if (action.type === "toggle")
    entry.count =
      s.type === "quit" ? (old.count > 0 ? 0 : 1) : habit.completedDates.includes(day) ? 0 : 1;
  if (action.type === "count") {
    if (!Number.isFinite(action.value) || action.value < 0)
      throw new Error("Enter a valid non-negative count.");
    entry.count = action.value;
  }
  if (action.type === "increment") {
    if (!Number.isFinite(action.amount)) throw new Error("Invalid amount.");
    entry.count = Math.max(0, Math.round((entry.count + action.amount) * 10000) / 10000);
  }
  if (action.type === "check") {
    if (!s.checklist.some((item) => item.id === action.id))
      throw new Error("Checklist item no longer exists.");
    entry.checks = entry.checks.includes(action.id)
      ? entry.checks.filter((id) => id !== action.id)
      : [...entry.checks, action.id];
  }
  const completed =
    s.type === "quit"
      ? s.tracking === "count"
        ? entry.count <= s.dailyGoal
        : s.tracking === "checklist"
          ? entry.checks.length === 0
          : entry.count === 0
      : action.type === "note"
        ? habit.completedDates.includes(day)
        : s.tracking === "count"
          ? entry.count >= s.dailyGoal
          : s.tracking === "checklist"
            ? s.checklist.length > 0 && s.checklist.every((item) => entry.checks.includes(item.id))
            : entry.count > 0;
  return { entry, completed };
}
/** Compare the transaction's latest document, not a potentially stale UI count. */
export function habitDayNeedsUpdate(habit: Habit, day: string, result: ReturnType<typeof applyHabitAction>) {
  const previous = habitEntry(habit, day);
  return previous.count !== result.entry.count || previous.note !== result.entry.note ||
    previous.checks.length !== result.entry.checks.length ||
    previous.checks.some((id, index) => id !== result.entry.checks[index]) ||
    habit.completedDates.includes(day) !== result.completed;
}
export function habitIntensity(habit: Habit, day: string) {
  if (habitIsComplete(habit, day)) return 1;
  if (normalizeHabitSettings(habit.settings).type === "quit") return 0;
  const s = normalizeHabitSettings(habit.settings),
    entry = habitEntry(habit, day);
  return s.tracking === "count"
    ? Math.min(1, entry.count / s.dailyGoal)
    : s.tracking === "checklist" && s.checklist.length
      ? entry.checks.filter((id) => s.checklist.some((item) => item.id === id)).length /
        s.checklist.length
      : 0;
}
export function habitWeek(day: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(day + "T12:00:00");
    d.setDate(d.getDate() - 6 + index);
    return habitDay(d);
  });
}

export type HabitSaveDetails = ReturnType<typeof habitDetails> & { settings: HabitSettings };
export const HABIT_CATEGORIES = [
  "Health",
  "Fitness",
  "Study",
  "Mindfulness",
  "Personal",
  "Work",
] as const;
export const HABIT_FREQUENCIES = {
  daily: "Everyday",
  weekdays: "Specific Days of Week",
  monthdays: "Specific Days of Month",
  period: "Some Days Per Period",
} as const;
export const HABIT_SYMBOLS = [
  "🏃",
  "📖",
  "♫",
  "🐷",
  "🍸",
  "🏊",
  "☀",
  "🏋",
  "💧",
  "🎨",
  "🦷",
  "🚶",
  "🚿",
  "☾",
  "‹›",
  "🐾",
  "⏰",
  "✚",
  "🙌",
  "🧘",
  "🍴",
  "🎓",
  "🚭",
  "🌱",
  "🚴",
  "⚽",
  "🏅",
];

export function habitIsComplete(habit: Habit, day: string) {
  if (!isHabitDay(day) || day > habitDay() || !habitScheduled(habit, day)) return false;
  const settings = normalizeHabitSettings(habit.settings);
  if (settings.type !== "quit") return habit.completedDates.includes(day);
  const entry = habitEntry(habit, day);
  return settings.tracking === "count"
    ? entry.count <= settings.dailyGoal
    : settings.tracking === "checklist"
      ? entry.checks.length === 0
      : entry.count === 0;
}

export const HABIT_COLOR_COLUMNS: readonly (readonly [HabitColor, HabitColor])[] = [
  ["yellow", "gold"],
  ["amber", "mustard"],
  ["cream", "ochre"],
  ["orange", "burntOrange"],
  ["tangerine", "deepOrange"],
  ["coral", "vermillion"],
  ["red", "scarlet"],
  ["crimson", "maroon"],
  ["rose", "hotPink"],
  ["pink", "mauve"],
  ["purple", "violet"],
  ["green", "forest"],
  ["lime", "olive"],
  ["blue", "navy"],
];
export const HABIT_DEFAULT_COLORS: readonly HabitColor[] = [
  "yellow",
  "pink",
  "purple",
  "green",
  "red",
];

export function canEditHabitDay(day: string, today = habitDay()) {
  const yesterday = new Date(today + "T12:00:00");
  yesterday.setDate(yesterday.getDate() - 1);
  return isHabitDay(day) && day >= habitDay(yesterday) && day <= today;
}

/** Keep Save availability and submitted field validation in sync. */
export function habitFormDetails(
  name: string,
  color: HabitColor,
  target: string,
  settings: HabitSettings,
  goal: string,
  amount: string,
): HabitSaveDetails {
  if (settings.tracking === "count" && (!goal.trim() || !amount.trim()))
    throw new Error("Enter a daily goal and tap amount.");
  return {
    ...habitDetails(name, color, target),
    settings: validateHabitSettings({
      ...settings,
      showStreak: true,
      dailyGoal: settings.tracking === "count" ? Number(goal) : 1,
      step: settings.tracking === "count" ? Number(amount) : 1,
    }),
  };
}
export function canSaveHabit(...fields: Parameters<typeof habitFormDetails>) {
  try {
    habitFormDetails(...fields);
    return true;
  } catch {
    return false;
  }
}
