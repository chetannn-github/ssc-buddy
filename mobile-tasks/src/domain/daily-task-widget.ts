import { dateKey, dateKeyFromOffset, summarizeTasks, type Task } from "./tasks";
export type DailyTaskWidgetOptions = { date?: string; dueOnly?: boolean; height?: number };
export function dailyTaskWidgetModel(tasks: Task[], options: DailyTaskWidgetOptions = {}, today = dateKey()) {
  const tomorrow = dateKeyFromOffset(1, new Date(today + "T12:00:00"));
  const end = tasks.some((task) => task.date === tomorrow) ? tomorrow : today;
  const dates = Array.from({ length: 7 }, (_, index) => dateKeyFromOffset(index - 6, new Date(end + "T12:00:00")));
  const selected = options.date && dates.includes(options.date) ? options.date : today;
  // Preserve the app's task order when completion changes.
  const dailyTasks = tasks.filter((task) => task.date === selected);
  const due = dailyTasks.filter((task) => !task.completed);
  return { today, selected, dates, dailyTasks, due, summary: summarizeTasks(dailyTasks),
    visibleTasks: options.dueOnly ? due : dailyTasks, readOnly: selected !== today };
}

/** A delayed launcher retry must not complete a task or edit a previous day. */
export function canReopenDailyWidgetTask(task: { date?: unknown; completed?: unknown }, today = dateKey()) {
  return task.date === today && task.completed === true;
}
