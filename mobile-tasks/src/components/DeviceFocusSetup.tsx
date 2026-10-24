import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { deviceFocusStatus, openDeviceUsageSettings, openDeviceOverlaySettings, supportsDeviceFocus } from "../lib/native-focus-lock";

export function DeviceFocusSetup() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [usageAccess, setUsageAccess] = useState(false);
  const [overlayAccess, setOverlayAccess] = useState(false);
  const [opening, setOpening] = useState<"usage" | "overlay" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supportsDeviceFocus) return;
    let disposed = false;
    const refresh = () => { void deviceFocusStatus().then(value => {
      if (disposed) return;
      setEnabled(value.enabled);
      setUsageAccess("usageAccess" in value && value.usageAccess === true);
      setOverlayAccess("overlayAccess" in value && value.overlayAccess === true);
      setError("error" in value && value.error ? "App blocking needs attention." : "");
    }).catch(() => { if (!disposed) setError("Could not check app blocking access."); }); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { disposed = true; listener.remove(); clearInterval(timer); };
  }, []);
  if (!supportsDeviceFocus || (enabled && !error)) return null;
  const checking = enabled === null && !error;
  return <View style={styles.card}>
    {[
      { id: "usage" as const, label: "Usage access", granted: usageAccess, icon: "cellphone-check" as const, open: openDeviceUsageSettings },
      { id: "overlay" as const, label: "Display over other apps", granted: overlayAccess, icon: "layers-outline" as const, open: openDeviceOverlaySettings },
    ].map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled: opening !== null || checking || item.granted, busy: opening === item.id || checking }} disabled={opening !== null || checking || item.granted} style={styles.row} onPress={() => {
        if (opening !== null) return;
        setOpening(item.id); setError("");
        void item.open().catch(() => setError("Could not open permission settings.")).finally(() => setOpening(current => current === item.id ? null : current));
      }}>
        <MaterialCommunityIcons name={item.icon} size={23} color="#f5f5f5" />
        <View style={styles.copy}><Text style={styles.title}>{item.label}</Text></View>
        {opening === item.id || checking ? <ActivityIndicator size="small" color="#f5f5f5" /> : item.granted ? <MaterialCommunityIcons name="check" size={20} color="#86efac" /> : <Text style={[styles.action, { color: "#f5f5f5" }]}>Allow</Text>}
      </Pressable>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginVertical: 8, borderRadius: 14, backgroundColor: "#191919", overflow: "hidden" },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  copy: { flex: 1, gap: 2 },
  title: { color: "#f5f5f5", fontSize: 13, fontWeight: "600" },
  subtitle: { color: "#929292", fontSize: 11 },
  action: { fontSize: 12, fontWeight: "600" },
  error: { color: "#ff8495", fontSize: 11, paddingHorizontal: 12, paddingBottom: 10 },
});
