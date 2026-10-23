import { useProfileFocusData } from "./use-profile-focus";
import * as reader from "./study-lock";
import type { Firestore } from "firebase/firestore";

export function FocusRewardRow({ uid, date, getDatabase, focusReader = reader }: { uid: string | undefined; date: string; getDatabase: () => Firestore; focusReader?: Parameters<typeof useProfileFocusData>[1] }) {
  const focus = useProfileFocusData(getDatabase, focusReader, uid, undefined, false, day => day === date);
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", fontSize: 12, color: "#a1a1aa" }}>
    <span>Focus time</span><strong style={{ color: "#eee", fontWeight: 600 }}>{focus.text}</strong><span style={{ marginLeft: "auto", color: "#86efac", fontWeight: 600 }}>+{focus.points} pts</span>
  </div>;
}
