import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";

import { dateKey, summarizeTasks, type Task } from "../domain/tasks";

/** Wide tap-through dashboard: render every task scheduled for today. */
export function renderDailyTasksWidget(tasks: Task[]) {
  const todayTasks = tasks.filter((task) => task.date === dateKey(new Date())).sort((left, right) => Number(left.completed) - Number(right.completed));
  const summary = summarizeTasks(todayTasks);
  const pending = summary.total - summary.done;
  return <FlexWidget clickAction="OPEN_APP" accessibilityLabel="Open SSC Buddy Tasks" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#171717", borderRadius: 24, padding: 18 }}>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", flex: 1 }}><ImageWidget image={require("../../assets/auth.jpg")} imageWidth={40} imageHeight={40} resizeMode="cover" style={{ width: 40, height: 40, borderRadius: 13, marginRight: 11 }} /><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text="SSC BUDDY" style={{ color: "#83efd4", fontSize: 10, fontWeight: "bold", letterSpacing: 1.6 }} /><TextWidget text="Daily tasks" style={{ color: "#fafafa", fontSize: 20, fontWeight: "bold", marginTop: 2 }} /></FlexWidget></FlexWidget>
      <FlexWidget style={{ width: 64, alignItems: "center", borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: summary.percent ? "#123b34" : "#262626" }}><TextWidget text={`${summary.percent}%`} style={{ color: summary.percent ? "#76f0d1" : "#d4d4d8", fontSize: 17, fontWeight: "bold" }} /></FlexWidget>
    </FlexWidget>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}><TextWidget text={summary.total ? `${summary.done} completed · ${pending} left` : "No tasks planned today"} style={{ color: "#b4b4b8", fontSize: 12 }} /><TextWidget text="Open tasks  ›" style={{ color: "#83efd4", fontSize: 11, fontWeight: "bold" }} /></FlexWidget>
    <FlexWidget style={{ width: "match_parent", height: 7, flexDirection: "row", overflow: "hidden", borderRadius: 8, backgroundColor: "#303030", marginTop: 9 }}>{summary.percent > 0 ? <FlexWidget style={{ flex: summary.percent, backgroundColor: "#5eead4" }} /> : null}{summary.percent < 100 ? <FlexWidget style={{ flex: Math.max(1, 100 - summary.percent), backgroundColor: "#343434" }} /> : null}</FlexWidget>
    <FlexWidget style={{ flexDirection: "column", marginTop: 13 }}>
      {todayTasks.length ? todayTasks.map((task) => <FlexWidget key={task.id} style={{ width: "match_parent", flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: task.completed ? "#17332e" : "#242424", borderWidth: 1, borderColor: task.completed ? "#285d51" : "#343434", paddingHorizontal: 11, paddingVertical: 10, marginTop: 7 }}><FlexWidget style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: task.completed ? "#5eead4" : "#8b8b8b", backgroundColor: task.completed ? "#5eead4" : "#242424", marginRight: 10 }}><TextWidget text={task.completed ? "✓" : ""} style={{ color: "#073c35", fontSize: 12, fontWeight: "bold" }} /></FlexWidget><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text={task.name} maxLines={1} truncate="END" style={{ color: task.completed ? "#b6d9d1" : "#f1f1f1", fontSize: 13, fontWeight: "bold" }} /><TextWidget text={`${task.subject} · ${task.type}`} maxLines={1} truncate="END" style={{ color: "#9b9ba2", fontSize: 10, marginTop: 2 }} /></FlexWidget></FlexWidget>) : <FlexWidget style={{ alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#343434", borderStyle: "dashed", paddingVertical: 17, marginTop: 7 }}><TextWidget text="Tap to plan your first task" style={{ color: "#b4b4b8", fontSize: 12 }} /></FlexWidget>}
    </FlexWidget>
  </FlexWidget>;
}
