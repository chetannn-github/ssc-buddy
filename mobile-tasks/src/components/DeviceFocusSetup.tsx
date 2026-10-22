import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { deviceFocusStatus, openDeviceFocusSettings, supportsDeviceFocus } from "../lib/native-focus-lock";

export function DeviceFocusSetup() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { void deviceFocusStatus().then(value => setEnabled(value.enabled)).catch(() => setError("Could not check device focus access.")); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => listener.remove();
  }, []);
  if (!supportsDeviceFocus) return null;
  return <View style={{ padding: 14, marginVertical: 12, borderRadius: 14, backgroundColor: "#171717", gap: 8, maxWidth: 340 }}>
    <Text style={{ color: "#eee", fontWeight: "600" }}>Device focus {enabled ? "· On" : ""}</Text>
    <Text style={{ color: "#999", fontSize: 11, lineHeight: 17 }}>During focus, SSC Buddy uses Accessibility access to detect opened apps and cover blocked apps. It does not read screen content. Allow up to 2 apps; Phone and Contacts are always available. You can disable access in Android settings.</Text>
    {!enabled && <Pressable accessibilityRole="button" onPress={() => { void openDeviceFocusSettings().catch(() => setError("Could not open Accessibility settings.")); }} style={{ paddingVertical: 10 }}><Text style={{ color: "#eee", fontWeight: "600" }}>Enable device focus in Accessibility</Text></Pressable>}
    {!!error && <Text style={{ color: "#ff8495", fontSize: 11 }}>{error}</Text>}
  </View>;
}
