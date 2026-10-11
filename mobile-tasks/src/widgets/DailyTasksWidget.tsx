import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from "react-native-android-widget";

import { dateKey, summarizeTasks, type Task } from "../domain/tasks";

/** Wide tap-through dashboard: render every task scheduled for today. */
export function renderDailyTasksWidget(tasks: Task[]) {
  const todayTasks = tasks.filter((task) => task.date === dateKey(new Date())).sort((left, right) => Number(left.completed) - Number(right.completed));
  const summary = summarizeTasks(todayTasks);
  const pending = summary.total - summary.done;
  const pieChart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle cx="26" cy="26" r="20" fill="none" stroke="#303030" stroke-width="8"/><circle cx="26" cy="26" r="20" fill="none" stroke="#5eead4" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(summary.percent * 125.66) / 100} 125.66" transform="rotate(-90 26 26)"/></svg>`;
  return <FlexWidget accessibilityLabel="SSC Buddy daily tasks" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#171717", borderRadius: 24, padding: 18 }}>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", flex: 1 }}><ImageWidget image={require("../../assets/auth.jpg")} imageWidth={40} imageHeight={40} resizeMode="cover" style={{ width: 40, height: 40, borderRadius: 13, marginRight: 11 }} /><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text="SSC BUDDY" style={{ color: "#83efd4", fontSize: 10, fontWeight: "bold", letterSpacing: 1.6 }} /><TextWidget text="Daily tasks" style={{ color: "#fafafa", fontSize: 20, fontWeight: "bold", marginTop: 2 }} /></FlexWidget></FlexWidget>
      <FlexWidget style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}><SvgWidget svg={pieChart} style={{ width: 52, height: 52 }} /></FlexWidget>
    </FlexWidget>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginTop: 13 }}><TextWidget text={summary.total ? `${summary.done} completed · ${pending} left` : "No tasks planned today"} style={{ color: "#b4b4b8", fontSize: 12 }} /></FlexWidget>
    <FlexWidget style={{ width: "match_parent", flexDirection: "column", marginTop: 8 }}>
      {todayTasks.length ? todayTasks.map((task) => <FlexWidget key={task.id} clickAction="TOGGLE_TASK" clickActionData={{ taskId: task.id }} accessibilityLabel={`${task.completed ? "Mark incomplete" : "Mark complete"}: ${task.name}`} style={{ width: "match_parent", flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: task.completed ? "#17332e" : "#242424", borderWidth: 1, borderColor: task.completed ? "#285d51" : "#343434", paddingHorizontal: 12, paddingVertical: 10, marginTop: 7 }}><FlexWidget style={{ width: 21, height: 21, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: task.completed ? "#5eead4" : "#8b8b8b", backgroundColor: task.completed ? "#5eead4" : "#242424", marginRight: 10 }}><TextWidget text={task.completed ? "✓" : ""} style={{ color: "#073c35", fontSize: 12, fontWeight: "bold" }} /></FlexWidget><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text={task.name} maxLines={1} truncate="END" style={{ color: task.completed ? "#b6d9d1" : "#f1f1f1", fontSize: 13, fontWeight: "bold" }} /><TextWidget text={`${task.subject} · ${task.type}`} maxLines={1} truncate="END" style={{ color: "#9b9ba2", fontSize: 10, marginTop: 2 }} /></FlexWidget></FlexWidget>) : <FlexWidget style={{ width: "match_parent", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#343434", borderStyle: "dashed", paddingVertical: 17, marginTop: 7 }}><TextWidget text="No tasks planned today" style={{ color: "#b4b4b8", fontSize: 12 }} /></FlexWidget>}
    </FlexWidget>
  </FlexWidget>;
}
