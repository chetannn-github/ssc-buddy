import { cacheWidgetHabits } from "../widgets/habit-widget-store";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import {
  getNativeNotifications,
  IS_EXPO_GO,
  NOTIFICATION_BUILD_MESSAGE,
} from "../lib/native-notifications";
import { useHabits } from "./use-habits";
import { habitDay, habitDue, habitEntry, normalizeHabitSettings } from "../domain/habits";
export async function requestHabitReminders() {
  // Save the preference in Expo Go without invoking incompatible channel APIs.
  if (IS_EXPO_GO) return;
  const Notifications = getNativeNotifications();
  if (!Notifications) throw new Error(NOTIFICATION_BUILD_MESSAGE);
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("habits", {
      name: "Habit reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error("Allow notifications in your phone settings to enable reminders.");
}
// Rebuild only our alarms. A serialized chain prevents older snapshots replacing newer schedules.
let queue = Promise.resolve();
export function useHabitReminders(uid?: string, enabled = true) {
  const { habits, loading, error } = useHabits(uid);
  useEffect(() => {
    if (!loading && !error) void cacheWidgetHabits(uid, habits).catch(() => undefined);
  }, [uid, habits, loading, error]);
  useEffect(() => {
    const Notifications = getNativeNotifications();
    if (!Notifications) return;
    let active = true;
    const sync = () => {
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          if (!active) return;
          const scheduled = await Notifications.getAllScheduledNotificationsAsync();
          for (const item of scheduled)
            if (
              item.content.data?.["source"] === "ssc-buddy-habit" &&
              (item.content.data?.["uid"] !== uid || !enabled || (!loading && !error))
            )
              await Notifications.cancelScheduledNotificationAsync(item.identifier);
          if (
            !uid ||
            !enabled ||
            loading ||
            error ||
            !(await Notifications.getPermissionsAsync()).granted
          )
            return;
          if (Platform.OS === "android")
            await Notifications.setNotificationChannelAsync("habits", {
              name: "Habit reminders",
              importance: Notifications.AndroidImportance.DEFAULT,
            });
          let count = 0;
          for (let offset = 0; offset < 30 && count < 60; offset++) {
            for (const habit of habits) {
              const settings = normalizeHabitSettings(habit.settings);
              const times = [
                ...(settings.reminder
                  ? [{ time: settings.reminder, title: habit.name, itemId: "" }]
                  : []),
                ...(settings.tracking === "checklist" ? settings.checklist : [])
                  .filter((item) => !!item.reminder)
                  .map((item) => ({
                    time: item.reminder!,
                    title: habit.name + " · " + item.title,
                    itemId: item.id,
                  })),
              ];
              for (const reminder of times) {
                if (count >= 60) break;
                const date = new Date();
                date.setDate(date.getDate() + offset);
                const [hour, minute] = reminder.time.split(":").map(Number);
                date.setHours(hour!, minute!, 0, 0);
                const day = habitDay(date);
                if (
                  date.getTime() <= Date.now() ||
                  !habitDue(habit, day) ||
                  (reminder.itemId && habitEntry(habit, day).checks.includes(reminder.itemId))
                )
                  continue;
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: reminder.title,
                    body: settings.description || "A small step today. Keep your habit going.",
                    data: {
                      source: "ssc-buddy-habit",
                      uid,
                      habitId: habit.id,
                      url: "sscbuddy://habits",
                    },
                    sound: "default",
                  },
                  trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date,
                    channelId: "habits",
                  },
                });
                count++;
              }
            }
          }
        });
      void queue.catch(() => undefined);
    };
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [uid, enabled, habits, loading, error]);
}
