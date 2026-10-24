import { useProfileFocusData } from "./use-profile-focus";
import * as reader from "./study-lock";
import type { Firestore } from "firebase/firestore";
import { SlotTime } from "./SlotTime";
import "./study-lock.css";

export function FocusRewardRow({ uid, date, getDatabase, compact = false }: { uid: string | undefined; date: string; getDatabase: () => Firestore; compact?: boolean }) {
  const focus = useProfileFocusData(getDatabase, reader, uid, undefined, false, day => day === date);
  return <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 12, padding: compact ? "9px 10px" : "12px 16px", minHeight: compact ? 48 : 58, fontSize: 12, color: "#a1a1aa" }}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M10 2h4M12 2v3M18 5l1 1" /></svg>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: "#eee", fontSize: compact ? 12 : 14, fontWeight: 600 }}>Focus time</div><div style={{ marginTop: 3, fontSize: compact ? 10 : 12 }}><SlotTime value={focus.text} /></div></div>
    <span style={{ color: "#86efac", fontSize: 11, fontWeight: 600, flexShrink: 0 }}><SlotTime value={`+${focus.points} pts`} /></span>
  </div>;
}
