import { invoke, isTauri } from "@tauri-apps/api/core";
export type DesktopHabitStyle = "heatmap" | "month" | "compact";
export type DesktopHabitPin = { uid: string; habitId: string; style: DesktopHabitStyle | "recall" | "tasks" | "study" };
declare global { interface Window { __SSC_HABIT_WIDGET__?: DesktopHabitPin } }
export async function pinDesktopHabit(uid: string, habitId: string, style: DesktopHabitStyle) {
  if (!isTauri()) throw new Error("Open the installed Windows widget to pin habits on your desktop.");
  await invoke("pin_habit_widget", { uid, habitId, style });
}
export async function removeDesktopHabit() { await invoke("remove_habit_widget"); }

export async function pinDesktopRecall(uid: string) {
  if (!isTauri()) throw new Error("Open the installed Windows widget to pin Quick Recall.");
  await invoke("pin_habit_widget", { uid, habitId: "quick-recall", style: "recall" });
}

export async function pinDesktopTasks(uid: string) {
  if (!isTauri()) throw new Error("Open the installed Windows widget to pin Tasks.");
  await invoke("pin_habit_widget", { uid, habitId: "daily-tasks", style: "tasks" });
}

export function responsiveHabitStyle(width: number, height: number): DesktopHabitStyle {
  if (height < 200) return "compact";
  return width < 320 ? "month" : "heatmap";
}

export async function pinDesktopStudy(uid: string) {
  if (!isTauri()) throw new Error("Open the installed Windows widget to pin Study Lock.");
  await invoke("pin_habit_widget", { uid, habitId: "study-lock", style: "study" });
}
