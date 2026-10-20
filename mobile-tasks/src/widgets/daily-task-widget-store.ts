import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DailyTaskWidgetOptions } from "../domain/daily-task-widget";
const key = (id: number) => "ssc-buddy:daily-widget-view:" + id;
export async function loadDailyTaskWidgetOptions(id: number, uid?: string): Promise<DailyTaskWidgetOptions> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(key(id))) ?? "null");
    if (!uid || stored?.uid !== uid) return {};
    return { date: typeof stored.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stored.date) ? stored.date : undefined, dueOnly: stored.dueOnly === true };
  } catch { return {}; }
}
export async function saveDailyTaskWidgetOptions(id: number, uid: string | undefined, options: DailyTaskWidgetOptions) {
  if (!uid) return;
  await AsyncStorage.setItem(key(id), JSON.stringify({ uid, ...options }));
}
export async function removeDailyTaskWidgetOptions(id: number) { await AsyncStorage.removeItem(key(id)); }
