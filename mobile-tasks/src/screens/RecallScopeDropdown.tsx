import { createThemedStyles } from "../theme";
import { DropdownChevron } from "../components/DropdownChevron";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function RecallScopeDropdown({ label, value, options, open, disabled, onToggle, onSelect }: any) {
  const current = options.find((item: any) => item.value === value)?.label ?? "Random";
  return <View style={{ marginTop: 18, position: "relative", zIndex: open ? 20 : 1 }}><Text style={s.label}>{label.toUpperCase()}</Text><Pressable disabled={disabled} style={[s.trigger, open && s.open, disabled && s.disabled]} onPress={onToggle}><Text style={[s.value, disabled && s.muted]}>{current}</Text><DropdownChevron open={open} size={19} color={colors.muted} /></Pressable>{open && <View style={s.menu}>{options.map((item: any) => <Pressable key={item.value} style={[s.option, item.value === value && s.selected]} onPress={() => onSelect(item.value)}><Text style={[s.optionText, item.value === value && s.selectedText]}>{item.label}</Text>{item.value === value && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</Pressable>)}</View>}</View>;
}

const s = createThemedStyles({ label: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginBottom: 7 }, trigger: { height: 48, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#3f3f46", backgroundColor: "#202020", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, open: { borderColor: colors.accent, backgroundColor: "#22272a" }, disabled: { opacity: .48 }, value: { color: colors.text, fontSize: 14 }, muted: { color: colors.muted }, menu: { position: "absolute", top: 67, left: 0, right: 0, zIndex: 30, marginTop: 5, borderRadius: 11, padding: 4, borderWidth: 1, borderColor: "#3b3b3b", backgroundColor: "#282828" }, option: { minHeight: 39, paddingHorizontal: 10, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, selected: { backgroundColor: "#f4f4f5" }, optionText: { color: colors.text, fontSize: 13 }, selectedText: { color: "#171717" } });
