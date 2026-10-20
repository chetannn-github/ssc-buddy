import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "../lib/firebase";
import { HABIT_COLORS, normalizeHabit, type Habit } from "../domain/habits";
import {
  bindHabitWidget,
  cacheWidgetHabits,
  habitWidgetView,
  pendingHabitWidget,
} from "./habit-widget-store";
export function HabitWidgetConfiguration(props: WidgetConfigurationScreenProps) {
  const [habits, setHabits] = useState<Habit[]>([]),
    [uid, setUid] = useState(""),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      revision = 0,
      stop = () => {};
    const authStop = onAuthStateChanged(getFirebaseAuth(), (user) => {
      const current = ++revision;
      stop();
      setUid(user?.uid ?? "");
      setHabits([]);
      setSelected("");
      setLoading(!!user);
      if (!user) return;
      void pendingHabitWidget(user.uid).then((p) => {
        if (alive && current === revision && p) setSelected(p.habitId);
      });
      stop = onSnapshot(
        collection(getFirebaseFirestore(), "users", user.uid, "habits"),
        (snapshot) => {
          if (!alive || current !== revision) return;
          const items = snapshot.docs
            .map((d) => normalizeHabit(d.id, d.data()))
            .filter((h): h is Habit => !!h);
          setHabits(items);
          setSelected((prev) => (items.some((h) => h.id === prev) ? prev : (items[0]?.id ?? "")));
          setLoading(false);
          setError("");
        },
        () => {
          if (alive && current === revision) {
            setLoading(false);
            setError("Could not load habits. Check your connection.");
          }
        },
      );
    });
    return () => {
      alive = false;
      revision++;
      stop();
      authStop();
    };
  }, []);
  const add = async () => {
    if (busy || !uid || !selected) return;
    setBusy(true);
    setError("");
    try {
      if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("Sign in again");
      await cacheWidgetHabits(uid, habits);
      await bindHabitWidget(props.widgetInfo.widgetId, uid, selected);
      props.renderWidget(await habitWidgetView(props.widgetInfo.widgetId, uid, "", false));
      props.setResult("ok");
    } catch {
      setError("Could not add widget. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", backgroundColor: "#000" }}>
      <StatusBar hidden />
      <Text style={{ color: "white", fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
        Add habit widget
      </Text>
      <Text style={{ color: "#999", fontSize: 13, marginBottom: 14 }}>
        Choose a habit for this widget.
      </Text>
      {loading ? (
        <ActivityIndicator color="#ffe000" />
      ) : !uid ? (
        <Text style={{ color: "#999" }}>Sign in to SSC Buddy first.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 400 }}>
          {habits.map((h) => (
            <Pressable
              key={h.id}
              disabled={busy}
              onPress={() => setSelected(h.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected === h.id }}
              style={{
                padding: 14,
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected === h.id ? HABIT_COLORS[h.color] : "#333",
                backgroundColor: "#141414",
              }}
            >
              <Text style={{ color: HABIT_COLORS[h.color], fontSize: 15, fontWeight: "700" }}>
                {h.name}
              </Text>
            </Pressable>
          ))}
          {!habits.length && (
            <Text style={{ color: "#999" }}>Create a habit in the app first.</Text>
          )}
        </ScrollView>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: "#fca5a5", marginTop: 12 }}>
          {error}
        </Text>
      )}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 18 }}>
        <Pressable
          disabled={busy}
          onPress={() => props.setResult("cancel")}
          style={{ padding: 12 }}
        >
          <Text style={{ color: "white" }}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={busy || loading || !selected}
          onPress={() => void add()}
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#ffe000",
            opacity: busy || !selected ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "black", fontWeight: "700" }}>
            {busy ? "Adding…" : "Add widget"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
