import { useEffect } from "react";
import { AppState } from "react-native";
import { Asset } from "expo-asset";
import type { User } from "firebase/auth";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useAppAccent } from "../theme";
import { launchImages } from "../lib/launch-images";
import { syncDeviceFocusState, readFocusBreaks, acknowledgeFocusBreak, configureDeviceFocusImages } from "../lib/native-focus-lock";
import { avatarManifestUrl } from "../lib/media";
import type { StudySession } from "../../../shared/study-controller";

/** Keep Android enforcement connected on every app tab without covering SSC Buddy. */
export function DeviceFocusSync({ user }: { user: User | null }) {
  const accent = useAppAccent();
  useEffect(() => {
    let disposed = false, ready = !user, session: StudySession | null = null, image = "", syncingBreaks = false;
    const sync = () => { if (!disposed && ready) void syncDeviceFocusState(session, accent, image).catch(() => {}); };
    if (!user) { sync(); return; }
    let reconciledBreak = "", lastReconcileAttempt = 0;
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
        if (session?.breakUntil && Date.now() >= session.breakUntil && reconciledBreak !== `${session.id}:${session.breakUntil}` && Date.now() - lastReconcileAttempt >= 30000) {
          lastReconcileAttempt = Date.now();
          const key = `${session.id}:${session.breakUntil}`;
          await controller.reconcileStudySession(getFirebaseFirestore(), user.uid);
          reconciledBreak = key;
        }
        sync();
        if (!disposed && session) await controller.settleStudyFocus(getFirebaseFirestore(), user.uid, session);
      } catch { /* Durable local breaks retry when the app/network is available. */ }
      finally { syncingBreaks = false; }
    };
    const stop = controller.watchStudyControl(getFirebaseFirestore(), user.uid, value => { session = value?.session ?? null; ready = true; sync(); void syncBreaks(); }, () => { /* Preserve native restriction during network failures. */ });
    const asset = launchImages[0];
    if (asset) void Asset.fromModule(asset).downloadAsync().then(value => { image = value.localUri ?? ""; sync(); }).catch(() => {});
    void (async () => {
      const manifest = avatarManifestUrl();
      await configureDeviceFocusImages([], manifest);
      const local: string[] = [];
      for (const asset of launchImages) {
        if (disposed) return;
        const value = await Asset.fromModule(asset).downloadAsync().catch(() => null);
        if (value?.localUri) local.push(value.localUri);
      }
      if (!disposed) await configureDeviceFocusImages(local, manifest);
    })().catch(() => { /* Native service keeps its last cached avatar pool. */ });
    const listener = AppState.addEventListener("change", state => { if (state === "active") { sync(); void syncBreaks(); } });
    const timer = setInterval(() => { void syncBreaks(); }, 2000);
    return () => { disposed = true; stop(); listener.remove(); clearInterval(timer); };
  }, [user?.uid, accent]);
  return null;
}
