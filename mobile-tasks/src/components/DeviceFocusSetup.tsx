import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { deviceFocusStatus, openDeviceFocusSettings, supportsDeviceFocus, supportsFocusAdmin, requestFocusAdmin } from "../lib/native-focus-lock";

export function DeviceFocusSetup() {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState<boolean | undefined>();
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { void deviceFocusStatus().then(value => {
      setEnabled(value.enabled);
      setAdmin("adminEnabled" in value && value.adminEnabled === true);
      setConnected("serviceConnected" in value ? value.serviceConnected : undefined);
      setError("error" in value && value.error ? "App blocking needs attention." : "");
    }).catch(() => setError("Could not check device focus access.")); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);
  if (!supportsDeviceFocus) return null;
  return <View style={{ padding: 14, marginVertical: 12, borderRadius: 14, backgroundColor: "#171717", gap: 8, maxWidth: 340 }}>
    <Text style={{ color: "#eee", fontWeight: "600" }}>Device focus {enabled ? "· On" : ""}</Text>
    {enabled && connected === false && <Text style={{ color: "#ff8495", fontSize: 11 }}>Reconnect app blocking</Text>}
    {(!enabled || connected === false || !!error) && <Pressable accessibilityRole="button" onPress={() => { void openDeviceFocusSettings().catch(() => setError("Could not open Accessibility settings.")); }} style={{ paddingVertical: 10 }}><Text style={{ color: "#eee", fontWeight: "600" }}>Open Accessibility settings</Text></Pressable>}
    {!!error && <Text style={{ color: "#ff8495", fontSize: 11 }}>{error}</Text>}
    {supportsFocusAdmin && <View style={{ marginTop: 6, gap: 7 }}>
      <Text style={{ color: "#eee", fontWeight: "600" }}>Uninstall protection{admin ? " · On" : ""}</Text>
      {!admin && <Pressable accessibilityRole="button" onPress={() => { void requestFocusAdmin().catch(() => setError("Could not open Android admin approval.")); }} style={{ paddingVertical: 10 }}><Text style={{ color: "#eee", fontWeight: "600" }}>Enable uninstall protection</Text></Pressable>}
    </View>}
  </View>;
}
