import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import {
  HABIT_COLORS, habitDay, habitEntry, habitIntensity, habitIsComplete,
  habitScheduled, habitStats, normalizeHabitSettings, type Habit,
} from "../domain/habits";
import { habitWidgetLayout, type HabitWidgetSize, type HabitWidgetStyle } from "../domain/habit-widget-layout";
import { accentInk } from "../domain/app-accent";

function actionIcon(mark: string, color: string) {
  const path = mark === "check" ? "M6 12l4 4 8-9" : mark === "minus" ? "M6 12h12" : "M6 12h12M12 6v12";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const flame = (tint: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13 2c1 6-3 6-2 10-2-1-3-3-2-5C2 13 4 22 12 22s11-10 1-20Zm0 12c4 4 1 7-1 6-3-1-2-4 1-6Z" fill="${tint}"/></svg>`;

export function renderHabitWidget(habit?: Habit, error = "", size: HabitWidgetSize = { width: 180, height: 210 }, style: HabitWidgetStyle = "heatmap", ownerUid?: string) {
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
  const habitUri = checklist
    ? `sscbuddy://habits/checklist?habitId=${encodeURIComponent(habit.id)}${ownerUid ? `&uid=${encodeURIComponent(ownerUid)}` : ""}`
    : "sscbuddy://habits";
  const action = checklist || !scheduled ? "OPEN_URI" : count ? "HABIT_PLUS" : "HABIT_TOGGLE";
  const label = checklist ? "Open checklist" : !scheduled ? "Open habit" : count ? `Add ${settings.step}`
    : settings.type === "quit" ? done ? "Mark slip" : "Undo slip" : done ? "Undo completion" : "Mark done";
  const targetProgress = habit.targetDays ? `${stats.total}/${habit.targetDays} days` : "";
  const footer = Boolean(error || count || checklist || (style === "compact" && targetProgress));
  const reservedFooterHeight = footer ? 36 : 0;
  const layout = habitWidgetLayout(size, today, reservedFooterHeight, style);
  const { step, columnStep, labelWidth, labelHeight, cells, wide, gridWidth, gridHeight } = layout;
  const gap = Math.max(2, Math.min(3, step * .18)), box = step - gap;
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const labels = dayLabels.map((day, index) => `<text x="${wide ? 2 : index * columnStep + step / 2}" y="${wide ? (index + .65) * step : 10}" fill="#777777" font-family="sans-serif" font-size="${wide ? Math.min(9, step * .65) : 9}" text-anchor="${wide ? "start" : "middle"}">${day}</text>`).join("");
  const boxes = cells.map((cell) => {
    const intensity = cell.future ? 0 : habitIntensity(habit, cell.key);
    const x = labelWidth + cell.column * columnStep + gap / 2, y = labelHeight + cell.row * step + gap / 2;
    return `<rect x="${x}" y="${y}" width="${box}" height="${box}" rx="${Math.min(3, box * .22)}" fill="${tint}" fill-opacity="${cell.future ? .035 : intensity > 0 ? .35 + .65 * intensity : wide ? .12 : .025}"${!wide && intensity === 0 ? ` stroke="${cell.future ? "#333333" : tint}" stroke-opacity=".45" stroke-width="1"` : ""}/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gridWidth}" height="${gridHeight}" viewBox="0 0 ${gridWidth} ${gridHeight}" preserveAspectRatio="xMidYMid meet">${labels}${boxes}</svg>`;
  const subtitle = targetProgress || (wide ? "Last 20 weeks" : new Date(today + "T12:00:00").toLocaleDateString(undefined, { month: "long" }));
  const detail = error || (style === "compact" && targetProgress ? targetProgress
    : count ? `${entry.count}/${settings.dailyGoal}${settings.unit ? " " + settings.unit : ""}`
    : checklist ? `${checks.length}/${settings.checklist.length} items` : "");
  const narrowCompact = size.width < 160;
  const compactButton = narrowCompact ? 40 : 48;
  const compactTitleOffset = narrowCompact ? Math.max(0, Math.min(18, size.height - 150)) : 0;
  if (style === "compact") return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: habitUri }}
    accessibilityLabel={`${habit.name}, streak ${stats.streak}, ${done ? "completed" : "incomplete"} today`}
    style={{ width: "match_parent", height: "match_parent", backgroundColor: "#080808", borderRadius: 24, padding: narrowCompact ? 10 : 14, paddingBottom: narrowCompact ? 10 + Math.max(0, Math.min(12, size.height - 160)) : 14, flexDirection: "column" }}>
    <TextWidget text={habit.name} maxLines={2} truncate="END" style={{ color: "#fafafa", fontSize: narrowCompact ? 16 : 19, fontWeight: "bold", marginTop: compactTitleOffset }} />
    <FlexWidget style={{ flex: 1 }} />
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <TextWidget text={String(stats.streak)} style={{ color: "#fafafa", fontSize: narrowCompact ? 27 : 32, fontWeight: "bold" }} />
          <SvgWidget svg={flame(tint)} style={{ width: narrowCompact ? 18 : 23, height: narrowCompact ? 21 : 26, marginLeft: 3 }} />
        </FlexWidget>
        <TextWidget text={settings.frequency === "period" ? settings.period === "week" ? "WEEKS" : "MONTHS" : stats.streak === 1 ? "DAY" : "DAYS"} style={{ color: "#999999", fontSize: 11, marginTop: 2 }} />
      </FlexWidget>
      <FlexWidget clickAction={action} clickActionData={{ uri: habitUri }} accessibilityLabel={label}
        style={{ width: compactButton, height: compactButton, borderRadius: compactButton / 2, borderWidth: 1.5, borderColor: tint, backgroundColor: done ? tint : "#080808", alignItems: "center", justifyContent: "center" }}>
        <SvgWidget svg={actionIcon(count || (checklist && !done) ? "plus" : "check", done ? accentInk(tint) : tint)} style={{ width: narrowCompact ? 27 : 33, height: narrowCompact ? 27 : 33 }} />
      </FlexWidget>
    </FlexWidget>
    {footer && <TextWidget text={detail} maxLines={1} truncate="END" style={{ color: error ? "#fca5a5" : "#999999", fontSize: 9, marginTop: 8 }} />}
  </FlexWidget>;
  return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: habitUri }}
    accessibilityLabel={`${habit.name}, streak ${stats.streak}, ${done ? "completed" : "incomplete"} today`}
    style={{ width: "match_parent", height: "match_parent", backgroundColor: "#080808", borderRadius: 24, padding: 12, flexDirection: "column", overflow: "hidden" }}>
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", height: 38 }}>
      <FlexWidget clickAction={action} clickActionData={{ uri: habitUri }} accessibilityLabel={label}
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
    <FlexWidget style={{ height: gridHeight, width: "match_parent", alignItems: "center", justifyContent: "center", marginTop: 8 }}>
      <SvgWidget svg={svg} style={{ width: gridWidth, height: gridHeight }} />
    </FlexWidget>
    <FlexWidget style={{ flex: 1 }} />
    {footer && <FlexWidget style={{ width: "match_parent", height: reservedFooterHeight, marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      {count && scheduled && <FlexWidget clickAction="HABIT_MINUS" accessibilityLabel={`Subtract ${settings.step}`} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: tint, backgroundColor: done ? tint : "#080808", alignItems: "center", justifyContent: "center", marginRight: 6 }}>
        <SvgWidget svg={actionIcon("minus", done ? accentInk(tint) : tint)} style={{ width: 21, height: 21 }} />
      </FlexWidget>}
      <FlexWidget style={{ flex: 1 }}><TextWidget text={detail} maxLines={1} truncate="END" style={{ color: error ? "#fca5a5" : "#999999", fontSize: 9 }} /></FlexWidget>
    </FlexWidget>}
  </FlexWidget>;
}
