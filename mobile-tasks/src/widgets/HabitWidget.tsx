import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import {
  HABIT_COLORS, habitDay, habitEntry, habitIntensity, habitIsComplete,
  habitScheduled, habitStats, normalizeHabitSettings, type Habit,
} from "../domain/habits";
import { habitWidgetLayout, type HabitWidgetSize } from "../domain/habit-widget-layout";
import { accentInk } from "../domain/app-accent";

function actionIcon(mark: string, color: string) {
  const path = mark === "check" ? "M6 12l4 4 8-9" : mark === "minus" ? "M6 12h12" : "M6 12h12M12 6v12";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const flame = (tint: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 2c1 6-3 6-2 10-2-1-3-3-2-5C2 13 4 22 12 22s11-10 1-20Zm0 12c4 4 1 7-1 6-3-1-2-4 1-6Z" fill="${tint}"/></svg>`;

export function renderHabitWidget(habit?: Habit, error = "", size: HabitWidgetSize = { width: 180, height: 210 }) {
  const today = habitDay();
  if (!habit) return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "sscbuddy://habits" }}
    style={{ width: "match_parent", height: "match_parent", backgroundColor: "#080808", borderRadius: 24, padding: 14, justifyContent: "center" }}>
    <TextWidget text="HABITS" style={{ color: "#ffe000", fontSize: 11, fontWeight: "bold" }} />
    <TextWidget text="Sign in and select a habit" style={{ color: "#fafafa", fontSize: 14, marginTop: 8 }} />
  </FlexWidget>;
  const settings = normalizeHabitSettings(habit.settings), entry = habitEntry(habit, today);
  const stats = habitStats(habit, today), tint = HABIT_COLORS[habit.color];
  const done = habitIsComplete(habit, today), scheduled = habitScheduled(habit, today);
  const checklist = settings.tracking === "checklist";
  const count = settings.tracking === "count";
  const checks = settings.checklist.filter((item) => entry.checks.includes(item.id));
  const nextItem = settings.type === "quit"
    ? checks[0] ?? settings.checklist[0]
    : settings.checklist.find((item) => !entry.checks.includes(item.id)) ?? checks[checks.length - 1];
  const action = !scheduled ? "OPEN_URI" : count ? "HABIT_PLUS" : checklist && nextItem
    ? `HABIT_CHECK_${encodeURIComponent(nextItem.id)}` : checklist ? "OPEN_URI" : "HABIT_TOGGLE";
  const label = !scheduled ? "Open habit" : count ? `Add ${settings.step}` : checklist
    ? `${nextItem && entry.checks.includes(nextItem.id) ? "Uncheck" : "Check"} ${nextItem?.title ?? "habit"}`
    : settings.type === "quit" ? done ? "Mark slip" : "Undo slip" : done ? "Undo completion" : "Mark done";
  const footer = Boolean(error || count || checklist || habit.targetDays);
  const layout = habitWidgetLayout(size, today, footer ? 27 : 0);
  const { step, labelWidth, labelHeight, cells, wide, gridWidth, gridHeight } = layout;
  const gap = Math.max(2, step * .2), box = step - gap;
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const labels = dayLabels.map((day, index) => `<text x="${wide ? 2 : (index + .5) * step}" y="${wide ? (index + .65) * step : 10}" fill="#777777" font-family="sans-serif" font-size="${wide ? Math.min(9, step * .65) : 9}" text-anchor="${wide ? "start" : "middle"}">${day}</text>`).join("");
  const boxes = cells.map((cell) => {
    const intensity = cell.future ? 0 : habitIntensity(habit, cell.key);
    const x = labelWidth + cell.column * step + gap / 2, y = labelHeight + cell.row * step + gap / 2;
    return `<rect x="${x}" y="${y}" width="${box}" height="${box}" rx="${Math.min(3, box * .22)}" fill="${tint}" fill-opacity="${cell.future ? .035 : intensity > 0 ? .35 + .65 * intensity : wide ? .12 : .025}"${!wide && intensity === 0 ? ` stroke="${cell.future ? "#333333" : tint}" stroke-opacity=".45" stroke-width="1"` : ""}/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gridWidth}" height="${gridHeight}" viewBox="0 0 ${gridWidth} ${gridHeight}">${labels}${boxes}</svg>`;
  const subtitle = wide ? "Last 20 weeks" : new Date(today + "T12:00:00").toLocaleDateString(undefined, { month: "long" });
  const detail = error || (count ? `${entry.count}/${settings.dailyGoal}${settings.unit ? " " + settings.unit : ""}`
    : checklist ? `${checks.length}/${settings.checklist.length} · ${label}` : habit.targetDays ? `${stats.total}/${habit.targetDays} days` : "");
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "sscbuddy://habits" }}
    accessibilityLabel={`${habit.name}, streak ${stats.streak}, ${done ? "completed" : "incomplete"} today`}
    style={{ width: "match_parent", height: "match_parent", backgroundColor: "#080808", borderRadius: 24, padding: 12, flexDirection: "column", overflow: "hidden" }}>
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", height: 38 }}>
      <FlexWidget clickAction={action} clickActionData={{ uri: "sscbuddy://habits" }} accessibilityLabel={label}
        style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: tint, backgroundColor: done ? tint : "#080808", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
        <SvgWidget svg={actionIcon(count || (checklist && !done) ? "plus" : "check", done ? accentInk(tint) : tint)} style={{ width: 21, height: 21 }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <TextWidget text={habit.name} maxLines={1} truncate="END" style={{ color: "#fafafa", fontSize: wide ? 15 : 12, fontWeight: "bold" }} />
        <TextWidget text={subtitle} maxLines={1} style={{ color: "#777777", fontSize: wide ? 10 : 9, marginTop: 2 }} />
      </FlexWidget>
      <FlexWidget style={{ marginLeft: 4, alignItems: "center", flexDirection: "column" }}>
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <TextWidget text={String(stats.streak)} style={{ color: "#fafafa", fontSize: wide ? 19 : 15, fontWeight: "bold" }} />
          <SvgWidget svg={flame(tint)} style={{ width: wide ? 15 : 12, height: wide ? 15 : 12, marginLeft: 2 }} />
        </FlexWidget>
        <TextWidget text={settings.frequency === "period" ? settings.period === "week" ? "WEEKS" : "MONTHS" : "DAYS"} style={{ color: "#777777", fontSize: 7 }} />
      </FlexWidget>
    </FlexWidget>
    <FlexWidget style={{ flex: 1, width: "match_parent", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
      <SvgWidget svg={svg} style={{ width: gridWidth, height: gridHeight }} />
    </FlexWidget>
    {footer && <FlexWidget style={{ width: "match_parent", height: 27, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      {count && scheduled && <FlexWidget clickAction="HABIT_MINUS" accessibilityLabel={`Subtract ${settings.step}`} style={{ width: 25, height: 25, borderRadius: 12, backgroundColor: "#202020", alignItems: "center", justifyContent: "center", marginRight: 6 }}>
        <SvgWidget svg={actionIcon("minus", tint)} style={{ width: 16, height: 16 }} />
      </FlexWidget>}
      <FlexWidget style={{ flex: 1 }}><TextWidget text={detail} maxLines={1} truncate="END" style={{ color: error ? "#fca5a5" : "#999999", fontSize: 9 }} /></FlexWidget>
    </FlexWidget>}
  </FlexWidget>;
}
