import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "../lib/firebase";
import { TIMER_COLORS, type DateTimer } from "../domain/date-timers";
import { bindTimerWidget, pendingTimerWidget, readWidgetTimers, timerWidgetView } from "./timer-widget-store";

export function TimerWidgetConfiguration({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const [timers, setTimers] = useState<DateTimer[]>([]);
  const [uid, setUid] = useState("");
  const [selected, setSelected] = useState("");
  const [color, setColor] = useState<string>(TIMER_COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const stop = onAuthStateChanged(getFirebaseAuth(), async user => {
      try {
        const items = await readWidgetTimers(user?.uid);
        const pending = user ? await pendingTimerWidget(user.uid) : null;
        if (!active) return;
        setUid(user?.uid ?? ""); setTimers(items); setSelected(pending?.timerId ?? items[0]?.id ?? "");
        if (pending) setColor(pending.color);
      } catch { if (active) setError("Could not load timers. Open the app and try again."); }
      finally { if (active) setLoading(false); }
    });
    return () => { active = false; stop(); };
  }, []);
  return <View style={{ flex: 1, padding: 24, paddingTop: 50, backgroundColor: "#101010" }}><Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 18 }}>Add timer widget</Text>
    {loading ? <ActivityIndicator color="#60a5fa" /> : <ScrollView>{timers.map((timer, index) => <Pressable key={timer.id} disabled={busy} onPress={() => { setSelected(timer.id); setColor(TIMER_COLORS[index % TIMER_COLORS.length]!); }} style={{ padding: 16, borderRadius: 12, marginBottom: 10, backgroundColor: timer.id === selected ? "#243550" : "#1b1b1b" }}><Text style={{ color: "#fff", fontSize: 15 }}>{timer.title}</Text><Text style={{ color: "#a1a1aa", marginTop: 5 }}>{new Date(timer.targetAt).toLocaleDateString()}</Text></Pressable>)}{!timers.length && <Text style={{ color: "#a1a1aa" }}>Open the app and sign in to select a timer.</Text>}</ScrollView>}
    {!!error && <Text style={{ color: "#fca5a5", marginVertical: 12 }}>{error}</Text>}
    <View style={{ flexDirection: "row", gap: 14, marginTop: 16 }}><Pressable disabled={busy} onPress={() => setResult("cancel")} style={{ padding: 14 }}><Text style={{ color: "#fff" }}>Cancel</Text></Pressable><Pressable disabled={busy || loading || !timers.some(timer => timer.id === selected)} style={{ padding: 14, backgroundColor: "#60a5fa", borderRadius: 12, opacity: busy || !selected ? 0.5 : 1 }} onPress={async () => {
      setBusy(true); setError("");
      try { await bindTimerWidget(widgetInfo.widgetId, uid, selected, color); renderWidget(await timerWidgetView(widgetInfo.widgetId, uid)); setResult("ok"); }
      catch { setError("Could not add widget. Try again."); setBusy(false); }
    }}><Text style={{ color: "#081a31", fontWeight: "700" }}>{busy ? "Adding…" : "Add widget"}</Text></Pressable></View>
  </View>;
}
