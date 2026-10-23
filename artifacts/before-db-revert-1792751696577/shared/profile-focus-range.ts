import { formatFocusTime } from "./study-focus";
import { focusPoints } from "./focus-rewards";

/** Select a display range from already merged history + live session totals. */
export function selectProfileFocusRange<T extends { ready: boolean; days: Record<string, number> }>(focus: T, includesDay: (date: string) => boolean) {
  const selected = Object.entries(focus.days).filter(([date]) => includesDay(date));
  const milliseconds = selected.reduce((sum, [, value]) => sum + value, 0);
  return {
    ...focus,
    milliseconds,
    text: focus.ready ? formatFocusTime(milliseconds) : "—",
    points: selected.reduce((sum, [, value]) => sum + focusPoints(value), 0),
  };
}
