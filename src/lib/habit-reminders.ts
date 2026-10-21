import { useEffect } from "react";
import {
  habitDay,
  habitDue,
  habitEntry,
  normalizeHabitSettings,
  type Habit,
} from "../../mobile-tasks/src/domain/habits";
export async function requestHabitReminders() {
  if (!("Notification" in window)) throw new Error("This browser does not support notifications.");
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error("Allow browser notifications to enable reminders.");
}
export function useHabitReminders(habits: Habit[], uid?: string, enabled = true) {
  useEffect(() => {
    if (!uid || !enabled || !("Notification" in window)) return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const now = new Date(),
        today = habitDay(now),
        time =
          String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      for (const habit of habits) {
        const settings = normalizeHabitSettings(habit.settings);
        if (!habitDue(habit, today)) continue;
        const reminders = [
          ...(settings.reminder
            ? [{ time: settings.reminder, title: habit.name, id: "habit" }]
            : []),
          ...(settings.tracking === "checklist" ? settings.checklist : [])
            .filter((item) => item.reminder && !habitEntry(habit, today).checks.includes(item.id))
            .map((item) => ({
              time: item.reminder,
              title: habit.name + " · " + item.title,
              id: item.id,
            })),
        ];
        for (const reminder of reminders) {
          if (reminder.time !== time) continue;
          const key = "habit-reminder:" + uid + ":" + habit.id + ":" + reminder.id + ":" + today;
          try {
            if (localStorage.getItem(key)) continue;
            const notification = new Notification(reminder.title, {
              body: settings.description || "A small step today. Keep your habit going.",
              tag: key,
            });
            notification.onclick = () => {
              window.dispatchEvent(new Event("ssc-buddy-external-launch"));
              window.focus();
              notification.close();
            };
            localStorage.setItem(key, "1");
          } catch {
            /* Browser may block notifications. */
          }
        }
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [habits, uid, enabled]);
}
