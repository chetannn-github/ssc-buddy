import type { DailyTask } from "./daily-tasks";
import {
  habitDay,
  habitDue,
  habitIntensity,
  habitScheduled,
  type Habit,
} from "../../mobile-tasks/src/domain/habits";

export function workspaceDates(end: string) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(end + "T12:00:00");
    date.setDate(date.getDate() + index - 13);
    return habitDay(date);
  });
}

export function workspaceSummary(
  tasks: DailyTask[],
  habits: Habit[],
  day: string,
  section: "tasks" | "habits",
  dueOnly = false,
) {
  const daily = tasks.filter((task) => task.date === day);
  const completed = daily.filter((task) => task.completed);
  if (section === "habits") {
    const scheduled = habits.filter((habit) => habitScheduled(habit, day));
    return {
      daily,
      visibleTasks: daily,
      total: habits.length,
      due: habits.filter((habit) => habitDue(habit, day)).length,
      percent: scheduled.length
        ? Math.round(
            (scheduled.reduce((sum, habit) => sum + habitIntensity(habit, day), 0) /
              scheduled.length) *
              100,
          )
        : 0,
      studyMinutes: 0,
    };
  }
  return {
    daily,
    visibleTasks: dueOnly ? daily.filter((task) => !task.completed) : daily,
    total: daily.length,
    due: daily.length - completed.length,
    percent: daily.length ? Math.round((completed.length / daily.length) * 100) : 0,
    studyMinutes: completed.reduce((sum, task) => sum + (task.minutesSpent ?? 0), 0),
  };
}
