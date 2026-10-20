import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import {
  HABIT_COLORS,
  habitCalendar,
  habitDay,
  habitEntry,
  habitIntensity,
  habitIsComplete,
  habitScheduled,
  habitStats,
  normalizeHabitSettings,
  type Habit,
} from "../domain/habits";
export function renderHabitWidget(habit?: Habit, error = "") {
  if (!habit)
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: "sscbuddy://habits" }}
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: "#0e0e0e",
          borderRadius: 20,
          padding: 14,
          justifyContent: "center",
        }}
      >
        <TextWidget text="HABITS" style={{ color: "#ffe000", fontSize: 11, fontWeight: "bold" }} />
        <TextWidget
          text="Sign in and select a habit"
          style={{ color: "#fafafa", fontSize: 14, marginTop: 8 }}
        />
      </FlexWidget>
    );
  const today = habitDay(),
    settings = normalizeHabitSettings(habit.settings),
    entry = habitEntry(habit, today),
    stats = habitStats(habit, today),
    tint = HABIT_COLORS[habit.color],
    done = habitIsComplete(habit, today);
  const cells = habitCalendar(today).slice(-70);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="127" height="88" viewBox="0 0 127 88">${cells.map((cell, index) => `<rect x="${Math.floor(index / 7) * 13}" y="${(index % 7) * 13}" width="10" height="10" rx="2" fill="${tint}" fill-opacity="${cell.future ? 0.06 : 0.14 + 0.86 * habitIntensity(habit, cell.key)}"/>`).join("")}</svg>`;
  const checkCount = settings.checklist.filter((item) => entry.checks.includes(item.id)).length;
  const subtitle =
    settings.tracking === "count"
      ? `${entry.count}/${settings.dailyGoal}${settings.unit ? " " + settings.unit : ""}`
      : settings.tracking === "checklist"
        ? `${checkCount}/${settings.checklist.length} completed`
        : done
          ? "Done today"
          : "Due today";
  const button =
    settings.type === "quit" ? (done ? "Mark slip" : "Undo slip") : done ? "Undo" : "Mark done";
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: "#0e0e0e",
        borderRadius: 20,
        padding: 12,
        flexDirection: "column",
      }}
    >
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: "sscbuddy://habits" }}
        style={{
          width: "match_parent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TextWidget
          text={habit.name}
          maxLines={1}
          truncate="END"
          style={{ color: "#fafafa", fontSize: 14, fontWeight: "bold" }}
        />
        <TextWidget
          text={`🔥 ${stats.streak}`}
          style={{ color: tint, fontSize: 12, fontWeight: "bold", marginLeft: 6 }}
        />
      </FlexWidget>
      <TextWidget
        text={error || subtitle}
        maxLines={1}
        style={{ color: error ? "#fca5a5" : "#a1a1aa", fontSize: 10, marginTop: 3 }}
      />
      <FlexWidget
        style={{ width: "match_parent", alignItems: "center", marginTop: 8, marginBottom: 8 }}
      >
        <SvgWidget svg={svg} style={{ width: 127, height: 88 }} />
      </FlexWidget>
      {habit.targetDays && (
        <TextWidget
          text={`${stats.total}/${habit.targetDays} days`}
          style={{ color: tint, fontSize: 10, marginBottom: 5 }}
        />
      )}
      {habitScheduled(habit, today) &&
        (settings.tracking === "checklist" ? (
          settings.checklist.slice(0, 3).map((item) => (
            <FlexWidget
              key={item.id}
              clickAction={`HABIT_CHECK_${encodeURIComponent(item.id)}`}
              style={{ width: "match_parent", paddingVertical: 5 }}
            >
              <TextWidget
                text={`${entry.checks.includes(item.id) ? "✓" : "○"} ${item.title}`}
                maxLines={1}
                truncate="END"
                style={{ color: entry.checks.includes(item.id) ? tint : "#fafafa", fontSize: 11 }}
              />
            </FlexWidget>
          ))
        ) : (
          <FlexWidget
            style={{ width: "match_parent", flexDirection: "row", justifyContent: "center" }}
          >
            {(settings.tracking === "count"
              ? [
                  ["HABIT_MINUS", "−"],
                  ["HABIT_PLUS", `+${settings.step}`],
                ]
              : [["HABIT_TOGGLE", button]]
            ).map(([action, label]) => (
              <FlexWidget
                key={action}
                clickAction={action}
                style={{
                  flex: 1,
                  alignItems: "center",
                  padding: 8,
                  marginHorizontal: 2,
                  borderRadius: 12,
                  backgroundColor: tint,
                }}
              >
                <TextWidget
                  text={label!}
                  style={{ color: "#000000", fontSize: 12, fontWeight: "bold" }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
        ))}
    </FlexWidget>
  );
}
