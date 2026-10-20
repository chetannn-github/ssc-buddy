import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { arrayRemove, arrayUnion, doc, getDoc, runTransaction } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../lib/firebase";
import {
  applyHabitAction,
  habitDay,
  normalizeHabit,
  normalizeHabitSettings,
  type Habit,
  type HabitDayAction,
} from "../domain/habits";
const CACHE = "ssc-buddy:habit-widget-cache:v1",
  PENDING = "ssc-buddy:habit-widget-pending:v1";
const key = (id: number) => `ssc-buddy:habit-widget:${id}`;
export const supportsHabitWidgets = () =>
  Platform.OS === "android" && Constants.appOwnership !== "expo";
async function readJSON(name: string) {
  try {
    const raw = await AsyncStorage.getItem(name);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export async function readWidgetHabits(uid?: string): Promise<Habit[]> {
  const data = await readJSON(CACHE);
  return uid && data?.uid === uid && Array.isArray(data.habits)
    ? data.habits
        .map((h: Habit | null) => h && typeof h.id === "string" ? normalizeHabit(h.id, h) : null)
        .filter((h: Habit | null): h is Habit => !!h)
    : [];
}
let queue = Promise.resolve();
export function cacheWidgetHabits(uid: string | undefined, habits: Habit[]) {
  if (!supportsHabitWidgets()) return Promise.resolve();
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      await AsyncStorage.setItem(CACHE, JSON.stringify({ uid: uid ?? "", habits }));
      await refreshHabitWidgets(uid);
    });
  return queue;
}
export async function bindHabitWidget(id: number, uid: string, habitId: string) {
  await AsyncStorage.setItem(key(id), JSON.stringify({ uid, habitId }));
}
export async function removeHabitWidget(id: number) {
  await AsyncStorage.removeItem(key(id));
}
export async function pendingHabitWidget(uid: string) {
  const p = await readJSON(PENDING);
  return p?.uid === uid && Date.now() - p.at < 120000 ? (p as { habitId: string }) : null;
}
export async function bindPendingHabitWidget(id: number, uid?: string) {
  if (!uid || (await readJSON(key(id)))) return;
  const p = await pendingHabitWidget(uid);
  if (p && (await readWidgetHabits(uid)).some((h) => h.id === p.habitId)) {
    await bindHabitWidget(id, uid, p.habitId);
    await AsyncStorage.removeItem(PENDING);
  }
}
export async function pinHabitWidget(uid: string, habitId: string) {
  if (!supportsHabitWidgets()) throw new Error("Habit widgets need the installed Android app.");
  await AsyncStorage.setItem(PENDING, JSON.stringify({ uid, habitId, at: Date.now() }));
  const { requestPinWidget } = require("react-native-android-widget");
  try {
    if (!(await requestPinWidget({ widgetName: "HabitWidget" })))
      throw new Error("Add SSC Buddy Habit from your home-screen widget menu.");
  } catch (error) {
    await AsyncStorage.removeItem(PENDING);
    throw error;
  }
}
export async function refreshHabitWidgets(uid?: string) {
  if (!supportsHabitWidgets()) return;
  const { requestWidgetUpdate } = require("react-native-android-widget");
  await requestWidgetUpdate({
    widgetName: "HabitWidget",
    renderWidget: (info: { widgetId: number }) => habitWidgetView(info.widgetId, uid, "", false),
  });
}
export async function habitWidgetView(id: number, uid?: string, error = "", fetchCloud = true) {
  const { renderHabitWidget } = require("./HabitWidget"),
    binding = await readJSON(key(id));
  if (!uid || binding?.uid !== uid || getFirebaseAuth().currentUser?.uid !== uid)
    return renderHabitWidget();
  let habit = (await readWidgetHabits(uid)).find((h) => h.id === binding.habitId);
  if (fetchCloud) {
    try {
      const snapshot = await getDoc(
        doc(getFirebaseFirestore(), "users", uid, "habits", binding.habitId),
      );
      habit = snapshot.exists()
        ? (normalizeHabit(snapshot.id, snapshot.data()) ?? undefined)
        : undefined;
    } catch {
      /* Use the last account-scoped cache offline. */
    }
  }
  return renderHabitWidget(habit, error);
}
export async function actOnHabitWidget(id: number, uid: string, action: string) {
  const binding = await readJSON(key(id));
  if (binding?.uid !== uid || getFirebaseAuth().currentUser?.uid !== uid)
    throw new Error("Sign in again");
  const ref = doc(getFirebaseFirestore(), "users", uid, "habits", binding.habitId);
  let updated: Habit | null = null;
  await runTransaction(getFirebaseFirestore(), async (transaction) => {
    const snap = await transaction.get(ref),
      habit = snap.exists() ? normalizeHabit(snap.id, snap.data()) : null;
    if (!habit) throw new Error("Habit removed");
    const settings = normalizeHabitSettings(habit.settings),
      day = habitDay();
    let change: HabitDayAction;
    if (action.startsWith("HABIT_CHECK_"))
      change = { type: "check", id: decodeURIComponent(action.slice("HABIT_CHECK_".length)) };
    else if (action === "HABIT_PLUS" || action === "HABIT_MINUS")
      change = { type: "increment", amount: settings.step * (action === "HABIT_MINUS" ? -1 : 1) };
    else if (action === "HABIT_TOGGLE") change = { type: "toggle" };
    else return;
    const result = applyHabitAction(habit, day, change);
    transaction.update(ref, {
      ["entries." + day]: result.entry,
      completedDates: result.completed ? arrayUnion(day) : arrayRemove(day),
    });
    updated = {
      ...habit,
      entries: { ...habit.entries, [day]: result.entry },
      completedDates: result.completed
        ? [...new Set([...habit.completedDates, day])]
        : habit.completedDates.filter((d) => d !== day),
    };
  });
  if (updated) {
    const items = await readWidgetHabits(uid);
    await cacheWidgetHabits(uid, [...items.filter((h) => h.id !== binding.habitId), updated]);
  }
}
