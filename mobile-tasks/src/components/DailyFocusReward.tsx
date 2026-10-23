import { Text, View } from "react-native";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { SlotTime } from "./SlotTime";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export function DailyFocusReward({ uid, date }: { uid: string | undefined; date: string }) {
  const focus = useProfileFocusData(getFirebaseFirestore, controller, uid, undefined, false, day => day === date);
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#292929" }}>
    <MaterialCommunityIcons name="timer-outline" size={24} color="#a1a1aa" />
    <View style={{ flex: 1, alignItems: "flex-start", gap: 3 }}>
      <Text style={{ color: "#eee", fontSize: 13, fontWeight: "700" }}>Focus time</Text>
      <SlotTime value={focus.text} color="#a1a1aa" size={11} weight="600" compact />
    </View>
    <SlotTime value={`+${focus.points} pts`} color="#86efac" size={10} weight="700" compact />
  </View>;
}
