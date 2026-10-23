export const FOCUS_BEFORE_BREAK_MS = 30 * 60000;
export const FOCUS_BREAK_MS = 10 * 60000;
export const maxStudyBreaks = (minutes: number) => Math.max(0, Math.floor(minutes / 30) - 1);
export type BreakSession = {
  id: string; lockId?: string; startedAt: number; endsAt: number;
  paused?: boolean; pausedAt?: number; remainingMs?: number;
  breakLimit?: number; breaksTaken?: number; breakUntil?: number;
};
export function onStudyBreak(session: BreakSession | null | undefined, now = Date.now()) {
  return !!session?.paused && Number.isSafeInteger(session.breakUntil) && session.breakUntil! > now;
}
/** Auto-resume uses the saved deadline, even with every client closed/offline. */
export function effectiveStudySession<T extends BreakSession>(session: T, now = Date.now()): T {
  if (!session.paused || !session.breakUntil || now < session.breakUntil) return session;
  const { paused, pausedAt, remainingMs, breakUntil, ...rest } = session;
  return { ...rest, id: `${session.lockId ?? session.id}:focus-${session.breaksTaken ?? 0}`, lockId: session.lockId ?? session.id,
    startedAt: breakUntil, endsAt: breakUntil + (remainingMs ?? 0) } as T;
}
export function studyBreakState(raw: BreakSession, now = Date.now()) {
  const session = effectiveStudySession(raw, now);
  const left = Math.max(0, (session.breakLimit ?? 0) - (session.breaksTaken ?? 0));
  const waitMs = Math.max(0, FOCUS_BEFORE_BREAK_MS - (now - session.startedAt));
  return { left, waitMs, available: !session.paused && now < session.endsAt && left > 0 && waitMs === 0 };
}
export function beginStudyBreak<T extends BreakSession>(raw: T, now = Date.now()): T {
  const session = effectiveStudySession(raw, now), state = studyBreakState(session, now);
  if (!state.available) throw Error(state.left ? "Focus for at least 30 minutes before your next break." : "No breaks remaining in this session.");
  return { ...session, paused: true, pausedAt: now, remainingMs: session.endsAt - now,
    breaksTaken: (session.breaksTaken ?? 0) + 1, breakUntil: now + FOCUS_BREAK_MS };
}
export function studyTimerMilliseconds(raw: BreakSession, now = Date.now()) {
  const session = effectiveStudySession(raw, now);
  return Math.max(0, onStudyBreak(session, now) ? session.breakUntil! - now : session.paused ? session.remainingMs ?? 0 : session.endsAt - now);
}
