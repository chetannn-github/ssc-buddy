import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LiquidSpillCard } from "../components/LiquidSpillCard";
import { TimerLiquidDial } from "../components/TimerLiquidDial";
import type { User } from "firebase/auth";
import { useDateTimers } from "../hooks/use-date-timers";
import { dateCountdown, timerDial, timerReferenceDays, TIMER_COLORS, makeDateTimer, timerInputFields, type DateTimer } from "../domain/date-timers";
import { reportVerticalScroll } from "../navigation/bottomNavigationVisibility";
import { colors } from "../theme";
import { cacheWidgetTimers, pinTimerWidget } from "../widgets/timer-widget-store";
import { CalendarDatePicker } from "../components/CalendarDatePicker";

export function TimersScreen({ user, widgetRequest = 0 }: { user: User | null; widgetRequest?: number }) {
  const { timers, loading, error, retry, save, remove } = useDateTimers(user?.uid);
  const [widgetPicker, setWidgetPicker] = useState(widgetRequest > 0);
  useEffect(() => { if (widgetRequest > 0) setWidgetPicker(true); }, [widgetRequest]);
  const [gridWidth, setGridWidth] = useState(0);
  const ringSize = gridWidth ? Math.min(136, Math.max(80, (gridWidth - 12) / 2 - 22)) : 112;
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState<DateTimer | "new" | null>(null);
  const [deleting, setDeleting] = useState<DateTimer | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => { setEditing(null); setDeleting(null); setFormError(""); setDeleteError(""); }, [user?.uid]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active") setNow(Date.now()); }, 1000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") setNow(Date.now()); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  const open = (timer?: DateTimer) => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const fields = timerInputFields(timer?.targetAt ?? tomorrow.toISOString());
    setTitle(timer?.title ?? ""); setDate(fields.date); setFormError(""); setEditing(timer ?? "new");
  };
  const submit = async () => {
    if (busy || !editing) return;
    try {
      const previous = editing === "new" ? undefined : editing;
      const timer = makeDateTimer(previous?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, title, date, previous);
      setBusy(true); setFormError(""); await save(timer); setEditing(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not save timer. Try again."); }
    finally { setBusy(false); }
  };
  const confirmDelete = async () => {
    if (busy || !deleting) return;
    setBusy(true); setDeleteError("");
    try { await remove(deleting.id); setDeleting(null); }
    catch { setDeleteError("Could not delete timer. Try again."); }
    finally { setBusy(false); }
  };
  const pin = async (timer: DateTimer, color: string) => {
    if (!user || busy) return;
    try { await cacheWidgetTimers(user.uid, timers); await pinTimerWidget(user.uid, timer.id, color); setWidgetPicker(false); }
    catch (error) { Alert.alert("Timer widget", error instanceof Error ? error.message : "Could not add widget. Try again."); }
  };
  const referenceDays = timerReferenceDays(timers, now);
  const timerColors = new Map([...timers].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((timer, index) => [timer.id, TIMER_COLORS[index % TIMER_COLORS.length]!]));
  const sorted = [...timers].sort((a, b) => Number(dateCountdown(a.targetAt, now).reached) - Number(dateCountdown(b.targetAt, now).reached) || Date.parse(a.targetAt) - Date.parse(b.targetAt));
  return <View style={s.page}>
    <View style={s.header}><View style={{ flex: 1 }}><Text style={s.eyebrow}>IMPORTANT DATES</Text><Text style={s.title}>Timers</Text></View><Pressable accessibilityRole="button" disabled={!user || busy} onPress={() => open()} style={s.add}><MaterialCommunityIcons name="plus" size={18} color="#081a31" /><Text style={s.addText}>Add timer</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} scrollEventThrottle={16} onScroll={(event) => reportVerticalScroll(event.nativeEvent.contentOffset.y)}>
      {!user ? <Text style={s.emptyCopy}>Sign in to save your important dates.</Text> : loading ? <ActivityIndicator style={{ marginTop: 50 }} color={colors.accent} /> : error ? <View style={s.empty}><Text style={s.error}>{error}</Text><Pressable style={s.add} onPress={retry}><Text style={s.addText}>Try again</Text></Pressable></View> : sorted.length ? <View style={s.cardGrid} onLayout={event => setGridWidth(event.nativeEvent.layout.width)}>{sorted.map((timer) => {
        const dial = timerDial(timer, now, referenceDays);
      const color = timerColors.get(timer.id)!;
        return <LiquidSpillCard key={timer.id} style={[s.card, { width: gridWidth ? (gridWidth - 12) / 2 : "48%" }]} onLongPress={() => void pin(timer, color)}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${timer.title}`} disabled={busy} onPress={() => open(timer)} style={s.cardEdit}><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.muted} /></Pressable>
          <TimerLiquidDial dial={dial} color={color} size={ringSize} onLongPress={() => void pin(timer, color)} />
          <Text style={s.cardName}>{timer.title}</Text>
          <Text style={s.cardDate}>{new Date(timer.targetAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</Text>
        </LiquidSpillCard>;
      })}</View> : <View style={s.empty}><MaterialCommunityIcons name="timer-sand" size={40} color="#93c5fd" /><Text style={s.emptyTitle}>Your next milestone starts here</Text><Text style={s.emptyCopy}>Add an important date to see your countdown.</Text><Pressable onPress={() => open()} style={[s.add, { marginTop: 12 }]}><MaterialCommunityIcons name="plus" size={18} color="#081a31" /><Text style={s.addText}>Add your first timer</Text></Pressable></View>}
    </ScrollView>
    <Modal transparent visible={editing !== null} animationType="fade" onRequestClose={() => { if (!busy) setEditing(null); }}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.backdrop}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ width: "100%", maxHeight: "100%" }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}><View accessibilityViewIsModal style={s.dialog}><View style={s.editHeader}><Text style={s.dialogTitle}>{editing === "new" ? "Add timer" : "Edit timer"}</Text>{editing && editing !== "new" && <Pressable accessibilityRole="button" accessibilityLabel="Delete timer" disabled={busy} onPress={() => { setDeleteError(""); setDeleting(editing); setEditing(null); }} style={s.editDelete}><MaterialCommunityIcons name="trash-can-outline" size={22} color="#fca5a5" /></Pressable>}</View><Text style={s.label}>NAME</Text><TextInput autoFocus editable={!busy} value={title} onChangeText={setTitle} maxLength={80} placeholder="SSC CGL exam" placeholderTextColor={colors.subdued} style={s.input} /><Text style={s.label}>DATE</Text><CalendarDatePicker value={date} onChange={setDate} disabled={busy} />{!!formError && <Text style={s.error}>{formError}</Text>}<View style={s.actions}><Pressable disabled={busy} onPress={() => setEditing(null)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable><Pressable disabled={busy} onPress={() => void submit()} style={s.save}>{busy ? <ActivityIndicator color="#082f49" /> : <Text style={s.saveText}>Save timer</Text>}</Pressable></View></View></ScrollView></KeyboardAvoidingView></Modal>
    <Modal transparent visible={deleting !== null} animationType="fade" onRequestClose={() => { if (!busy) setDeleting(null); }}>
      <Pressable style={s.deleteBackdrop} onPress={() => { if (!busy) setDeleting(null); }}>
        <Pressable accessibilityViewIsModal style={s.deleteDialog} onPress={() => undefined}>
          <View style={s.deleteHeader}>
            <View style={s.deleteIcon}><MaterialCommunityIcons name="trash-can-outline" size={21} color="#fda4af" /></View>
            <View style={s.deleteDetails}><Text style={s.deleteTitle}>Delete timer?</Text><Text style={s.deleteCopy}>“{deleting?.title}” will be permanently removed.</Text></View>
          </View>
          {!!deleteError && <Text accessibilityLiveRegion="polite" style={s.error}>{deleteError}</Text>}
          <View style={s.deleteActions}>
            <Pressable accessibilityRole="button" disabled={busy} style={[s.deleteCancel, busy && { opacity: 0.5 }]} onPress={() => setDeleting(null)}><Text style={s.deleteCancelText}>Keep timer</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={[s.deleteConfirm, busy && { opacity: 0.5 }]} onPress={() => void confirmDelete()}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.deleteConfirmText}>Delete</Text>}</Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal transparent visible={widgetPicker} animationType="fade" onRequestClose={() => setWidgetPicker(false)}><View style={s.backdrop}><View accessibilityViewIsModal style={s.dialog}><Text style={s.dialogTitle}>Add timer widget</Text><ScrollView style={{ maxHeight: 360, marginTop: 16 }}>{!user ? <Text style={s.emptyCopy}>Sign in to select a timer.</Text> : loading ? <ActivityIndicator color={colors.accent} /> : error ? <Text style={s.error}>{error}</Text> : !timers.length ? <Text style={s.emptyCopy}>Add a timer first, then select it here.</Text> : timers.map(timer => <Pressable key={timer.id} accessibilityRole="button" onPress={() => void pin(timer, timerColors.get(timer.id)!)} style={{ padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: "#242424" }}><Text style={{ color: colors.text, fontWeight: "700" }}>{timer.title}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{new Date(timer.targetAt).toLocaleDateString()}</Text></Pressable>)}</ScrollView><Pressable style={[s.cancel, { alignSelf: "flex-end", marginTop: 12 }]} onPress={() => setWidgetPicker(false)}><Text style={s.cancelText}>Close</Text></Pressable></View></View></Modal>
  </View>;
}

const s = StyleSheet.create({
  editHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  editDelete: { padding: 8, borderRadius: 10, backgroundColor: "#f43f5e14" },
  deleteBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26, backgroundColor: "rgba(0,0,0,.76)" },
  deleteDialog: { width: "100%", maxWidth: 370, borderRadius: 22, padding: 21, backgroundColor: "#1c1c1c", borderWidth: 1, borderColor: "#3a3a3a" },
  deleteIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(244,63,94,.14)", borderWidth: 1, borderColor: "rgba(253,164,175,.16)" },
  deleteHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  deleteDetails: { flex: 1, minWidth: 0 },
  deleteTitle: { color: "#fafafa", fontSize: 19, fontWeight: "800" },
  deleteCopy: { color: "#a1a1aa", fontSize: 13, lineHeight: 19, marginTop: 6 },
  deleteActions: { flexDirection: "row", gap: 9, marginTop: 21 },
  deleteCancel: { flex: 1, minHeight: 45, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#292929", borderWidth: 1, borderColor: "#414141" },
  deleteCancelText: { color: "#f4f4f5", fontSize: 13, fontWeight: "800" },
  deleteConfirm: { flex: 1, minHeight: 45, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#e11d48" },
  deleteConfirmText: { color: "#fff1f2", fontSize: 13, fontWeight: "800" },

  page: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }, eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, title: { color: colors.text, fontSize: 25, fontWeight: "800", marginTop: 4 }, add: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: "#60a5fa", backgroundColor: "#60a5fa" }, addText: { color: "#081a31", fontSize: 12, fontWeight: "700" }, content: { padding: 16, gap: 14, paddingBottom: 110 }, cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, card: { padding: 10, paddingTop: 22, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, cardName: { textAlign: "center", color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 4 }, cardDate: { textAlign: "center", color: colors.muted, fontSize: 10, marginTop: 4 }, cardEdit: { position: "absolute", right: 8, top: 8, zIndex: 2, padding: 10, borderRadius: 10 }, empty: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 40, gap: 10, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }, emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" }, emptyCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }, backdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.82)" }, dialog: { borderRadius: 20, padding: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, dialogTitle: { color: colors.text, fontSize: 20, fontWeight: "800" }, label: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 14, marginBottom: 6 }, input: { borderRadius: 10, borderWidth: 1, borderColor: "#404040", backgroundColor: "#151515", color: colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }, error: { color: "#fca5a5", fontSize: 12, marginTop: 8 }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 22 }, cancel: { padding: 12 }, cancelText: { color: colors.muted, fontWeight: "700" }, save: { minWidth: 110, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#93c5fd", padding: 12 }, saveText: { color: "#082f49", fontWeight: "800" },
});
