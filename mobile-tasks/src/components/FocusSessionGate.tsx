import { useEffect, useState } from "react";
import { Image, Modal, Pressable, StatusBar, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import type { StudySession } from "../../../shared/study-controller";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useAppAccent } from "../theme";
import { launchImages } from "../lib/launch-images";
import { PracticeScreen } from "../screens/PracticeScreen";
import { SlotTime } from "./SlotTime";
import { AccentBackdrop } from "./AccentBackdrop";
import { DeviceFocusSetup } from "./DeviceFocusSetup";
import { consumeFocusRecall, syncDeviceFocus } from "../lib/native-focus-lock";

export function FocusSessionGate({ user }: { user: User | null }) {
  const accent = useAppAccent();
  const [session, setSession] = useState<StudySession | null>(null);
  const [controlReady, setControlReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [practice, setPractice] = useState(false);
  const [imageIndex, setImageIndex] = useState(() => Math.floor(Math.random() * launchImages.length));
  const image = launchImages[imageIndex];
  useEffect(() => {
    setSession(null);
    setControlReady(false);
    if (!user) { void syncDeviceFocus("", 0, accent).catch(() => {}); return; }
    return controller.watchStudyControl(getFirebaseFirestore(), user.uid, value => { setSession(value?.session ?? null); setControlReady(true); }, () => {});
  }, [user?.uid]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = !!session && session.endsAt > now;
  useEffect(() => {
    if (!controlReady) return;
    void syncDeviceFocus(session?.id ?? "", session?.endsAt ?? 0, accent).catch(() => {});
  }, [controlReady, session?.id, session?.endsAt, accent]);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    const check = () => { void consumeFocusRecall().then(requested => { if (!disposed && requested) setPractice(true); }).catch(() => {}); };
    check();
    const timer = setInterval(check, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [active]);
  useEffect(() => { if (!active) setPractice(false); }, [active]);
  useEffect(() => {
    if (!active || launchImages.length < 2) return;
    const rotate = () => setImageIndex(current => (current + 1) % launchImages.length);
    const untilNextMinute = 60_000 - (Date.now() % 60_000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      rotate();
      interval = setInterval(rotate, 60_000);
    }, untilNextMinute);
    return () => { clearTimeout(first); if (interval) clearInterval(interval); };
  }, [active]);
  useEffect(() => {
    if (!user || !session) return;
    void controller.recordStudyFocus(getFirebaseFirestore(), user.uid, session).catch(() => {});
  }, [user?.uid, session?.id, Math.floor(now / 60000), active]);
  const seconds = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <Modal visible={active} animationType="none" statusBarTranslucent navigationBarTranslucent onShow={() => StatusBar.setHidden(true, "none")} onRequestClose={() => { if (practice) setPractice(false); }}>
    <StatusBar hidden animated={false} />
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <AccentBackdrop />
      {practice ? <View style={{ flex: 1, paddingTop: 32 }}>
        <PracticeScreen user={user} onOpenQuickRecall={() => undefined} focusLocked />
      </View> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        <MaterialCommunityIcons name="lock-outline" size={32} color={accent} accessibilityLabel="Locked" />
        {image && <Image source={image} resizeMode="contain" accessibilityLabel="Motivational image" style={{ width: "100%", maxWidth: 340, height: "42%", borderRadius: 16 }} />}
        <SlotTime value={time} color={accent} size={64} />
        <Pressable accessibilityRole="button" onPress={() => setPractice(true)} style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, backgroundColor: "#222" }}><Text style={{ color: "#eee", fontWeight: "600" }}>Practice session</Text></Pressable>
        <DeviceFocusSetup />
      </View>}
    </View>
  </Modal>;
}
