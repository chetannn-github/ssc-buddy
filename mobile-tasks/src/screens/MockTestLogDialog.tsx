import { UppercaseTextInput as TextInput } from "../components/UppercaseTextInput";
import { createThemedStyles } from "../theme";
import { DropdownChevron } from "../components/DropdownChevron";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Keyboard, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme";
import { CalendarDatePicker } from "../components/CalendarDatePicker";
import { dateKey } from "../domain/tasks";

export type MockTestLog = {
  id: string;
  date: string;
  createdAt: string;
  type: "Sectional" | "Pre" | "Mains";
  subject: string;
  score: number;
  total: number;
  accuracy: number;
};

const totals: Record<MockTestLog["type"], string> = { Sectional: "25", Pre: "200", Mains: "390" };
const today = () => dateKey();

export function MockTestLogDialog({ visible, subjects, onClose, onSave }: { visible: boolean; subjects: string[]; onClose: () => void; onSave: (entry: MockTestLog) => void }) {
  const [type, setType] = useState<MockTestLog["type"]>("Sectional");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(today());
  const [score, setScore] = useState("");
  const [total, setTotal] = useState(totals.Sectional);
  const [accuracy, setAccuracy] = useState("");
  const [menu, setMenu] = useState<"type" | "subject" | null>(null);
  const [menuVisible, setMenuVisible] = useState<"type" | "subject" | null>(null);
  const menuProgress = useRef(new Animated.Value(0)).current;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType("Sectional"); setSubject(subjects[0] ?? ""); setDate(today()); setScore(""); setTotal(totals.Sectional); setAccuracy(""); setMenu(null); setMenuVisible(null); menuProgress.setValue(0); setError(""); setSaving(false);
  }, [visible, subjects]);
  const updateMenu = (next: "type" | "subject" | null) => {
    if (menu === next) return;
    if (next) {
      setMenuVisible(next);
      setMenu(next);
      menuProgress.setValue(0);
      Animated.timing(menuProgress, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    setMenu(null);
    Animated.timing(menuProgress, { toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMenuVisible(null);
    });
  };
  const closeMenu = () => updateMenu(null);

  const save = async () => {
    if (saving) return;
    const numericScore = Number(score), numericTotal = Number(total), numericAccuracy = Number(accuracy);
    if (!date || !score || !total || !accuracy || (type === "Sectional" && !subject) || !Number.isFinite(numericScore) || !Number.isFinite(numericTotal) || !Number.isFinite(numericAccuracy) || numericTotal <= 0 || numericScore < 0 || numericScore > numericTotal || numericAccuracy < 0 || numericAccuracy > 100) {
      setError(type === "Sectional" && !subject ? "Add a syllabus subject before logging a sectional test." : "Enter a valid score and accuracy.");
      return;
    }
    setSaving(true); await new Promise((resolve) => setTimeout(resolve, 280));
    onSave({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date, createdAt: new Date().toISOString(), type, subject: type === "Sectional" ? subject : "All subjects", score: numericScore, total: numericTotal, accuracy: numericAccuracy });
    onClose();
  };

  const select = (label: "type" | "subject", value: string, values: string[], onChoose: (value: string) => void, disabled = false) => <View style={styles.selectWrap}>
    <Text style={styles.label}>{label}</Text>
    <Pressable disabled={disabled} style={[styles.select, disabled && styles.disabled]} onPress={() => { Keyboard.dismiss(); updateMenu(menu === label ? null : label); }}><Text style={styles.selectText}>{value}</Text><DropdownChevron open={menu === label} size={19} color={colors.muted} /></Pressable>
    {menuVisible === label && <Animated.View style={[styles.menu, { opacity: menuProgress, transform: [{ translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) }, { scale: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>{values.map((item) => { const selected = item === value; return <Pressable key={item} style={[styles.option, selected && styles.optionActive]} onPress={() => { onChoose(item); closeMenu(); }}><Text style={[styles.optionText, selected && styles.optionTextActive]}>{item}</Text>{selected && <MaterialCommunityIcons name="check" size={16} color="#171717" />}</Pressable>; })}</Animated.View>}
  </View>;

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <BlurView intensity={72} tint="dark" style={styles.blur}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.dialog} onPress={closeMenu}>
      <View style={styles.heading}><View><Text style={styles.kicker}>MOCK TEST</Text><Text style={styles.title}>Log mock test</Text></View><Pressable hitSlop={9} onPress={onClose}><MaterialCommunityIcons name="close" size={21} color={colors.muted} /></Pressable></View>
      <View style={[styles.row, styles.topRow]}>{select("type", type, ["Sectional", "Pre", "Mains"], (value) => { const next = value as MockTestLog["type"]; setType(next); setTotal(totals[next]); })}{select("subject", type === "Sectional" ? (subject || "No subjects") : "All subjects", type === "Sectional" ? subjects : ["All subjects"], setSubject, type !== "Sectional" || subjects.length === 0)}</View>
      {type === "Sectional" && subjects.length === 0 ? <Text style={styles.helper}>Add a subject in Syllabus first.</Text> : null}
      <View style={[styles.row, styles.lowerRow]}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.label}>Date</Text><CalendarDatePicker value={date} onChange={setDate} onOpen={closeMenu} disabled={saving} /></View><Field label="Score" value={score} onChangeText={(value) => setScore(clampInput(value, Number(total) || 0))} onFocus={closeMenu} placeholder="0" numeric maxLength={String(Math.max(0, Number(total) || 0)).length} /></View>
      <View style={styles.row}><Field label="Total marks" value={total} onChangeText={(value) => { setTotal(value); if (score) setScore(clampInput(score, Number(value) || 0)); }} onFocus={closeMenu} numeric /><Field label="Accuracy %" value={accuracy} onChangeText={(value) => setAccuracy(clampInput(value, 100))} onFocus={closeMenu} placeholder="0" numeric maxLength={3} /></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}><Pressable disabled={saving} onPress={onClose}><Text style={[styles.cancel, saving && styles.disabled]}>Cancel</Text></Pressable><Pressable disabled={saving} style={[styles.save, saving && styles.disabled]} onPress={() => void save()}>{saving ? <ActivityIndicator size="small" color={colors.accentDeep} /> : <Text style={styles.saveText}>Save mock test</Text>}</Pressable></View>
    </Pressable></Pressable></BlurView>
  </Modal>;
}

function clampInput(value: string, maximum: number) {
  if (!value) return "";
  const sanitized = value.replace(/[^0-9.]/g, "");
  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.min(Math.max(0, numeric), maximum));
}

function Field({ label, value, onChangeText, onFocus, placeholder, numeric = false, maxLength }: { label: string; value: string; onChangeText: (value: string) => void; onFocus: () => void; placeholder?: string; numeric?: boolean; maxLength?: number }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} placeholder={placeholder} placeholderTextColor="#71717a" keyboardType={numeric ? "numeric" : "default"} maxLength={maxLength} style={styles.input} /></View>;
}

