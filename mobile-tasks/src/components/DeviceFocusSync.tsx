import { useEffect } from "react";
import { AppState } from "react-native";
import { Asset } from "expo-asset";
import type { User } from "firebase/auth";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useAppAccent } from "../theme";
import { launchImages } from "../lib/launch-images";
import { syncDeviceFocusState, readFocusBreaks, acknowledgeFocusBreak } from "../lib/native-focus-lock";
import type { StudySession } from "../../../shared/study-controller";

/** Keep Android enforcement connected on every app tab without covering SSC Buddy. */
export function DeviceFocusSync({ user }: { user: User | null }) {
  const accent = useAppAccent();
  useEffect(() => {
    let disposed = false, ready = !user, session: StudySession | null = null, image = "", syncingBreaks = false;
    const sync = () => { if (!disposed && ready) void syncDeviceFocusState(session, accent, image).catch(() => {}); };
    if (!user) { sync(); return; }
    const syncBreaks = async () => {
      if (disposed || syncingBreaks || !ready) return;
      syncingBreaks = true;
      try {
        let actions = await readFocusBreaks();
        while (!disposed && actions.length) {
          const action = actions[0]!;
          session = await controller.applyOverlayBreak(getFirebaseFirestore(), user.uid, action);
          await acknowledgeFocusBreak(action.id);
          actions = await readFocusBreaks();
        }
        sync();
      } catch { /* Durable local breaks retry when the app/network is available. */ }
      finally { syncingBreaks = false; }
    };
    const stop = controller.watchStudyControl(getFirebaseFirestore(), user.uid, value => { session = value?.session ?? null; ready = true; sync(); void syncBreaks(); }, () => { /* Preserve native restriction during network failures. */ });
    const asset = launchImages[0];
    if (asset) void Asset.fromModule(asset).downloadAsync().then(value => { image = value.localUri ?? ""; sync(); }).catch(() => {});
    const listener = AppState.addEventListener("change", state => { if (state === "active") { sync(); void syncBreaks(); } });
    const timer = setInterval(() => { void syncBreaks(); }, 2000);
    return () => { disposed = true; stop(); listener.remove(); clearInterval(timer); };
  }, [user?.uid, accent]);
  return null;
}
