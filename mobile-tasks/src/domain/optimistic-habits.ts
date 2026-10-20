import { applyHabitAction, type Habit, type HabitDayAction } from "./habits";
export function applyHabitPreview(habit: Habit, day: string, action: HabitDayAction): Habit {
  const result = applyHabitAction(habit, day, action);
  return {
    ...habit,
    entries: { ...habit.entries, [day]: result.entry },
    completedDates: result.completed
      ? [...new Set([...habit.completedDates, day])]
      : habit.completedDates.filter((key) => key !== day),
  };
}
