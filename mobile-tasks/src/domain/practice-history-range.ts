export const HISTORY_TIME_RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
] as const;

export type HistoryTimeRange = typeof HISTORY_TIME_RANGES[number]["value"];

export function matchesHistoryTimeRange(record: { date?: string; createdAt?: string }, range: HistoryTimeRange, now = new Date()) {
  if (range === "all") return true;
  // Daily recall summaries belong to their calendar day, even if updated later.
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(record.date ?? "");
  const date = calendar
    ? new Date(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3]))
    : new Date(record.createdAt ?? record.date ?? "");
  if (!Number.isFinite(date.getTime())) return false;
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86400000;
  const ago = day(now) - day(date);
  if (range === "today") return ago === 0;
  if (range === "yesterday") return ago === 1;
  return ago >= 0 && ago < (range === "7days" ? 7 : 30);
}
