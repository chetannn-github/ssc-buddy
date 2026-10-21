import type { NativeNotifications } from "./native-notifications";
import type { HabitReminderAlarm } from "../domain/habit-reminder-plan";
import { HABIT_NOTIFICATION_CHANNEL } from "./habit-notification-permissions";

export async function reconcileHabitReminders(notifications: NativeNotifications, plan: HabitReminderAlarm[], uid?: string, active = () => true) {
  if (!active()) return;
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  if (!active()) return;
  const ours = scheduled.filter(item => item.content.data?.["source"] === "ssc-buddy-habit");
  const wanted = new Set(plan.map(alarm => alarm.identifier));
  const existing = new Map(ours.map(item => [item.identifier, item]));
  // Schedule replacements first. A failed request must never erase all working alarms.
  for (const alarm of plan) {
    if (!active()) return;
    if (existing.get(alarm.identifier)?.content.data?.["signature"] === alarm.signature) continue;
    await notifications.scheduleNotificationAsync({
      identifier: alarm.identifier,
      content: {
        title: alarm.title, body: alarm.body, sound: "default",
        data: { source: "ssc-buddy-habit", uid, habitId: alarm.habitId, signature: alarm.signature, url: "sscbuddy://habits" },
      },
      trigger: { type: notifications.SchedulableTriggerInputTypes.DATE, date: new Date(alarm.at), channelId: HABIT_NOTIFICATION_CHANNEL },
    });
  }
  for (const item of ours) {
    if (!active()) return;
    if (!wanted.has(item.identifier)) await notifications.cancelScheduledNotificationAsync(item.identifier);
  }
}
