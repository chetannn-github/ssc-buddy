export type FocusSession = { id: string; startedAt: number; endsAt: number; timeZone?: string };
export type FocusDay = { totalMilliseconds: number; sessionCredits: Record<string, number> };
export const emptyFocusDay = (): FocusDay => ({ totalMilliseconds: 0, sessionCredits: {} });
export const studyTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function focusDayKey(time = Date.now(), timeZone = studyTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
/** Cumulative elapsed time for this session on each calendar day, never future time. */
export function focusSlices(session: FocusSession | null | undefined, time = Date.now(), checkpoint = false) {
  if (!session || typeof session.id !== "string" || !session.id || !Number.isSafeInteger(session.startedAt) || !Number.isSafeInteger(session.endsAt) || session.endsAt <= session.startedAt || session.endsAt - session.startedAt > 720 * 60000) return [];
  const zone = session.timeZone || studyTimeZone();
  const end = Math.min(time, session.endsAt), slices: { date: string; milliseconds: number }[] = [];
  let start = session.startedAt;
  while (start < end) {
    const date = focusDayKey(start, zone);
    let boundary = end;
    if (focusDayKey(end - 1, zone) !== date) {
      let low = start, high = end;
      while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (focusDayKey(mid, zone) === date) low = mid; else high = mid; }
      boundary = high;
    }
    const elapsed = boundary - start;
    const milliseconds = checkpoint && boundary === end && end < session.endsAt ? Math.floor(elapsed / 60000) * 60000 : elapsed;
    if (milliseconds > 0) slices.push({ date, milliseconds });
    start = boundary;
  }
  return slices;
}
/** Max-per-session credits make retries and multiple connected clients idempotent. */
export function creditFocusDay(value: Partial<FocusDay> | null | undefined, sessionId: string, milliseconds: number): FocusDay {
  const credits = { ...(value?.sessionCredits ?? {}) };
  const previous = Number(credits[sessionId]) || 0, next = Math.max(previous, milliseconds);
  credits[sessionId] = next;
  return { totalMilliseconds: Math.max(0, Number(value?.totalMilliseconds) || 0) + next - previous, sessionCredits: credits };
}
export function todayFocusMilliseconds(value: FocusDay | null, session: FocusSession | null, now = Date.now()) {
  const date = focusDayKey(now, session?.timeZone || studyTimeZone());
  const elapsed = focusSlices(session, now).find(slice => slice.date === date)?.milliseconds ?? 0;
  const credited = session ? value?.sessionCredits[session.id] ?? 0 : 0;
  return Math.max(0, value?.totalMilliseconds ?? 0) + Math.max(0, elapsed - credited);
}
export function formatFocusTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000), minutes = Math.floor(seconds / 60);
  if (!minutes) return seconds ? `${seconds}s` : "0m";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}
