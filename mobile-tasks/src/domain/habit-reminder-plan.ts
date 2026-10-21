import { habitDay, habitDue, habitEntry, habitScheduled, normalizeHabitSettings, type Habit } from "./habits";

export type HabitReminderAlarm = { identifier: string; at: number; title: string; body: string; habitId: string; signature: string };
export function habitReminderPlan(habits: Habit[], uid: string, now = new Date(), limit = 60): HabitReminderAlarm[] {
  const alarms: HabitReminderAlarm[] = [];
  for (let offset = 0; offset < 30; offset++) {
    for (const habit of habits) {
      const settings = normalizeHabitSettings(habit.settings);
      const times = [
        ...(settings.reminder ? [{ time: settings.reminder, title: habit.name, itemId: "" }] : []),
        ...(settings.tracking === "checklist" ? settings.checklist : [])
          .filter(item => !!item.reminder)
          .map(item => ({ time: item.reminder!, title: `${habit.name} · ${item.title}`, itemId: item.id })),
      ];
      for (const reminder of times) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)) continue;
        const date = new Date(now);
        date.setDate(date.getDate() + offset);
        const [hour, minute] = reminder.time.split(":").map(Number);
        date.setHours(hour, minute, 0, 0);
        const day = habitDay(date);
        if (date.getTime() <= now.getTime() || !habitScheduled(habit, day) ||
          (settings.type !== "quit" && !habitDue(habit, day)) ||
          (settings.type !== "quit" && reminder.itemId && habitEntry(habit, day).checks.includes(reminder.itemId))) continue;
        const body = settings.description || "A small step today. Keep your habit going.";
        alarms.push({
          identifier: `habit:${JSON.stringify([uid, habit.id, reminder.itemId, day, reminder.time])}`,
          at: date.getTime(), title: reminder.title, body, habitId: habit.id,
          signature: JSON.stringify([date.getTime(), reminder.title, body]),
        });
      }
    }
  }
  return alarms.sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier)).slice(0, limit);
}
