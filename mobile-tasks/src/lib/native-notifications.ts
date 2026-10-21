import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type * as ExpoNotifications from "expo-notifications";
type Notifications = Pick<
  typeof ExpoNotifications,
  | "setNotificationHandler"
  | "getPermissionsAsync"
  | "requestPermissionsAsync"
  | "setNotificationChannelAsync"
  | "getAllScheduledNotificationsAsync"
  | "cancelScheduledNotificationAsync"
  | "scheduleNotificationAsync"
  | "addNotificationResponseReceivedListener"
  | "getLastNotificationResponseAsync"
  | "clearLastNotificationResponseAsync"
  | "AndroidImportance"
  | "SchedulableTriggerInputTypes"
>;
export type NativeNotifications = Notifications;
export const IS_EXPO_GO =
  Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";
let cached: Notifications | null | undefined;
/** Only load local notification APIs. The SDK barrel also eagerly loads Android push-topic APIs. */
export function getNativeNotifications(): Notifications | null {
  if (IS_EXPO_GO) return null;
  if (cached !== undefined) return cached;
  try {
    const modules = [
      "ExpoNotificationScheduler",
      "ExpoNotificationPermissionsModule",
      "ExpoNotificationsEmitter",
      "ExpoNotificationsHandlerModule",
      ...(Platform.OS === "android" ? ["ExpoNotificationChannelManager"] : []),
    ];
    if (modules.some((name) => !requireOptionalNativeModule(name))) return (cached = null);
    cached = {
      ...require("expo-notifications/build/NotificationsHandler"),
      ...require("expo-notifications/build/NotificationsEmitter"),
      ...require("expo-notifications/build/NotificationPermissions"),
      ...require("expo-notifications/build/setNotificationChannelAsync"),
      ...require("expo-notifications/build/getAllScheduledNotificationsAsync"),
      ...require("expo-notifications/build/cancelScheduledNotificationAsync"),
      ...require("expo-notifications/build/scheduleNotificationAsync"),
      ...require("expo-notifications/build/NotificationChannelManager.types"),
      ...require("expo-notifications/build/Notifications.types"),
    } as Notifications;
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return cached;
  } catch {
    return (cached = null);
  }
}
export const NOTIFICATION_BUILD_MESSAGE =
  "Reminders need the updated app build. Install the latest APK; your habits work without reminders.";
