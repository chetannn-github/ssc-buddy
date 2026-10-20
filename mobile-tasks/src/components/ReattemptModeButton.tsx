import { Pressable, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, createThemedStyles } from "../theme";

export function ReattemptModeButton({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Reattempt mode"
    accessibilityState={{ selected: active }} onPress={() => onChange(!active)}
    style={({ pressed }) => [s.button, active && s.active, pressed && { opacity: 0.8 }]}>
    <MaterialCommunityIcons name="reload" size={15} color={active ? colors.accent : colors.muted} />
    <Text style={[s.label, active && { color: colors.accent }]}>Reattempt mode</Text>
  </Pressable>;
}
const s = createThemedStyles({
  button: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 11,
    borderWidth: 1, borderColor: "#383838", backgroundColor: "#1b1b1b", paddingHorizontal: 9 },
  active: { borderColor: colors.accent + "66", backgroundColor: colors.accent + "14" },
  label: { color: "#d4d4d8", fontSize: 11, fontWeight: "600" },
});
