/** One reward per ten completed focus minutes, calculated per calendar day. */
export const FOCUS_REWARD_INTERVAL_MS = 10 * 60_000;
export const focusPoints = (milliseconds: number) => Number.isFinite(Number(milliseconds)) ? Math.floor(Math.max(0, Number(milliseconds) || 0) / FOCUS_REWARD_INTERVAL_MS) : 0;
export const focusRewardTotal = (days: Record<string, number> = {}) => Object.values(days).reduce((sum, value) => sum + focusPoints(value), 0);
export function focusWeek(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return "";
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function weeklyFocus(days: Record<string, number> = {}, week: string) {
  const scoped = Object.entries(days).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && focusWeek(date) === week);
  return { focusMilliseconds: scoped.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0), focusPoints: scoped.reduce((sum, [, value]) => sum + focusPoints(value), 0) };
}
export function focusLeaderboardPatch(uid: string, profile: Record<string, unknown>, date: string, allDays: Record<string, number>) {
  const week = focusWeek(date);
  return { uid, username: String(profile["username"] ?? "").trim().toLowerCase(), name: String(profile["name"] || "Student"), ...(profile["avatar"] ? { avatar: profile["avatar"] } : {}), week, focusDays: Object.fromEntries(Object.entries(allDays).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && focusWeek(day) === week)), focusXp: focusRewardTotal(allDays) };
}
