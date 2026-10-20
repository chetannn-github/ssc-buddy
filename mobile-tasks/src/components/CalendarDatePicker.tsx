import { createThemedStyles } from "../theme";
import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { timerInputFields } from "../domain/date-timers";
import { colors } from "../theme";

export function CalendarDatePicker({ value, onChange, disabled = false, onOpen }: { value: string; onChange: (date: string) => void; disabled?: boolean; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const selected = new Date(`${value}T12:00:00`);
  const valid = Number.isFinite(selected.getTime());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1).getDay();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const today = timerInputFields(new Date().toISOString()).date;
  const move = (amount: number) => setMonth(new Date(year, monthIndex + amount, 1));
  const arrow = (direction: "chevron-left" | "chevron-right", label: string, amount: number) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => move(amount)} style={s.arrow}><MaterialCommunityIcons name={direction} size={23} color={colors.text} /></Pressable>;
  return <View style={{ minWidth: 0 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose date" accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { Keyboard.dismiss(); onOpen?.(); setMonth(valid ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date()); setOpen(true); }} style={s.field}>
      <Text numberOfLines={1} style={s.value}>{valid ? selected.toLocaleDateString(undefined, { dateStyle: "medium" }) : "Choose date"}</Text><MaterialCommunityIcons name="calendar-month-outline" size={19} color={colors.accent} />
    </Pressable>
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
        <Pressable accessibilityViewIsModal style={s.dialog} onPress={() => undefined}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={s.headingRow}><Text style={s.heading}>Choose date</Text><Pressable accessibilityRole="button" accessibilityLabel="Close calendar" style={s.arrow} onPress={() => setOpen(false)}><MaterialCommunityIcons name="close" size={21} color={colors.muted} /></Pressable></View>
            <View style={s.navigation}>{arrow("chevron-left", "Previous year", -12)}<Text accessibilityLiveRegion="polite" style={s.year}>{year}</Text>{arrow("chevron-right", "Next year", 12)}</View>
            <View style={s.navigation}>{arrow("chevron-left", "Previous month", -1)}<Text accessibilityLiveRegion="polite" style={s.month}>{month.toLocaleDateString(undefined, { month: "long" })}</Text>{arrow("chevron-right", "Next month", 1)}</View>
            <View style={s.grid}>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <View key={day} style={s.weekday}><Text style={s.weekdayText}>{day}</Text></View>)}
              {Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, index) => {
                const day = index - first + 1;
                if (day < 1 || day > count) return <View key={index} style={s.cell} />;
                const date = new Date(year, monthIndex, day, 12);
                const key = timerInputFields(date.toISOString()).date;
                const active = key === value;
                return <View key={index} style={s.cell}><Pressable accessibilityRole="button" accessibilityLabel={date.toLocaleDateString(undefined, { dateStyle: "full" })} accessibilityState={{ selected: active }} onPress={() => { onChange(key); setOpen(false); }} style={[s.day, key === today && s.today, active && s.selected]}><Text style={[s.dayText, active && s.selectedText]}>{day}</Text></Pressable></View>;
              })}
            </View>
            <View style={s.footer}><Pressable accessibilityRole="button" style={s.footerButton} onPress={() => { onChange(today); setOpen(false); }}><Text style={s.todayText}>Today</Text></Pressable><Pressable accessibilityRole="button" style={s.footerButton} onPress={() => setOpen(false)}><Text style={s.cancelText}>Cancel</Text></Pressable></View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}
const s = createThemedStyles({
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#404040", backgroundColor: "#151515" },
  value: { color: colors.text, fontSize: 14, flex: 1 },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,.78)" },
  dialog: { width: "100%", maxWidth: 350, maxHeight: "90%", borderRadius: 22, padding: 14, backgroundColor: "#1b1b1b", borderWidth: 1, borderColor: "#383838" },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 6 }, heading: { color: colors.text, fontSize: 18, fontWeight: "800" },
  navigation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, arrow: { padding: 10 }, year: { color: colors.muted, fontSize: 13, fontWeight: "600" }, month: { color: colors.text, fontSize: 16, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285714%", alignItems: "center", paddingVertical: 8 }, weekdayText: { color: colors.muted, fontSize: 11 },
  cell: { width: "14.285714%", aspectRatio: 1, padding: 2 }, day: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10 }, dayText: { color: colors.text, fontSize: 14 },
  today: { borderWidth: 1, borderColor: "#426eaa" }, selected: { backgroundColor: colors.accent, borderWidth: 0 }, selectedText: { color: colors.accentDeep, fontWeight: "800" },
  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, footerButton: { paddingHorizontal: 14, paddingVertical: 12 }, todayText: { color: colors.accent, fontWeight: "700" }, cancelText: { color: colors.muted, fontWeight: "700" },
});
