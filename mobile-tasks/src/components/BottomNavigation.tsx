import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tabs, type TabKey } from "../navigation/tabs";
import { colors } from "../theme";

type Props = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

export function BottomNavigation({ activeTab, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={styles.item}
          >
            <MaterialCommunityIcons
              name={tab.icon as never}
              size={20}
              color={active ? colors.accent : colors.subdued}
            />
            <Text style={[styles.label, active && styles.active]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    minHeight: 66,
    paddingTop: 7,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#151515",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { color: colors.subdued, fontSize: 10, fontWeight: "600" },
  active: { color: colors.accent },
});
