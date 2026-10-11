import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";

import { dateKey, summarizeTasks, type Task } from "../domain/tasks";

export function renderDailyTasksWidget(tasks: Task[]) {
  const todayTasks = tasks.filter((task) => task.date === dateKey(new Date()));
  const summary = summarizeTasks(todayTasks);
  const pending = summary.total - summary.done;
  const completedFlex = Math.max(0, summary.percent);
  const remainingFlex = Math.max(0, 100 - summary.percent);
  const nextTask = todayTasks.find((task) => !task.completed)?.name ?? "No tasks planned for today";

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Open SSC Buddy daily tasks"
      style={{
        width: "match_parent",
        height: "match_parent",
        flexDirection: "column",
        backgroundColor: "#171717",
        borderRadius: 22,
        padding: 15,
      }}
    >
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
          <ImageWidget
            image={require("../../assets/auth.jpg")}
            imageWidth={34}
            imageHeight={34}
            resizeMode="cover"
            style={{ width: 34, height: 34, borderRadius: 12, marginRight: 10 }}
          />
          <FlexWidget style={{ flexDirection: "column" }}>
            <TextWidget text="SSC BUDDY" style={{ color: "#8ee7d3", fontSize: 9, fontWeight: "bold", letterSpacing: 1.5 }} />
            <TextWidget text="Daily tasks" style={{ color: "#f5f5f5", fontSize: 18, fontWeight: "bold", marginTop: 2 }} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ backgroundColor: "#123b34", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 }}>
          <TextWidget text={`${summary.percent}%`} style={{ color: "#78f0d3", fontSize: 16, fontWeight: "bold" }} />
        </FlexWidget>
      </FlexWidget>
      <TextWidget text={nextTask} maxLines={1} style={{ color: "#b4b4b8", fontSize: 11, marginTop: 13 }} />
      <FlexWidget
        style={{
          width: "match_parent",
          height: 7,
          flexDirection: "row",
          overflow: "hidden",
          borderRadius: 8,
          backgroundColor: "#303030",
          marginTop: 8,
        }}
      >
        {completedFlex > 0 ? <FlexWidget style={{ flex: completedFlex, backgroundColor: "#5eead4" }} /> : null}
        {remainingFlex > 0 ? <FlexWidget style={{ flex: remainingFlex, backgroundColor: "#343434" }} /> : null}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <FlexWidget style={{ flexDirection: "column", backgroundColor: "#212121", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
          <TextWidget text={`${summary.done} / ${summary.total}`} style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold" }} />
          <TextWidget text="completed" style={{ color: "#a1a1aa", fontSize: 10, marginTop: 1 }} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: "column", alignItems: "flex-end", backgroundColor: pending ? "#332a17" : "#123b34", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
          <TextWidget text={String(pending)} style={{ color: pending ? "#fcd34d" : "#78f0d3", fontSize: 16, fontWeight: "bold" }} />
          <TextWidget text="pending" style={{ color: "#a1a1aa", fontSize: 10, marginTop: 1 }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
