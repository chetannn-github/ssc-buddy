import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../lib/firebase";
import { makeDateTimer, normalizeDateTimer, TIMER_COLORS, timerInputFields, type DateTimer } from "../domain/date-timers";
import { CalendarDatePicker } from "../components/CalendarDatePicker";
import { bindTimerWidget, cacheWidgetTimers, pendingTimerWidget, pinTimerWidget, readWidgetTimers, timerWidgetView } from "./timer-widget-store";

export function TimerWidgetConfiguration(props: WidgetConfigurationScreenProps) {
  return <TimerWidgetSetup configuration={props} />;
}
export function TimerWidgetShortcut() { return <TimerWidgetSetup />; }

function TimerWidgetSetup({ configuration }: { configuration?: WidgetConfigurationScreenProps }) {
  const [timers, setTimers] = useState<DateTimer[]>([]);
  const [uid, setUid] = useState("");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => timerInputFields(new Date().toISOString()).date);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");
  const saved = useRef<DateTimer | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true, revision = 0;
    let stopTimers = () => {};
    const stopAuth = onAuthStateChanged(getFirebaseAuth(), user => {
      const current = ++revision;
      stopTimers(); setUid(user?.uid ?? ""); setTimers([]); setSelected(""); setLoading(Boolean(user)); saved.current = null;
      if (!user) return;
      let cloudLoaded = false;
      void Promise.all([readWidgetTimers(user.uid), pendingTimerWidget(user.uid)]).then(([items, pending]) => {
        if (!active || current !== revision || cloudLoaded) return;
        setTimers(items); setSelected(pending?.timerId ?? items[0]?.id ?? "");
      }).catch(() => {});
      stopTimers = onSnapshot(collection(getFirebaseFirestore(), "users", user.uid, "dateTimers"), snapshot => {
        if (!active || current !== revision) return;
        cloudLoaded = true;
        const items = snapshot.docs.map(item => normalizeDateTimer(item.id, item.data())).filter((item): item is DateTimer => item !== null).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        setTimers(items); setSelected(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? "");
        setLoading(false); setError("");
      }, () => { if (active && current === revision) { setLoading(false); setError("Could not refresh timers. Check your connection and try again."); } });
    });
    return () => { active = false; revision++; stopTimers(); stopAuth(); };
  }, []);
  const close = () => configuration ? configuration.setResult("cancel") : BackHandler.exitApp();
  const add = async () => {
    if (submitting.current || !uid) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      let items = timers;
      let timer = items.find(item => item.id === selected);
      if (mode === "new") {
        const previous = saved.current;
        timer = makeDateTimer(previous?.id ?? doc(collection(getFirebaseFirestore(), "users", uid, "dateTimers")).id, title, date, previous ?? undefined);
        await setDoc(doc(getFirebaseFirestore(), "users", uid, "dateTimers", timer.id), timer);
        saved.current = timer;
        items = [...items.filter(item => item.id !== timer!.id), timer].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        setTimers(items); setSelected(timer.id);
      }
      if (!timer) throw new Error("Select a timer first.");
      if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("Sign in again to add this widget.");
      const color = TIMER_COLORS[Math.max(0, items.findIndex(item => item.id === timer!.id)) % TIMER_COLORS.length]!;
      await cacheWidgetTimers(uid, items);
      if (configuration) {
        await bindTimerWidget(configuration.widgetInfo.widgetId, uid, timer.id, color);
        configuration.renderWidget(await timerWidgetView(configuration.widgetInfo.widgetId, uid));
        configuration.setResult("ok");
      } else {
        await pinTimerWidget(uid, timer.id, color);
        setRequested(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add widget. Try again."); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[s.backdrop, configuration && { backgroundColor: "#101010" }]}><View accessibilityViewIsModal style={s.dialog}>
    <Text style={s.heading}>Add timer widget</Text>
    {requested ? <><Text style={s.note}>Confirm Add on your home screen to place the widget.</Text><Pressable onPress={close} style={s.primary}><Text style={s.primaryText}>Done</Text></Pressable></> : <>
      <View style={s.tabs}>{(["existing", "new"] as const).map(value => <Pressable key={value} disabled={busy} onPress={() => { setMode(value); setError(""); }} style={[s.tab, mode === value && s.activeTab]}><Text style={s.text}>{value === "existing" ? "Existing timer" : "New timer"}</Text></Pressable>)}</View>
      {loading ? <ActivityIndicator color="#60a5fa" /> : !uid ? <Text style={s.note}>Sign in to SSC Buddy first, then use this shortcut.</Text> : <ScrollView keyboardShouldPersistTaps="handled" style={s.list}>
        {mode === "new" ? <><Text style={s.label}>NAME</Text><TextInput accessibilityLabel="Timer name" value={title} onChangeText={setTitle} editable={!busy} maxLength={80} placeholder="Timer name" placeholderTextColor="#71717a" style={s.input} /><Text style={s.label}>DATE</Text><CalendarDatePicker value={date} onChange={setDate} disabled={busy} /></> : timers.length ? timers.map(timer => <Pressable key={timer.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: timer.id === selected }} onPress={() => setSelected(timer.id)} style={[s.item, timer.id === selected && s.selected]}><Text style={s.text}>{timer.title}</Text><Text style={s.date}>{new Date(timer.targetAt).toLocaleDateString()}</Text></Pressable>) : <Text style={s.note}>No timers yet. Choose New timer to create one here.</Text>}
      </ScrollView>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.actions}><Pressable disabled={busy} onPress={close} style={s.cancel}><Text style={s.text}>Cancel</Text></Pressable><Pressable disabled={busy || loading || !uid || (mode === "existing" ? !selected : !title.trim())} onPress={() => void add()} style={[s.primary, (busy || loading || !uid || (mode === "existing" ? !selected : !title.trim())) && { opacity: .45 }]}><Text style={s.primaryText}>{busy ? "Adding…" : mode === "new" ? "Create & add" : "Add widget"}</Text></Pressable></View>
    </>}
  </View></KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "transparent" },
  dialog: { maxHeight: "90%", padding: 20, borderRadius: 22, borderWidth: 1, borderColor: "#383838", backgroundColor: "#1b1b1b" },
  heading: { color: "#fafafa", fontSize: 21, fontWeight: "800", marginBottom: 18 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 }, tab: { flex: 1, alignItems: "center", padding: 11, borderRadius: 10, backgroundColor: "#282828" }, activeTab: { backgroundColor: "#243b5b" },
  list: { flexGrow: 0 }, item: { padding: 13, borderRadius: 12, marginBottom: 8, backgroundColor: "#252525", borderWidth: 1, borderColor: "#353535" }, selected: { backgroundColor: "#243550", borderColor: "#60a5fa" },
  text: { color: "#fafafa", fontSize: 13 }, date: { color: "#a1a1aa", marginTop: 4, fontSize: 12 }, note: { color: "#a1a1aa", lineHeight: 21, marginBottom: 14 },
  label: { color: "#a1a1aa", fontSize: 10, fontWeight: "700", marginTop: 8, marginBottom: 7 }, input: { borderRadius: 10, borderWidth: 1, borderColor: "#404040", backgroundColor: "#151515", color: "#fafafa", padding: 12, marginBottom: 8 },
  error: { color: "#fca5a5", marginTop: 12 }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 }, cancel: { padding: 13 }, primary: { padding: 13, backgroundColor: "#60a5fa", borderRadius: 11, alignItems: "center" }, primaryText: { color: "#081a31", fontWeight: "800", fontSize: 13 },
});
