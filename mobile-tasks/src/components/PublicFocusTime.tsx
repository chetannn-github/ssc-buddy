import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { focusDayKey, formatFocusTime } from "../../../shared/study-focus";

export function PublicFocusTime({ uid, username }: { uid: string; username: string }) {
  const [focus, setFocus] = useState<{ days: Record<string, number>; timeZone: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setFocus(null);
    return controller.watchPublicStudyFocus(getFirebaseFirestore(), uid, username, setFocus, () => setFocus(null));
  }, [uid, username]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 9, padding: 15, borderRadius: 18, backgroundColor: "#1b1b1b", marginTop: 12 }}>
    <MaterialCommunityIcons name="clock-outline" size={18} color="#999" /><Text style={{ color: "#ddd", fontSize: 13 }}>Today’s focus</Text>
    <Text style={{ marginLeft: "auto", color: "#eee", fontSize: 13, fontWeight: "600" }}>{focus ? formatFocusTime(focus.days[focusDayKey(now, focus.timeZone)] ?? 0) : "—"}</Text>
  </View>;
}
