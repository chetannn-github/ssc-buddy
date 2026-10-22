import { useEffect, useState } from "react";
import { Image, Modal, Pressable, StatusBar, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { User } from "firebase/auth";
import type { StudySession } from "../../../shared/study-controller";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useAppAccent } from "../theme";
import { launchImages } from "../lib/launch-images";
import { QuickRecallScreen } from "../screens/QuickRecallScreen";
import { SlotTime } from "./SlotTime";
import { AccentBackdrop } from "./AccentBackdrop";

export function FocusSessionGate({ user }: { user: User | null }) {
  const accent = useAppAccent();
  const [session, setSession] = useState<StudySession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [recall, setRecall] = useState(false);
  const [image] = useState(() => launchImages[Math.floor(Math.random() * launchImages.length)]);
  useEffect(() => {
    setSession(null);
    if (!user) return;
    return controller.watchStudyControl(getFirebaseFirestore(), user.uid, value => setSession(value?.session ?? null), () => {});
  }, [user?.uid]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = !!session && session.endsAt > now;
  useEffect(() => { if (!active) setRecall(false); }, [active]);
  useEffect(() => {
    if (!user || !session) return;
    void controller.recordStudyFocus(getFirebaseFirestore(), user.uid, session).catch(() => {});
  }, [user?.uid, session?.id, Math.floor(now / 60000), active]);
  const seconds = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <Modal visible={active} animationType="none" statusBarTranslucent navigationBarTranslucent onShow={() => StatusBar.setHidden(true, "none")} onRequestClose={() => { if (recall) setRecall(false); }}>
    <StatusBar hidden animated={false} />
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <AccentBackdrop />
      {recall ? <View style={{ flex: 1, paddingTop: 32 }}>
        <QuickRecallScreen user={user} onClose={() => setRecall(false)} onGoProfile={() => setRecall(false)} />
      </View> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        <MaterialCommunityIcons name="lock-outline" size={32} color={accent} accessibilityLabel="Locked" />
        <SlotTime value={time} color={accent} size={64} />
        {image && <Image source={image} resizeMode="contain" accessibilityLabel="Motivational image" style={{ width: "100%", maxWidth: 340, height: "40%", borderRadius: 16 }} />}
        <Pressable accessibilityRole="button" onPress={() => setRecall(true)} style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, backgroundColor: "#222" }}><Text style={{ color: "#eee", fontWeight: "600" }}>Quick Recall</Text></Pressable>
      </View>}
    </View>
  </Modal>;
}
