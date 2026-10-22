import { Text, View } from "react-native";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";

export function DailyFocusReward({ uid, date }: { uid: string | undefined; date: string }) {
  const focus = useProfileFocusData(getFirebaseFirestore, controller, uid, undefined, false, day => day === date);
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
    <Text style={{ color: "#a1a1aa", fontSize: 12 }}>Focus time</Text><Text style={{ color: "#eee", fontSize: 12, fontWeight: "600" }}>{focus.text}</Text><Text style={{ marginLeft: "auto", color: "#86efac", fontSize: 12, fontWeight: "600" }}>+{focus.points} pts</Text>
  </View>;
}
