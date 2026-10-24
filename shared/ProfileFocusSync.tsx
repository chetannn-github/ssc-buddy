import { useEffect, useRef } from "react";
import type { Firestore } from "firebase/firestore";
import { watchProfileFocus, type ProfileFocusReader } from "./profile-focus-source";

export function ProfileFocusSync({ uid, getDatabase, reader, enabled = true }: { uid: string | undefined; getDatabase: () => Firestore; reader: ProfileFocusReader; enabled?: boolean }) {
  const activation = useRef({ uid, warmed: false });
  if (activation.current.uid !== uid) activation.current = { uid, warmed: false };
  if (enabled) activation.current.warmed = true;
  const activeUid = activation.current.warmed ? uid : undefined;
  useEffect(() => {
    if (!activeUid) return;
    try { return watchProfileFocus(getDatabase(), reader, activeUid, undefined, false, () => {}); }
    catch { /* Profile stays unready; a later mount can retry initialization. */ }
    return undefined;
  }, [activeUid, getDatabase, reader]);
  return null;
}
