import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { normalizeDateTimer, type DateTimer } from "../domain/date-timers";
const CACHE = "ssc-buddy:timer-widget-cache:v1";
const PENDING = "ssc-buddy:timer-widget-pending:v1";
const bindingKey = (id: number) => `ssc-buddy:timer-widget:${id}`;
export const supportsTimerWidgets = () => Platform.OS === "android" && Constants.appOwnership !== "expo";
export async function cacheWidgetTimers(uid: string | undefined, timers: DateTimer[]) {
  await AsyncStorage.setItem(CACHE, JSON.stringify({ uid: uid ?? "", timers }));
  await refreshTimerWidgets(uid);
}
export async function readWidgetTimers(uid?: string): Promise<DateTimer[]> {
  const raw = await AsyncStorage.getItem(CACHE);
  if (!raw || !uid) return [];
  const data = JSON.parse(raw);
  return data.uid === uid && Array.isArray(data.timers) ? data.timers.map((timer: DateTimer) => normalizeDateTimer(timer.id, timer)).filter((timer: DateTimer | null): timer is DateTimer => timer !== null) : [];
}
export async function bindTimerWidget(id: number, uid: string, timerId: string, color: string) {
  await AsyncStorage.setItem(bindingKey(id), JSON.stringify({ uid, timerId, color }));
}
export async function removeTimerWidget(id: number) { await AsyncStorage.removeItem(bindingKey(id)); }
export async function timerWidgetView(id: number, uid?: string) {
  const { renderTimerWidget } = require("./TimerWidget");
  const raw = await AsyncStorage.getItem(bindingKey(id));
  const binding = raw ? JSON.parse(raw) : null;
  const timers = await readWidgetTimers(uid);
  return renderTimerWidget(binding?.uid === uid ? timers.find(timer => timer.id === binding.timerId) : undefined, timers, binding?.color);
}
export async function refreshTimerWidgets(uid?: string) {
  if (!supportsTimerWidgets()) return;
  const { requestWidgetUpdate } = require("react-native-android-widget");
  await requestWidgetUpdate({ widgetName: "TimerWidget", renderWidget: (info: { widgetId: number }) => timerWidgetView(info.widgetId, uid) });
}
export async function pinTimerWidget(uid: string, timerId: string, color: string) {
  if (!supportsTimerWidgets()) throw new Error("Timer widgets need the installed Android app. They are unavailable in Expo Go and iOS.");
  await AsyncStorage.setItem(PENDING, JSON.stringify({ uid, timerId, color, at: Date.now() }));
  const { requestPinWidget } = require("react-native-android-widget");
  const accepted = await requestPinWidget({ widgetName: "TimerWidget" });
  if (!accepted) { await AsyncStorage.removeItem(PENDING); throw new Error("Your launcher does not support adding widgets here. Add SSC Buddy Timer from your home-screen widget menu."); }
}
export async function pendingTimerWidget(uid: string) {
  const raw = await AsyncStorage.getItem(PENDING);
  const pending = raw ? JSON.parse(raw) : null;
  return pending?.uid === uid && Date.now() - pending.at < 120000 ? pending as { timerId: string; color: string } : null;
}

export async function bindPendingTimerWidget(id: number, uid?: string) {
  if (!uid || await AsyncStorage.getItem(bindingKey(id))) return;
  const pending = await pendingTimerWidget(uid);
  if (!pending || !(await readWidgetTimers(uid)).some(timer => timer.id === pending.timerId)) return;
  await bindTimerWidget(id, uid, pending.timerId, pending.color);
  await AsyncStorage.removeItem(PENDING);
}
