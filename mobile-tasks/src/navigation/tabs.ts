export type TabKey = "tasks" | "track" | "practice" | "progress" | "profile";

export const tabs: Array<{ key: TabKey; label: string; icon: string; activeIcon: string }> = [
  { key: "tasks", label: "Tasks", icon: "clipboard-text-outline", activeIcon: "clipboard-text" },
  { key: "track", label: "Track", icon: "map-outline", activeIcon: "map" },
  { key: "practice", label: "Practice", icon: "notebook-edit-outline", activeIcon: "notebook-edit" },
  { key: "progress", label: "Progress", icon: "chart-box-outline", activeIcon: "chart-box" },
  { key: "profile", label: "Profile", icon: "account-circle-outline", activeIcon: "account-circle" },
];
