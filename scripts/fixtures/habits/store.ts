import { useState } from "react";
import {
  habitDay,
  normalizeHabitSettings,
  applyHabitAction,
  type Habit,
  type HabitSaveDetails,
  type HabitDayAction,
} from "../../../mobile-tasks/src/domain/habits";
export function useHabitToday() {
  return habitDay();
}
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return habitDay(date);
};
export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(() => [
    {
      id: "read",
      name: "Read Every Day",
      color: "purple",
      targetDays: 70,
      createdAt: day(-70) + "T12:00:00",
      completedDates: Array.from({ length: 70 }, (_, index) => index - 69)
        .filter((index) => index % 4 !== 0)
        .map(day),
      settings: { ...normalizeHabitSettings(), icon: "book-open-page-variant", category: "Study" },
    },
    {
      id: "water",
      name: "Drink Water",
      color: "green",
      targetDays: null,
      createdAt: day(-70) + "T12:00:00",
      completedDates: Array.from({ length: 60 }, (_, index) => index - 60)
        .filter((index) => index % 3 !== 0)
        .map(day),
      settings: {
        ...normalizeHabitSettings(),
        tracking: "count",
        dailyGoal: 8,
        step: 1,
        unit: "glasses",
        icon: "water",
        category: "Health",
      },
      entries: { [day(0)]: { count: 2, checks: [], note: "" } },
    },
    {
      id: "routine",
      name: "Morning Routine",
      color: "pink",
      targetDays: 30,
      createdAt: day(-10) + "T12:00:00",
      completedDates: [day(-2), day(-1)],
      settings: {
        ...normalizeHabitSettings(),
        tracking: "checklist",
        icon: "white-balance-sunny",
        checklist: [
          { id: "a", title: "Stretch" },
          { id: "b", title: "Meditate" },
        ],
      },
    },
  ]);
  return {
    habits,
    loading: false,
    error: "",
    retry: () => {},
    save: async (details: HabitSaveDetails, old?: Habit) => {
      // Simulated network latency makes loading feedback visible in this isolated fixture.
      await new Promise((resolve) => setTimeout(resolve, 1600));
      setHabits((previous) =>
        old
          ? previous.map((habit) => (habit.id === old.id ? { ...habit, ...details } : habit))
          : [
              ...previous,
              {
                ...details,
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                completedDates: [],
              },
            ],
      );
    },
    remove: async (id: string) => {
      setHabits((previous) => previous.filter((habit) => habit.id !== id));
    },
    updateDay: async (id: string, day: string, action: HabitDayAction) => {
      setHabits((previous) =>
        previous.map((habit) => {
          if (habit.id !== id) return habit;
          const { entry, completed } = applyHabitAction(habit, day, action);
          return {
            ...habit,
            entries: { ...habit.entries, [day]: entry },
            completedDates: completed
              ? [...new Set([...habit.completedDates, day])]
              : habit.completedDates.filter((key) => key !== day),
          };
        }),
      );
    },
  };
}
