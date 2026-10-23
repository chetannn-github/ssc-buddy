import { Text, View } from "react-native";
import { createThemedStyles } from "../theme";

export function TaskEmptyState({ mode = "empty" }: {
  mode?: "empty" | "complete" | "history";
}) {
  const title = mode === "complete" ? "All tasks complete for this day." : "No tasks for this day.";
  return <View style={s.row}>
    <Text style={s.title}>{title}</Text>
  </View>;
}

const s = createThemedStyles({
  row: { paddingHorizontal: 14, paddingVertical: 14 },
  title: { color: "#71717a", fontSize: 12, lineHeight: 17, textAlign: "center" },
});
