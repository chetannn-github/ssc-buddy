import { FlexWidget, TextWidget } from "react-native-android-widget";

import { dateKey, summarizeTasks, type Task } from "../domain/tasks";

export function renderDailyTasksWidget(tasks: Task[]) {
  const todayTasks = tasks.filter((task) => task.date === dateKey(new Date()));
  const summary = summarizeTasks(todayTasks);
  const pending = summary.total - summary.done;
  const completedFlex = Math.max(0, summary.percent);
  const remainingFlex = Math.max(0, 100 - summary.percent);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Open SSC Buddy daily tasks"
      style={{
        width: "match_parent",
        height: "match_parent",
        flexDirection: "column",
        backgroundColor: "#171717",
        borderRadius: 20,
        padding: 16,
      }}
    >
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <FlexWidget style={{ flexDirection: "column" }}>
          <TextWidget text="SSC BUDDY" style={{ color: "#7dd3c7", fontSize: 10, fontWeight: "bold", letterSpacing: 1.5 }} />
          <TextWidget text="Daily tasks" style={{ color: "#f5f5f5", fontSize: 20, fontWeight: "bold", marginTop: 3 }} />
        </FlexWidget>
        <FlexWidget style={{ backgroundColor: "#173c36", borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 }}>
          <TextWidget text={`${summary.percent}%`} style={{ color: "#5eead4", fontSize: 17, fontWeight: "bold" }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget
        style={{
          width: "match_parent",
          height: 8,
          flexDirection: "row",
          overflow: "hidden",
          borderRadius: 8,
          backgroundColor: "#343434",
          marginTop: 16,
        }}
      >
        {completedFlex > 0 ? <FlexWidget style={{ flex: completedFlex, backgroundColor: "#5eead4" }} /> : null}
        {remainingFlex > 0 ? <FlexWidget style={{ flex: remainingFlex, backgroundColor: "#343434" }} /> : null}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 15 }}>
        <FlexWidget style={{ flexDirection: "column" }}>
          <TextWidget text={`${summary.done} / ${summary.total}`} style={{ color: "#ffffff", fontSize: 18, fontWeight: "bold" }} />
          <TextWidget text="completed" style={{ color: "#a1a1aa", fontSize: 11, marginTop: 2 }} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: "column", alignItems: "flex-end" }}>
          <TextWidget text={String(pending)} style={{ color: pending ? "#fbbf24" : "#5eead4", fontSize: 18, fontWeight: "bold" }} />
          <TextWidget text="pending" style={{ color: "#a1a1aa", fontSize: 11, marginTop: 2 }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
