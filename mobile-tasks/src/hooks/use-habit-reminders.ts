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
import { normalizeHabitSettings, type Habit } from "../domain/habits";
import { habitReminderPlan } from "../domain/habit-reminder-plan";
import {
  ensureHabitNotificationPermission,
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
/** Saving a reminder must finish scheduling it, independently of the Firestore listener. */
export async function scheduleSavedHabitReminders(uid: string, habit: Habit) {
  if (IS_EXPO_GO) return;
  const notifications = getNativeNotifications();
  if (!notifications) throw new Error(NOTIFICATION_BUILD_MESSAGE);
  const settings = normalizeHabitSettings(habit.settings);
  const hasReminder = !!settings.reminder || settings.checklist.some(item => !!item.reminder);
  if (hasReminder && !(await ensureHabitNotificationPermission(notifications, Platform.OS === "android", false)))
    throw new Error("Habit saved, but reminders need notification permission. Allow notifications in phone settings and save again.");
  const work = queue.catch(() => undefined).then(() =>
    reconcileHabitReminders(notifications, habitReminderPlan([habit], uid), uid, () => true, new Set(), habit.id));
  queue = work;
  await work;
}
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
          const now = new Date();
          const plan = uid && enabled ? habitReminderPlan(habits, uid, now) : [];
          // Android may deliver an inexact alarm after its wall-clock time.
          // Keep still-valid pending reminders for an hour instead of cancelling them on resume.
          const recent = uid && enabled ? habitReminderPlan(habits, uid, new Date(now.getTime() - 60 * 60 * 1000)) : [];
          const preservePending = new Set(recent.filter(alarm => alarm.at <= now.getTime()).map(alarm => alarm.identifier));
          await reconcileHabitReminders(Notifications, plan, uid, () => active, preservePending);
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
