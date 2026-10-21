import { reconcileHabitReminders } from "../lib/habit-reminder-scheduler";
import { cacheWidgetHabits } from "../widgets/habit-widget-store";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  getNativeNotifications,
  IS_EXPO_GO,
  NOTIFICATION_BUILD_MESSAGE,
} from "../lib/native-notifications";
import { useHabits } from "./use-habits";
import { normalizeHabitSettings } from "../domain/habits";
import { habitReminderPlan } from "../domain/habit-reminder-plan";
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
export async function testHabitReminder(title: string) {
  await requestHabitReminders();
  const notifications = getNativeNotifications();
  if (!notifications) throw new Error(NOTIFICATION_BUILD_MESSAGE);
  await notifications.scheduleNotificationAsync({
    content: { title: title || "Habit reminder", body: "Your habit reminders are working.", sound: "default", data: { source: "ssc-buddy-habit-test", url: "sscbuddy://habits" } },
    trigger: { type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: HABIT_NOTIFICATION_CHANNEL },
  });
}
// Rebuild only our alarms. A serialized chain prevents older snapshots replacing newer schedules.
let queue = Promise.resolve();
export function useHabitReminders(uid?: string, enabled = true, ready = true) {
  const { habits, loading, error } = useHabits(uid);
  const permissionAttempt = useRef({ uid, attempted: false });
  if (permissionAttempt.current.uid !== uid) permissionAttempt.current = { uid, attempted: false };
  useEffect(() => {
    if (!loading && !error) void cacheWidgetHabits(uid, habits).catch(() => undefined);
  }, [uid, habits, loading, error]);
  useEffect(() => {
    const Notifications = getNativeNotifications();
    if (!Notifications || !ready) return;
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
          if (!active || loading || error) return;
          await reconcileHabitReminders(Notifications, uid && enabled ? habitReminderPlan(habits, uid) : [], uid, () => active);
        });
      void queue.catch((error) => console.warn("Habit reminder scheduling failed:", error));
    };
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    const refresh = setInterval(() => { if (AppState.currentState === "active") sync(); }, 60_000);
    return () => {
      active = false;
      clearInterval(refresh);
      subscription.remove();
    };
  }, [uid, enabled, ready, habits, loading, error]);
}