const styles = createThemedStyles({
  blur: { flex: 1 }, backdrop: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(0,0,0,.42)" }, dialog: { borderRadius: 22, padding: 20, gap: 15, backgroundColor: "#1c1c1c", borderWidth: 1, borderColor: colors.border }, heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, kicker: { color: colors.accent, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" }, title: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 4 }, row: { flexDirection: "row", gap: 10 }, topRow: { zIndex: 20, elevation: 20 }, lowerRow: { zIndex: 1 }, field: { flex: 1 }, label: { color: "#d4d4d8", fontSize: 12, fontWeight: "600", marginBottom: 7, textTransform: "capitalize" }, input: { height: 44, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: "#151515", borderWidth: 1, borderColor: "#3f3f46" }, selectWrap: { flex: 1, zIndex: 30, elevation: 30 }, select: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, paddingHorizontal: 12, backgroundColor: "#303030", borderWidth: 1, borderColor: "transparent" }, disabled: { opacity: 0.5 }, selectText: { color: colors.text, fontSize: 13 }, menu: { position: "absolute", top: 66, left: 0, right: 0, overflow: "hidden", borderRadius: 11, backgroundColor: "#292929", borderWidth: 1, borderColor: "#3f3f46", zIndex: 50, elevation: 50, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }, optionActive: { backgroundColor: "#f4f4f5" }, optionText: { color: "#d4d4d8", fontSize: 13 }, optionTextActive: { color: "#171717", fontWeight: "800" }, helper: { marginTop: -7, color: colors.subdued, fontSize: 11 }, error: { color: "#fca5a5", fontSize: 12 }, actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 20, marginTop: 4 }, cancel: { color: "#e4e4e7", fontWeight: "700" }, save: { minWidth: 118, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.accent }, saveText: { color: colors.accentDeep, fontWeight: "600" },
});
