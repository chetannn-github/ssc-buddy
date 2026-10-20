import { UppercaseTextInput as TextInput } from "./UppercaseTextInput";
import { createThemedStyles } from "../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HABIT_ICON_CATALOG, HABIT_ICON_GROUPS } from "../domain/habit-icons";
export function HabitIconSheet({
  value,
  tint,
  onSelect,
  onClose,
}: {
  value: string;
  tint: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState("All"),
    [width, setWidth] = useState(0);
  const groups = group === "All" ? HABIT_ICON_GROUPS : [group];
  const matches = HABIT_ICON_CATALOG.filter(
    (icon) =>
      icon.name.replaceAll("-", " ").includes(search.toLowerCase().trim()) ||
      icon.group.toLowerCase().includes(search.toLowerCase().trim()),
  );
  const size = width ? (width - 5 * 5) / 6 : 48;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close icon picker"
        />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>Icon</Text>
          <View style={s.search}>
            <MaterialCommunityIcons name="magnify" size={23} color="#888" />
            <TextInput
              accessibilityLabel="Search icons"
              value={search}
              onChangeText={setSearch}
              placeholder="Search icons"
              placeholderTextColor="#888"
              style={{ color: "white", flex: 1, fontSize: 16 }}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0, minHeight: 52, marginBottom: 10 }}
            contentContainerStyle={{ gap: 7, alignItems: "center", paddingVertical: 4 }}
          >
            {["All", ...HABIT_ICON_GROUPS].map((item) => (
              <Pressable
                key={item}
                onPress={() => setGroup(item)}
                style={[s.chip, group === item && { backgroundColor: tint + "40" }]}
              >
                <Text
                  style={{ color: group === item ? tint : "#999", fontWeight: "600", fontSize: 13 }}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {groups.map((category) => {
              const icons = matches.filter((icon) => icon.group === category);
              if (!icons.length) return null;
              return (
                <View key={category}>
                  <Text style={s.group}>{category}</Text>
                  <View style={s.grid}>
                    {icons.map((icon) => (
                      <Pressable
                        key={icon.name}
                        accessibilityRole="button"
                        accessibilityLabel={icon.name}
                        accessibilityState={{ selected: value === icon.name }}
                        onPress={() => {
                          onSelect(icon.name);
                          onClose();
                        }}
                        style={[
                          s.tile,
                          { width: size, height: size },
                          value === icon.name && {
                            backgroundColor: tint + "25",
                            borderColor: tint,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={icon.name as any}
                          size={28}
                          color={value === icon.name ? tint : "white"}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
            {!matches.length && <Text style={s.group}>No icons found.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const s = createThemedStyles({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0009" },
  sheet: {
    height: "86%",
    backgroundColor: "#000",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#444",
    marginBottom: 14,
  },
  title: { color: "white", fontWeight: "700", fontSize: 18, textAlign: "center", marginBottom: 20 },
  search: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0e0e0e",
    marginBottom: 16,
  },
  chip: {
    minHeight: 40,
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "#101010",
  },
  group: { color: "#888", fontWeight: "700", fontSize: 14, marginBottom: 10, marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tile: {
    borderRadius: 12,
    backgroundColor: "#101010",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
});
