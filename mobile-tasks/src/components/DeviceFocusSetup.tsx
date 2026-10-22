import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { deviceFocusStatus, openDeviceFocusSettings, supportsDeviceFocus } from "../lib/native-focus-lock";
import { useAppAccent } from "../theme";

export function DeviceFocusSetup() {
  const accent = useAppAccent();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [connected, setConnected] = useState<boolean | undefined>();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supportsDeviceFocus) return;
    let disposed = false;
    const refresh = () => { void deviceFocusStatus().then(value => {
      if (disposed) return;
      setEnabled(value.enabled);
      setConnected("serviceConnected" in value ? value.serviceConnected : undefined);
      setError("error" in value && value.error ? "App blocking needs attention." : "");
    }).catch(() => { if (!disposed) setError("Could not check app blocking access."); }); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { disposed = true; listener.remove(); clearInterval(timer); };
  }, []);
  if (!supportsDeviceFocus || (enabled && connected !== false && !error)) return null;
  const checking = enabled === null && !error;
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel="Enable app blocking in Accessibility settings" disabled={opening || checking} style={styles.row} onPress={() => {
      setOpening(true);
      void openDeviceFocusSettings().catch(() => setError("Could not open Accessibility settings.")).finally(() => setOpening(false));
    }}>
      <MaterialCommunityIcons name="shield-lock-outline" size={23} color={accent} />
      <View style={styles.copy}>
        <Text style={styles.title}>App blocking</Text>
        <Text style={styles.subtitle}>{checking ? "Checking access…" : "Accessibility access"}</Text>
      </View>
      {opening || checking ? <ActivityIndicator size="small" color={accent} /> : <>
        <Text style={[styles.action, { color: accent }]}>{enabled ? "Reconnect" : "Enable"}</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={accent} />
      </>}
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginVertical: 12, borderRadius: 18, backgroundColor: "#191919", overflow: "hidden" },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  copy: { flex: 1, gap: 4 },
  title: { color: "#f5f5f5", fontSize: 14, fontWeight: "600" },
  subtitle: { color: "#929292", fontSize: 12 },
  action: { fontSize: 12, fontWeight: "600" },
  error: { color: "#ff8495", fontSize: 12, paddingHorizontal: 16, paddingBottom: 14 },
});
