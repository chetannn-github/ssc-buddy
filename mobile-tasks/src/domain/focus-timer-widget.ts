import { focusDayKey, todayFocusMilliseconds, type FocusDay, type FocusSession } from "../../../shared/study-focus";

export type FocusWidgetSnapshot = { uid: string; date: string; day: FocusDay; session: FocusSession | null; accent: string };
export const FOCUS_WIDGET_URI = "sscbuddy://focus-lock";

export function focusTimerWidgetModel(snapshot: FocusWidgetSnapshot | null, uid: string | undefined, now = Date.now()) {
  if (!uid || snapshot?.uid !== uid) return { minutes: 0, label: "0m", hint: uid ? "Start focus" : "Open SSC Buddy", accent: "#ffe000" };
  const today = focusDayKey(now, snapshot.session?.timeZone);
  const value = snapshot.date === today ? snapshot.day : null;
  const minutes = Math.floor(todayFocusMilliseconds(value, snapshot.session, now) / 60000);
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
  return { minutes, label, hint: snapshot.session?.paused ? "Paused" : snapshot.session && snapshot.session.endsAt > now ? "Focusing" : "Start focus", accent: snapshot.accent };
}
