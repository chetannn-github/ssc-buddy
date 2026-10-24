import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { deviceFocusStatus, openDeviceUsageSettings, openDeviceOverlaySettings, openDeviceNotificationSettings, openDeviceAdminSettings, supportsDeviceFocus } from "../lib/native-focus-lock";

export function DeviceFocusSetup() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [usageAccess, setUsageAccess] = useState(false);
  const [overlayAccess, setOverlayAccess] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [adminSupported, setAdminSupported] = useState(false);
  const [adminAccess, setAdminAccess] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [opening, setOpening] = useState<"usage" | "overlay" | "notifications" | "admin" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supportsDeviceFocus) return;
    let disposed = false;
    const refresh = () => { void deviceFocusStatus().then(value => {
      if (disposed) return;
      setEnabled(value.enabled);
      setUsageAccess("usageAccess" in value && value.usageAccess === true);
      setOverlayAccess("overlayAccess" in value && value.overlayAccess === true);
      setNotificationSupported("notificationSilenceSupported" in value && value.notificationSilenceSupported === true);
      setNotificationAccess("notificationAccess" in value && value.notificationAccess === true);
      setNotificationError("notificationError" in value ? value.notificationError || "" : "");
      setAdminSupported("adminSupported" in value && value.adminSupported === true);
      setAdminAccess("adminAccess" in value && value.adminAccess === true);
      setAdminError("adminError" in value ? value.adminError || "" : "");
      setSessionActive("sessionActive" in value && value.sessionActive === true);
      setError("error" in value && value.error ? "App blocking needs attention." : "");
    }).catch(() => { if (!disposed) setError("Could not check app blocking access."); }); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { disposed = true; listener.remove(); clearInterval(timer); };
  }, []);
  const showAdmin = adminSupported && !adminAccess && !sessionActive;
  if (!supportsDeviceFocus || (enabled && !error && (!notificationSupported || notificationAccess) && !notificationError && !showAdmin && !adminError)) return null;
  const checking = enabled === null && !error;
  return <View style={styles.card}>
    {[
      { id: "usage" as const, label: "Usage access", granted: usageAccess, icon: "cellphone-check" as const, open: openDeviceUsageSettings },
      { id: "overlay" as const, label: "Display over other apps", granted: overlayAccess, icon: "layers-outline" as const, open: openDeviceOverlaySettings },
      ...(notificationSupported ? [{ id: "notifications" as const, label: "Silent notifications", granted: notificationAccess, icon: "bell-sleep-outline" as const, open: openDeviceNotificationSettings }] : []),
      ...(showAdmin ? [{ id: "admin" as const, label: "Uninstall protection", granted: false, icon: "shield-lock-outline" as const, open: openDeviceAdminSettings }] : []),
    ].filter(item => !item.granted).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ disabled: opening !== null || checking || item.granted, busy: opening === item.id || checking }} disabled={opening !== null || checking || item.granted} style={styles.row} onPress={() => {
        if (opening !== null) return;
        setOpening(item.id); setError("");
        void item.open().catch(() => setError("Could not open permission settings.")).finally(() => setOpening(current => current === item.id ? null : current));
      }}>
        <MaterialCommunityIcons name={item.icon} size={23} color="#f5f5f5" />
        <View style={styles.copy}><Text style={styles.title}>{item.label}</Text>{item.id === "admin" && <Text style={styles.subtitle}>Optional · released after focus</Text>}</View>
        {opening === item.id || checking ? <ActivityIndicator size="small" color="#f5f5f5" /> : item.granted ? <MaterialCommunityIcons name="check" size={20} color="#86efac" /> : <Text style={[styles.action, { color: "#f5f5f5" }]}>Allow</Text>}
      </Pressable>)}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notificationError && <Text accessibilityRole="alert" style={styles.error}>{notificationError}</Text>}
    {!!adminError && <Text accessibilityRole="alert" style={styles.error}>{adminError}</Text>}
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
