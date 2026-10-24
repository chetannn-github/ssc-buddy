import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DeviceFocusSetup } from "./DeviceFocusSetup";
import { deviceFocusStatus, supportsDeviceFocus } from "../lib/native-focus-lock";
import { hasRequiredFocusAccess } from "../domain/focus-permissions";
import { colors } from "../theme";

/** UI-only gate; native/cloud schedule synchronization lives outside this boundary. */
export function DevicePermissionGate({ children }: { children: ReactNode }) {
  const android = Platform.OS === "android";
  const [allowed, setAllowed] = useState(!android);
  const [unlocked, setUnlocked] = useState(!android);
  const [checking, setChecking] = useState(android);
  const [error, setError] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!android) return;
    let disposed = false;
    let generation = 0;
    const refresh = async (foreground = false) => {
      const current = ++generation;
      if (foreground) { setAllowed(false); setChecking(true); }
      if (!supportsDeviceFocus) {
        setAllowed(false); setChecking(false); setError("Install the latest Android build to complete setup.");
        return;
      }
      try {
        const status = await deviceFocusStatus();
        if (disposed || current !== generation) return;
        const ready = hasRequiredFocusAccess(status);
        setAllowed(ready);
        if (ready) setUnlocked(true);
        setSessionActive("sessionActive" in status && status.sessionActive === true);
        setError(!("adminAccess" in status) ? "Install the latest Android build to complete setup." : "");
      } catch {
        if (!disposed && current === generation) { setAllowed(false); setError("Could not check permissions. Try again."); }
      } finally { if (!disposed && current === generation) setChecking(false); }
    };
    void refresh(true);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(true); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 3000);
    return () => { disposed = true; generation++; clearInterval(timer); subscription.remove(); };
  }, [android, attempt]);
  if (!android) return <>{children}</>;
  return <>
    {/* Preserve screen/test state when returning from Settings; only initial setup delays mounting. */}
    {unlocked && children}
    <Modal visible={!allowed} animationType="fade" statusBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
      <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.icon}><MaterialCommunityIcons name="shield-check-outline" size={32} color="#f9fcf5" /></View>
          <Text accessibilityRole="header" style={s.title}>Set up your app</Text>
          <Text style={s.copy}>Allow these permissions to continue.</Text>
          {checking && <ActivityIndicator accessibilityLabel="Checking permissions" style={s.loading} color="#f9fcf5" />}
          {!allowed && supportsDeviceFocus && <DeviceFocusSetup required />}
          {sessionActive && <Text style={s.copy}>Permission changes may be blocked until your current focus session ends.</Text>}
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={checking} style={[s.button, checking && { opacity: 0.5 }]} onPress={() => setAttempt(value => value + 1)}>
            <Text style={s.buttonText}>{checking ? "Checking…" : "Check permissions"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  icon: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#222", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { color: "#f9fcf5", fontSize: 28, fontWeight: "700" },
  copy: { color: "#999", fontSize: 13, lineHeight: 20 },
  loading: { alignSelf: "flex-start" },
  error: { color: "#ff8495", fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: "#f9fcf5", minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginTop: 10 },
  buttonText: { color: "#111", fontSize: 14, fontWeight: "700" },
});
