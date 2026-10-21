import { cacheWidgetHabits } from "../widgets/habit-widget-store";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  getNativeNotifications,
  IS_EXPO_GO,
  NOTIFICATION_BUILD_MESSAGE,
} from "../lib/native-notifications";
import { useHabits } from "./use-habits";
import { habitDay, habitDue, habitEntry, normalizeHabitSettings } from "../domain/habits";
import {
  ensureHabitNotificationPermission,
  HABIT_NOTIFICATION_CHANNEL,
} from "../lib/habit-notification-permissions";
export async function requestHabitReminders() {
  // Save the preference in Expo Go without invoking incompatible channel APIs.
  if (IS_EXPO_GO) return;
  const Notifications = getNativeNotifications();
  if (!Notifications) throw new Error(NOTIFICATION_BUILD_MESSAGE);
  if (!(await ensureHabitNotificationPermission(Notifications, Platform.OS === "android", true)))
    throw new Error("Allow notifications in your phone settings to enable reminders.");
}
// Rebuild only our alarms. A serialized chain prevents older snapshots replacing newer schedules.
let queue = Promise.resolve();
export function useHabitReminders(uid?: string, enabled = true) {
  const { habits, loading, error } = useHabits(uid);
  const permissionAttempt = useRef({ uid, attempted: false });
  if (permissionAttempt.current.uid !== uid) permissionAttempt.current = { uid, attempted: false };
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
          if (uid && enabled && !loading && !error) {
            const hasReminders = habits.some((habit) => {
              const settings = normalizeHabitSettings(habit.settings);
              return settings.reminder ||
                (settings.tracking === "checklist" && settings.checklist.some((item) => item.reminder));
            });
            if (hasReminders) {
              const ask = !permissionAttempt.current.attempted && AppState.currentState === "active";
              if (ask) permissionAttempt.current.attempted = true;
              const allowed = await ensureHabitNotificationPermission(Notifications, Platform.OS === "android", ask);
              if (!active || !allowed) return;
            }
          }
          const scheduled = await Notifications.getAllScheduledNotificationsAsync();
          if (!active) return;
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
                    channelId: HABIT_NOTIFICATION_CHANNEL,
                  },
                });
                count++;
              }
            }
          }
        });
      void queue.catch((error) => console.warn("Habit reminder scheduling failed:", error));
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
