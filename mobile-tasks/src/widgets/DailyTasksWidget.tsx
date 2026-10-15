import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from "react-native-android-widget";

import { dateKey, formatMinutes, summarizeTasks, type Task } from "../domain/tasks";

/** Wide tap-through dashboard: render every task scheduled for today. */
const weeklyTaskPoints = (tasks: Task[]) => {
  const now = new Date(); const start = new Date(now);
  start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weekStart = dateKey(start); const end = new Date(start); end.setDate(end.getDate() + 6);
  const weekEnd = dateKey(end); const today = dateKey(now); let creditedMinutes = 0;
  return new Map(tasks.filter((task) => task.date >= weekStart && task.date <= weekEnd).map((task) => {
    if (!task.completed) return [task.id, task.date < today ? -5 : 0] as const;
    const before = Math.min(210, Math.floor(creditedMinutes / 10));
    creditedMinutes += Math.max(0, Number(task.minutesSpent) || 0);
    return [task.id, 10 + Math.min(210, Math.floor(creditedMinutes / 10)) - before] as const;
  }));
};

export function renderDailyTasksWidget(tasks: Task[], rank: number | null = null) {
  const todayTasks = tasks.filter((task) => task.date === dateKey(new Date())).sort((left, right) => Number(left.completed) - Number(right.completed));
  const summary = summarizeTasks(todayTasks);
  const points = weeklyTaskPoints(tasks);
  const pieChart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="#303030" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="#60a5fa" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(summary.percent * 163.36) / 100} 163.36" transform="rotate(-90 32 32)"/><text x="32" y="37" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle">${summary.percent}%</text></svg>`;
  return <FlexWidget accessibilityLabel="SSC Buddy daily tasks" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#171717", borderRadius: 24, padding: 18 }}>
      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "sscbuddy://tasks" }} accessibilityLabel="Open SSC Buddy daily tasks" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 22 }}><ImageWidget image={require("../../assets/auth.jpg")} imageWidth={40} imageHeight={40} resizeMode="cover" style={{ width: 40, height: 40, borderRadius: 13, marginRight: 11 }} /><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text="SSC BUDDY" style={{ color: "#93c5fd", fontSize: 10, fontWeight: "bold", letterSpacing: 1.6 }} /><TextWidget text="Daily tasks" style={{ color: "#fafafa", fontSize: 20, fontWeight: "bold", marginTop: 2 }} /></FlexWidget></FlexWidget>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginRight: 9 }}>
        {rank && rank <= 3 ? <ImageWidget image={[require("../../assets/gold-medal.png"), require("../../assets/silver-medal.png"), require("../../assets/bronze-medal.png")][rank - 1]} imageWidth={17} imageHeight={17} resizeMode="contain" style={{ width: 17, height: 17, marginRight: 4 }} /> : rank ? <TextWidget text="🏆" style={{ fontSize: 14, marginRight: 4 }} /> : null}
        <TextWidget text={rank ? `#${rank}` : ""} style={{ color: "#fcd34d", fontSize: 12, fontWeight: "bold" }} />
      </FlexWidget>
      <SvgWidget svg={pieChart} style={{ width: 64, height: 64 }} />
    </FlexWidget>
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginTop: 13 }}><TextWidget text={summary.total ? `${summary.done}/${summary.total} complete · ${formatMinutes(summary.minutes)} studied today` : "No tasks planned · 0m studied today"} style={{ color: "#b4b4b8", fontSize: 12 }} /></FlexWidget>
    <FlexWidget style={{ width: "match_parent", flexDirection: "column", marginTop: 8 }}>
      {todayTasks.length ? todayTasks.map((task) => { const taskPoints = points.get(task.id) ?? 0; const pointsText = taskPoints > 0 ? `+${taskPoints}` : taskPoints < 0 ? `−${Math.abs(taskPoints)}` : "0"; return <FlexWidget key={task.id} clickAction={task.completed ? "TOGGLE_TASK" : "OPEN_URI"} clickActionData={task.completed ? { taskId: task.id } : { uri: `sscbuddy://tasks/complete?taskId=${encodeURIComponent(task.id)}` }} accessibilityLabel={`${task.completed ? "Mark incomplete" : "Complete and record time"}: ${task.name}`} style={{ width: "match_parent", flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: task.completed ? "#172c46" : "#242424", borderWidth: 1, borderColor: task.completed ? "#315d91" : "#343434", paddingHorizontal: 12, paddingVertical: 10, marginTop: 7 }}><FlexWidget style={{ width: 21, height: 21, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: task.completed ? "#60a5fa" : "#8b8b8b", backgroundColor: task.completed ? "#60a5fa" : "#242424", marginRight: 10 }}><TextWidget text={task.completed ? "✓" : ""} style={{ color: "#082f49", fontSize: 12, fontWeight: "bold" }} /></FlexWidget><FlexWidget style={{ flexDirection: "column", flex: 1 }}><TextWidget text={task.name} maxLines={1} truncate="END" style={{ color: task.completed ? "#bfdbfe" : "#f1f1f1", fontSize: 13, fontWeight: "bold" }} /><TextWidget text={task.subject || "General"} maxLines={1} truncate="END" style={{ color: "#9b9ba2", fontSize: 10, marginTop: 2 }} /></FlexWidget><TextWidget text={`${pointsText} pts`} style={{ color: taskPoints > 0 ? "#86efac" : taskPoints < 0 ? "#fca5a5" : "#9b9ba2", fontSize: 11, fontWeight: "bold", marginLeft: 8 }} /></FlexWidget>; }) : <FlexWidget style={{ width: "match_parent", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "#343434", borderStyle: "dashed", paddingVertical: 17, marginTop: 7 }}><TextWidget text="No tasks planned today" style={{ color: "#b4b4b8", fontSize: 12 }} /></FlexWidget>}
    </FlexWidget>
  </FlexWidget>;
}
