export type DateTimer = { id: string; title: string; targetAt: string; createdAt: string };

export function parseTimerTarget(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid date (YYYY-MM-DD).");
  const target = new Date(`${date}T00:00:00`);
  const [year, month, day] = date.split("-").map(Number);
  if (!Number.isFinite(target.getTime()) || target.getFullYear() !== year || target.getMonth() + 1 !== month || target.getDate() !== day) throw new Error("Choose a valid calendar date.");
  return target.toISOString();
}

export function timerInputFields(targetAt: string) {
  const date = new Date(targetAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` };
}

export function makeDateTimer(id: string, title: string, date: string, previous?: DateTimer): DateTimer {
  if (!title.trim()) throw new Error("Enter a timer name.");
  if (title.trim().length > 80) throw new Error("Keep the timer name within 80 characters.");
  return { id, title: title.trim(), targetAt: parseTimerTarget(date), createdAt: previous?.createdAt ?? new Date().toISOString() };
}

export function normalizeDateTimer(id: string, value: unknown): DateTimer | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data["title"] !== "string" || !data["title"].trim() || typeof data["targetAt"] !== "string" || !Number.isFinite(Date.parse(data["targetAt"]))) return null;
  return { id, title: data["title"].trim(), targetAt: data["targetAt"], createdAt: typeof data["createdAt"] === "string" ? data["createdAt"] : data["targetAt"] };
}

export function dateCountdown(targetAt: string, now = Date.now()) {
  // Compare calendar days, including across daylight-saving changes and legacy timed entries.
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const remaining = (calendarDay(new Date(targetAt)) - calendarDay(new Date(now))) / 86400000;
  const days = Number.isFinite(remaining) ? -Math.round(remaining) || 0 : 0;
  return { days, reached: days >= 0 };
}

export function timerReferenceDays(timers: DateTimer[], now = Date.now()): number | undefined {
  if (timers.length <= 1) return undefined;
  return Math.max(0, ...timers.map(timer => -dateCountdown(timer.targetAt, now).days));
}

export function timerDial(timer: DateTimer, now = Date.now(), referenceDays?: number) {
  const { days } = dateCountdown(timer.targetAt, now);
  const originalDays = Math.abs(dateCountdown(timer.targetAt, Date.parse(timer.createdAt)).days);
  return {
    label: `${days > 0 ? "+" : days < 0 ? "−" : ""}${Math.abs(days)}`,
    status: days > 0 ? "DAYS AGO" : days < 0 ? "DAYS LEFT" : "TODAY",
    progress: days >= 0 ? 0 : Math.min(1, Math.abs(days) / Math.max(1, referenceDays ?? originalDays)),
  };
}

export const TIMER_COLORS = ["#ff405b", "#ffe234", "#8ef000", "#b76aff", "#ff922e"] as const;
