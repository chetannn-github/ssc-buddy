export type TabKey = "tasks" | "track" | "practice" | "progress" | "profile";

export const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "tasks", label: "Tasks", icon: "format-list-checks" },
  { key: "track", label: "Track", icon: "vector-polyline" },
  { key: "practice", label: "Practice", icon: "notebook-edit-outline" },
  { key: "progress", label: "Progress", icon: "chart-bar" },
  { key: "profile", label: "Profile", icon: "account-circle-outline" },
];
