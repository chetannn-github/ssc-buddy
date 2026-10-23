import { Text, View } from "react-native";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useOwnProfileFocusData } from "./ProfileFocusProvider";
import { selectProfileFocusRange } from "../../../shared/profile-focus-range";

export function DailyFocusReward({ uid, date }: { uid: string | undefined; date: string }) {
  const shared = useOwnProfileFocusData(uid);
  const local = useProfileFocusData(getFirebaseFirestore, controller, shared ? undefined : uid, undefined, false, day => day === date);
  const focus = shared ? selectProfileFocusRange(shared, day => day === date) : local;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
    <Text style={{ color: "#a1a1aa", fontSize: 12 }}>Focus time</Text><Text style={{ color: "#eee", fontSize: 12, fontWeight: "600" }}>{focus.text}</Text><Text style={{ marginLeft: "auto", color: "#86efac", fontSize: 12, fontWeight: "600" }}>{focus.ready ? `+${focus.points} pts` : "—"}</Text>
  </View>;
}
