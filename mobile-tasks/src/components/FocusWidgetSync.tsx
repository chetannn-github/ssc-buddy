import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { User } from "firebase/auth";
import { controller } from "./StudyLock";
import { getFirebaseFirestore } from "../lib/firebase";
import { useAppAccent } from "../theme";
import type { StudySession } from "../../../shared/study-controller";
import { emptyFocusDay, focusDayKey, type FocusDay } from "../../../shared/study-focus";
import { focusTimerWidgetModel } from "../domain/focus-timer-widget";
import { saveFocusWidgetSnapshot } from "../widgets/focus-timer-widget-store";

export function FocusWidgetSync({ user }: { user: User | null }) {
  const accent = useAppAccent();
  const [control, setControl] = useState<{ uid: string; session: StudySession | null } | null>(null);
  const session = control?.uid === user?.uid ? control?.session ?? null : null;
  const [focus, setFocus] = useState<{ uid: string; date: string; day: FocusDay } | null>(null);
  const [now, setNow] = useState(Date.now());
  const supported = Platform.OS === "android" && Constants.appOwnership !== "expo";
  const date = focusDayKey(now, session?.timeZone);
  useEffect(() => {
    if (!supported || !user) { setControl(null); setFocus(null); return; }
    const stopControl = controller.watchStudyControl(getFirebaseFirestore(), user.uid, value => setControl({ uid: user.uid, session: value?.session ?? null }), () => {});
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => { stopControl(); clearInterval(timer); };
  }, [user?.uid, supported]);
  useEffect(() => {
    if (!supported || !user) return;
    return controller.watchStudyFocusDay(getFirebaseFirestore(), user.uid, date, day => setFocus({ uid: user.uid, date, day }), () => {});
  }, [user?.uid, date, supported]);
  useEffect(() => {
    if (!supported || (user && (control?.uid !== user.uid || !focus || focus.uid !== user.uid || focus.date !== date))) return;
    let disposed = false;
    void (async () => {
      const snapshot = user ? { uid: user.uid, date, day: focus?.day ?? emptyFocusDay(), session, accent } : null;
      if (snapshot) await saveFocusWidgetSnapshot(snapshot);
      if (disposed) return;
      const { requestWidgetUpdate } = require("react-native-android-widget");
      const { renderFocusTimerWidget } = require("../widgets/FocusTimerWidget");
      await requestWidgetUpdate({ widgetName: "FocusTimerWidget", renderWidget: () => renderFocusTimerWidget(focusTimerWidgetModel(snapshot, user?.uid)) });
    })().catch(() => {});
    return () => { disposed = true; };
  }, [user?.uid, control?.uid, date, focus, session, accent, Math.floor(now / 60000), supported]);
  return null;
}
