import { colors } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";

export function TaskHabitSwitch({ section, onPress }: { section: "tasks" | "habits"; onPress: () => void }) {
  const next = section === "tasks" ? "Habits" : "Tasks";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={"Switch to " + next} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, width: 74, justifyContent: "center", height: 34, borderRadius: 10, backgroundColor: "#1b1b1b" }}>
      <MaterialCommunityIcons name="swap-horizontal" size={17} color={colors.accent} />
      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>{next}</Text>
    </Pressable>
  );
}
