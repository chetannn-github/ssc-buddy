import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { deviceFocusStatus, openDeviceFocusSettings, supportsDeviceFocus } from "../lib/native-focus-lock";

export function DeviceFocusSetup() {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState<boolean | undefined>();
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { void deviceFocusStatus().then(value => {
      setEnabled(value.enabled);
      setConnected("serviceConnected" in value ? value.serviceConnected : undefined);
      setError("error" in value && value.error ? "Android could not display the block screen. Turn device focus access off and on in Accessibility settings." : "");
    }).catch(() => setError("Could not check device focus access.")); };
    refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);
  if (!supportsDeviceFocus) return <View style={{ padding: 14, marginVertical: 12, borderRadius: 14, backgroundColor: "#171717" }}><Text style={{ color: "#eee", fontWeight: "600" }}>App blocking needs the latest Android build</Text><Text style={{ color: "#999", fontSize: 11, lineHeight: 17, marginTop: 8 }}>This installed version cannot show device block screens. Install the updated APK; device blocking is unavailable in Expo Go.</Text></View>;
  return <View style={{ padding: 14, marginVertical: 12, borderRadius: 14, backgroundColor: "#171717", gap: 8, maxWidth: 340 }}>
    <Text style={{ color: "#eee", fontWeight: "600" }}>Device focus {enabled ? "· On" : ""}</Text>
    <Text style={{ color: "#999", fontSize: 11, lineHeight: 17 }}>During focus, SSC Buddy uses Accessibility access to detect opened apps and cover blocked apps. It does not read screen content. Allow up to 2 apps; Phone and Contacts are always available. You can disable access in Android settings.</Text>
    {enabled && connected === false && <Text style={{ color: "#ff8495", fontSize: 11, lineHeight: 17 }}>Android has not connected the blocking service. Turn SSC Buddy Focus Lock off and on in Accessibility settings.</Text>}
    {(!enabled || connected === false || !!error) && <Pressable accessibilityRole="button" onPress={() => { void openDeviceFocusSettings().catch(() => setError("Could not open Accessibility settings.")); }} style={{ paddingVertical: 10 }}><Text style={{ color: "#eee", fontWeight: "600" }}>Open Accessibility settings</Text></Pressable>}
    {!!error && <Text style={{ color: "#ff8495", fontSize: 11 }}>{error}</Text>}
  </View>;
}
