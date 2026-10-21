import { FlexWidget, ImageWidget, ListWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { dateKey, formatMinutes, summarizeTasks, type Task } from "../domain/tasks";
import { accentInk, normalizeAppAccent } from "../domain/app-accent";
import { dailyTaskWidgetModel, type DailyTaskWidgetOptions } from "../domain/daily-task-widget";

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

const circleSvg = (percent: number, accent: string, label: string, selected: boolean) => {
  const arc = Math.max(selected ? 2 : 0, Math.min(100, percent)) * 81.68 / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="${selected ? "#535353" : "#292929"}" stroke-width="2.5"/>${arc > 0 ? `<circle cx="16" cy="16" r="13" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${arc} 81.68" transform="rotate(-90 16 16)"/>` : ""}<text x="16" y="20" fill="#fafafa" font-size="12" font-family="sans-serif" font-weight="600" text-anchor="middle">${label}</text></svg>`;
};
export function renderDailyTasksWidget(tasks: Task[], rank: number | null = null, accentColor?: string, options: DailyTaskWidgetOptions = {}) {
  const accent = normalizeAppAccent(accentColor), ink = accentInk(accent);
  const model = dailyTaskWidgetModel(tasks, options), { today, selected, summary, visibleTasks } = model;
  const points = weeklyTaskPoints(tasks);
  const title = `${selected === today ? "Today" : new Date(selected + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}, ${new Date(selected + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return <FlexWidget accessibilityLabel="SSC Buddy daily tasks" style={{ width: "match_parent", height: "match_parent", flexDirection: "column", backgroundColor: "#000000", borderRadius: 22, padding: 12 }}>
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 30 }}>
      <TextWidget text={title} clickAction="OPEN_URI" clickActionData={{ uri: `sscbuddy://tasks?date=${selected}` }} style={{ color: "#fafafa", fontSize: 17, fontWeight: "bold" }} />
      <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
        {rank && rank <= 3 ? <ImageWidget image={[require("../../assets/gold-medal.png"), require("../../assets/silver-medal.png"), require("../../assets/bronze-medal.png")][rank - 1]} imageWidth={16} imageHeight={16} style={{ width: 16, height: 16, marginRight: 3 }} /> : null}
        {rank ? <TextWidget text={`#${rank}`} style={{ color: "#e4e4e7", fontSize: 11, marginRight: 10 }} /> : null}
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: "sscbuddy://tasks/new" }} accessibilityLabel="Add task" style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}><TextWidget text="+" style={{ color: ink, fontSize: 21 }} /></FlexWidget>
      </FlexWidget>
    </FlexWidget>
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", marginTop: 10 }}>
      {model.dates.map((date) => {
        const stats = summarizeTasks(tasks.filter((task) => task.date === date));
        return <FlexWidget key={date} clickAction={`DAILY_DATE_${date}`} accessibilityLabel={date} style={{ flex: 1, alignItems: "center", flexDirection: "column" }}>
          <TextWidget text={new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })} style={{ color: date === selected ? "#fafafa" : "#777777", fontSize: 9, marginBottom: 5 }} />
          <SvgWidget svg={circleSvg(stats.percent, accent, String(new Date(date + "T12:00:00").getDate()), date === selected)} style={{ width: 32, height: 32 }} />
        </FlexWidget>;
      })}
    </FlexWidget>
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
      <FlexWidget style={{ flexDirection: "column" }}>
        <TextWidget text="Filter" style={{ color: "#777777", fontSize: 10, marginBottom: 5 }} />
        <FlexWidget style={{ flexDirection: "row", borderRadius: 9, borderWidth: 1, borderColor: "#292929", overflow: "hidden" }}>
          {[false, true].map((dueOnly) => <TextWidget key={String(dueOnly)} text={dueOnly ? `Due (${model.due.length})` : `All (${summary.total})`} clickAction={dueOnly ? "DAILY_FILTER_DUE" : "DAILY_FILTER_ALL"} style={{ width: 63, height: 28, textAlign: "center", paddingVertical: 5, color: !!options.dueOnly === dueOnly ? ink : "#fafafa", backgroundColor: !!options.dueOnly === dueOnly ? accent : "#000000", fontSize: 11 }} />)}
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: "column", alignItems: "flex-end" }}>
        <TextWidget text="Task Meter" style={{ color: "#777777", fontSize: 10, marginBottom: 5 }} />
        <TextWidget text={`${summary.percent}%`} style={{ color: "#fafafa", fontSize: 15, fontWeight: "bold", borderRadius: 9, borderWidth: 1, borderColor: "#292929", paddingHorizontal: 10, height: 28, paddingVertical: 4 }} />
      </FlexWidget>
    </FlexWidget>
    <TextWidget text={`Study time  ${formatMinutes(summary.minutes)}`} style={{ color: "#a1a1aa", fontSize: 10, marginTop: 8, marginBottom: 8 }} />
    <ListWidget style={{ width: "match_parent", height: Math.max(48, (options.height ?? 300) - 202) }}>
      {visibleTasks.length ? visibleTasks.map((task) => {
        const missed = !task.completed && selected < today, taskPoints = points.get(task.id) ?? 0;
        const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"><circle cx="12.5" cy="12.5" r="11.5" fill="${task.completed ? accent : missed ? "#27191d" : "none"}" stroke="${task.completed ? accent : missed ? "#64363c" : accent}" stroke-width="1.3"/>${task.completed ? `<path d="m7 12.5 3.5 3.5 7.5-8" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : missed ? `<path d="m9 9 7 7m0-7-7 7" stroke="#f19a9f" stroke-width="2" stroke-linecap="round"/>` : ""}</svg>`;
        const action = model.readOnly ? "OPEN_URI" : task.completed ? "TOGGLE_TASK" : "OPEN_URI";
        const actionData = model.readOnly ? { uri: `sscbuddy://tasks?date=${selected}` } : task.completed ? { taskId: task.id } : { uri: `sscbuddy://tasks/complete?taskId=${encodeURIComponent(task.id)}` };
        return <FlexWidget key={task.id} clickAction={action} clickActionData={actionData} accessibilityLabel={`${task.completed ? "Completed" : missed ? "Missed" : "Pending"}: ${task.name}`} style={{ width: "match_parent", flexDirection: "row", alignItems: "center", backgroundColor: "#141414", paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#292929" }}>
          <SvgWidget svg={icon} style={{ width: 25, height: 25, marginRight: 10 }} />
          <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
            <TextWidget text={task.name} maxLines={2} truncate="END" style={{ color: task.completed ? "#a1a1aa" : "#fafafa", fontSize: 12, fontWeight: "bold" }} />
            <TextWidget text={[task.subject, task.type, task.completed ? formatMinutes(task.minutesSpent ?? 0) : ""].filter(Boolean).join(" · ")} maxLines={1} truncate="END" style={{ color: "#909099", fontSize: 9, marginTop: 3 }} />
          </FlexWidget>
          {taskPoints !== 0 && <TextWidget text={`${taskPoints > 0 ? "+" : "−"}${Math.abs(taskPoints)} pts`} style={{ color: taskPoints > 0 ? "#86efac" : "#fca5a5", fontSize: 10, marginLeft: 6 }} />}
        </FlexWidget>;
      }) : <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: `sscbuddy://tasks?date=${selected}` }} style={{ padding: 14 }}><TextWidget text={options.dueOnly && summary.total ? "All tasks complete" : "No tasks planned"} style={{ color: "#a1a1aa", fontSize: 12 }} /></FlexWidget>}
    </ListWidget>
  </FlexWidget>;
}
