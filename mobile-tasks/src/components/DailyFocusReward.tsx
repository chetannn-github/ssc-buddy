import { Text, View } from "react-native";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { SlotTime } from "./SlotTime";

export function DailyFocusReward({ uid, date }: { uid: string | undefined; date: string }) {
  const focus = useProfileFocusData(getFirebaseFirestore, controller, uid, undefined, false, day => day === date);
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
    <Text style={{ color: "#a1a1aa", fontSize: 12 }}>Focus time</Text><SlotTime value={focus.text} color="#eee" size={12} weight="600" compact /><View style={{ marginLeft: "auto" }}><SlotTime value={`+${focus.points} pts`} color="#86efac" size={12} weight="600" compact /></View>
  </View>;
}
