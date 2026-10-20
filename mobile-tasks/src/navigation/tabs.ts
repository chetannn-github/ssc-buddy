export type TabKey = "tasks" | "track" | "practice" | "progress" | "timers" | "habits" | "profile";

export const tabs: Array<{ key: TabKey; label: string; icon: string; activeIcon: string }> = [
  { key: "tasks", label: "Tasks", icon: "clipboard-text-outline", activeIcon: "clipboard-text" },
  { key: "track", label: "Track", icon: "map-outline", activeIcon: "map" },
  { key: "practice", label: "Practice", icon: "notebook-edit-outline", activeIcon: "notebook-edit" },
  { key: "timers", label: "Timers", icon: "timer-sand", activeIcon: "timer-sand-full" },
  { key: "habits", label: "Habits", icon: "calendar-check-outline", activeIcon: "calendar-check" },
  { key: "profile", label: "Profile", icon: "account-circle-outline", activeIcon: "account-circle" },
];
