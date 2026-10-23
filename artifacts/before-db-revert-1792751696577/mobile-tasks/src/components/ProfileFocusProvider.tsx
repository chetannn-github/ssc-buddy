import { createContext, useContext, type ReactNode } from "react";
import { useProfileFocusData } from "../../../shared/use-profile-focus";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";

const ProfileFocusContext = createContext<ReturnType<typeof useProfileFocusData> | null>(null);

/** Keep the signed-in account's focus data live across tab unmounts. */
export function ProfileFocusProvider({ uid, children }: { uid: string | undefined; children: ReactNode }) {
  const focus = useProfileFocusData(getFirebaseFirestore, controller, uid, undefined, false, () => true);
  return <ProfileFocusContext.Provider value={focus}>{children}</ProfileFocusContext.Provider>;
}

export function useOwnProfileFocusData(uid: string | undefined) {
  const focus = useContext(ProfileFocusContext);
  return uid && focus?.uid === uid ? focus : null;
}
