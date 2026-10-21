import type { NativeNotifications } from "./native-notifications";

export const HABIT_NOTIFICATION_CHANNEL = "habits";

/** Android needs a channel before the notification permission prompt can appear. */
export async function ensureHabitNotificationPermission(
  notifications: NativeNotifications,
  android: boolean,
  askPermission: boolean,
) {
  if (android) {
    const channel = await notifications.setNotificationChannelAsync(HABIT_NOTIFICATION_CHANNEL, {
      name: "Habit reminders",
      importance: notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
    });
    if (channel && channel.importance === notifications.AndroidImportance.NONE)
      throw new Error("Habit reminders are blocked. Open phone Settings → Notifications → SSC Buddy → Habit reminders and allow them.");
  }
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain && askPermission) {
    permission = await notifications.requestPermissionsAsync();
  }
  return permission.granted;
}
